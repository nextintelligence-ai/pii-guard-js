import { useEffect, useRef } from 'react';
import { useAppStore } from '@/state/store';
import { NerDispatcher } from '@/core/nerDispatcher';
import {
  serialize,
  entitiesToBoxes,
  type NerBox,
  type StructuredLine,
} from '@/core/spanMap';
import { buildContextualNerMaps } from '@/core/nerContext';
import { filterNerEntitiesForText } from '@/core/nerEntityFilter';
import {
  logNerDebug,
  summarizeNerEntities,
  summarizeStructuredLines,
} from '@/core/nerDebug';
import { useNerModel } from './useNerModel';
import { getPdfWorker } from '@/workers/pdfWorkerClient';

/**
 * NER 디스패처를 페이지 큐와 NER 워커, store 에 연결한다.
 *
 * - NER 모델이 ready 가 아니면 아무것도 하지 않는다 (기본 빌드에서는 항상 idle).
 * - 모델이 ready 되면 NerDispatcher 로 전 페이지 큐를 만들고 한 페이지씩 순차 처리.
 * - currentPage 가 바뀌면 해당 페이지의 우선순위를 끌어올려 사용자가 보고 있는
 *   페이지를 먼저 분석한다.
 * - cleanup 시 dispatcher 를 cancel + cancelled flag 로 진행 중 await 의 결과를 무시.
 */
export function useNerDetect(pageCount: number, currentPage: number): void {
  const ner = useNerModel();
  const setProgress = useAppStore((s) => s.setNerProgress);
  const addCandidates = useAppStore((s) => s.addNerCandidates);
  const docEpoch = useAppStore((s) => s.docEpoch);
  const dispatcherRef = useRef<NerDispatcher | null>(null);
  const nerWorker = ner.worker;
  const nerState = ner.state;

  useEffect(() => {
    if (nerState !== 'ready' || !nerWorker || pageCount === 0) {
      console.info('[useNerDetect] NER 분석 대기', {
        reason: pageCount === 0 ? 'no-pages' : 'model-not-ready',
        nerState,
        hasWorker: nerWorker !== null,
        pageCount,
        currentPage,
      });
      return;
    }
    const d = new NerDispatcher();
    d.enqueueAll(pageCount);
    dispatcherRef.current = d;
    setProgress(d.progress());
    console.info('[useNerDetect] NER 분석 큐 시작', { pageCount, currentPage });
    let cancelled = false;
    const isStaleJob = (): boolean =>
      cancelled ||
      useAppStore.getState().docEpoch !== docEpoch ||
      useAppStore.getState().doc.kind !== 'ready';

    void (async () => {
      while (!cancelled) {
        const p = d.next();
        if (p === null) break;
        const pageStartedAt = performance.now();
        console.info(`[useNerDetect] page ${p} 시작`);
        try {
          const pdfWorkerStartedAt = performance.now();
          const api = await traceStage(p, 'pdf worker 준비', getPdfWorker(), isStaleJob);
          if (isStaleJob()) return;
          console.info(`[useNerDetect] page ${p} pdf worker 준비 완료`, {
            ms: elapsedMs(pdfWorkerStartedAt),
          });
          const textStartedAt = performance.now();
          const lines = await extractStructuredTextWithRetry(api, p, isStaleJob);
          if (lines === null || isStaleJob()) return;
          const map = serialize(lines);
          console.info(`[useNerDetect] page ${p} 텍스트 추출 완료`, {
            lines: lines.length,
            chars: map.pageText.length,
            ms: elapsedMs(textStartedAt),
          });
          logNerDebug('page text extracted', {
            pageIndex: p,
            chars: map.pageText.length,
            pageText: map.pageText,
            lines: summarizeStructuredLines(lines),
          });
          const classifyStartedAt = performance.now();
          const rawEnts = await traceStage(
            p,
            'classify',
            nerWorker.classify(map.pageText),
            isStaleJob,
          );
          if (isStaleJob()) return;
          const ents = filterNerEntitiesForText(map.pageText, rawEnts);
          console.info(`[useNerDetect] page ${p} classify 완료`, {
            entities: ents.length,
            ms: elapsedMs(classifyStartedAt),
          });
          const baseBoxes = entitiesToBoxes(map, ents);
          logNerDebug('page classify result', {
            pageIndex: p,
            rawEntities: summarizeNerEntities(map.pageText, rawEnts),
            filteredEntities: summarizeNerEntities(map.pageText, ents),
            droppedEntities: rawEnts.length - ents.length,
          });
          const contextualBoxes = await classifyContextualMaps(
            p,
            lines,
            nerWorker,
            isStaleJob,
          );
          if (isStaleJob()) return;
          const boxes = dedupeNerBoxes([...baseBoxes, ...contextualBoxes]);
          logNerDebug('page boxes', {
            pageIndex: p,
            baseBoxes,
            contextualBoxes,
            boxes,
          });
          addCandidates(p, boxes);
          d.markDone(p);
          setProgress(d.progress());
          console.info(`[useNerDetect] page ${p} 완료`, {
            boxes: boxes.length,
            chars: map.pageText.length,
            entities: ents.length,
            ms: elapsedMs(pageStartedAt),
          });
        } catch (e) {
          if (isStaleJob()) return;
          // 한 페이지 실패가 전체 파이프라인을 죽이지 않도록 markDone 처리.
          console.warn(`[useNerDetect] page ${p} 실패:`, e);
          d.markDone(p);
          setProgress(d.progress());
        }
      }
    })();

    return () => {
      cancelled = true;
      d.cancel();
      dispatcherRef.current = null;
    };
  }, [nerState, nerWorker, pageCount, addCandidates, setProgress, docEpoch]);

  useEffect(() => {
    dispatcherRef.current?.bumpPriority(currentPage);
  }, [currentPage]);
}

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

async function classifyContextualMaps(
  pageIndex: number,
  lines: StructuredLine[],
  nerWorker: NonNullable<ReturnType<typeof useNerModel>['worker']>,
  isStaleJob: () => boolean,
): Promise<NerBox[]> {
  const maps = buildContextualNerMaps(lines);
  if (maps.length === 0) return [];

  const boxes: NerBox[] = [];
  let entityCount = 0;
  const startedAt = performance.now();
  for (const [contextIndex, map] of maps.entries()) {
    if (isStaleJob()) return [];
    logNerDebug('context classify input', {
      pageIndex,
      contextIndex,
      chars: map.pageText.length,
      pageText: map.pageText,
    });
    const rawEnts = await traceStage(
      pageIndex,
      '문맥 classify',
      nerWorker.classify(map.pageText),
      isStaleJob,
    );
    if (isStaleJob()) return [];
    const ents = filterNerEntitiesForText(map.pageText, rawEnts);
    entityCount += ents.length;
    const contextBoxes = entitiesToBoxes(
      map,
      ents.filter((entity) => entity.entity_group === 'private_person'),
    );
    logNerDebug('context classify result', {
      pageIndex,
      contextIndex,
      rawEntities: summarizeNerEntities(map.pageText, rawEnts),
      filteredEntities: summarizeNerEntities(map.pageText, ents),
      boxes: contextBoxes,
    });
    boxes.push(...contextBoxes);
  }
  console.info(`[useNerDetect] page ${pageIndex} 문맥 NER 완료`, {
    contexts: maps.length,
    entities: entityCount,
    boxes: boxes.length,
    ms: elapsedMs(startedAt),
  });
  return boxes;
}

function dedupeNerBoxes(boxes: NerBox[]): NerBox[] {
  const byKey = new Map<string, NerBox>();
  for (const box of boxes) {
    const key = [
      box.category,
      Math.round(box.bbox.x * 10),
      Math.round(box.bbox.y * 10),
      Math.round(box.bbox.w * 10),
      Math.round(box.bbox.h * 10),
    ].join(':');
    const prev = byKey.get(key);
    if (!prev || box.score > prev.score) byKey.set(key, box);
  }
  return [...byKey.values()];
}

async function traceStage<T>(
  pageIndex: number,
  stage: string,
  promise: Promise<T>,
  isStaleJob: () => boolean = () => false,
): Promise<T> {
  const startedAt = performance.now();
  const warningId = setTimeout(() => {
    if (isStaleJob()) return;
    console.warn(`[useNerDetect] page ${pageIndex} ${stage} 10초 이상 대기 중`, {
      ms: elapsedMs(startedAt),
    });
  }, 10_000);
  try {
    return await promise;
  } finally {
    clearTimeout(warningId);
  }
}

async function extractStructuredTextWithRetry(
  api: Awaited<ReturnType<typeof getPdfWorker>>,
  pageIndex: number,
  isStaleJob: () => boolean,
): Promise<StructuredLine[] | null> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (isStaleJob()) return null;
    try {
      return await traceStage(
        pageIndex,
        '텍스트 추출',
        api.extractStructuredText(pageIndex),
        isStaleJob,
      );
    } catch (e) {
      if (isStaleJob()) return null;
      if (!isNoDocumentOpenError(e) || attempt === maxAttempts) throw e;
      console.info(`[useNerDetect] page ${pageIndex} PDF 문서가 아직 열리지 않아 재시도합니다.`, {
        attempt,
        maxAttempts,
      });
      await delay(100 * attempt);
    }
  }
  throw new Error('unreachable');
}

function isNoDocumentOpenError(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e);
  return message.includes('NO_DOCUMENT_OPEN');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
