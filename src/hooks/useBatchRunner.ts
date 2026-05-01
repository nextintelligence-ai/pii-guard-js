import { useCallback, useRef, useState } from 'react';
import { detectOcrCandidates } from '@/core/ocr/detect';
import { ocrLinesToNerBoxes, ocrLinesToPageText } from '@/core/ocr/ner';
import {
  filterOcrNerBoxes,
  nerBoxesToCandidates,
} from '@/core/ocr/nerCandidates';
import { runBatchJob } from '@/core/batch/runBatchJob';
import { filterNerEntitiesForText } from '@/core/nerEntityFilter';
import { buildContextualNerMaps } from '@/core/nerContext';
import {
  logNerDebug,
  summarizeNerEntities,
  summarizeStructuredLines,
} from '@/core/nerDebug';
import { entitiesToBoxes, serialize, type NerBox } from '@/core/spanMap';
import { useNerModel } from '@/hooks/useNerModel';
import { useBatchStore } from '@/state/batchStore';
import { getOcrWorker } from '@/workers/ocrWorkerClient';
import { getPdfWorker } from '@/workers/pdfWorkerClient';
import type { Candidate } from '@/types/domain';
import type { NerWorkerApi } from '@/core/nerWorkerClient';
import type { PdfWorkerApi } from '@/workers/pdf.worker.types';

const OCR_RENDER_SCALE = 2;

export function useBatchRunner(): {
  running: boolean;
  start(): void;
  pause(): void;
} {
  const [running, setRunning] = useState(false);
  const cancelledRef = useRef(false);
  const runningRef = useRef(false);
  const ner = useNerModel();
  const nerWorker = ner.state === 'ready' ? ner.worker : null;

  const pause = useCallback(() => {
    cancelledRef.current = true;
    runningRef.current = false;
    setRunning(false);
  }, []);

  const start = useCallback(() => {
    if (runningRef.current) return;
    cancelledRef.current = false;
    runningRef.current = true;
    setRunning(true);

    void (async () => {
      try {
        while (!cancelledRef.current) {
          const state = useBatchStore.getState();
          const job = state.jobs.find((item) => item.status === 'queued');
          if (!job) break;

          state.updateJob(job.id, {
            status: 'opening',
            errorMessage: null,
            needsReview: false,
          });

          try {
            const pdf = await getPdfWorker();
            if (cancelledRef.current) break;
            useBatchStore.getState().updateJob(job.id, { status: 'detecting' });
            const batchInput: Parameters<typeof runBatchJob>[0] = {
              file: job.file,
              settings: useBatchStore.getState().settings,
              pdf,
              ocrDetectPage: createOcrDetector(pdf, job.file.name, nerWorker ?? undefined),
            };
            if (nerWorker !== null) {
              batchInput.nerDetectPage = createTextNerDetector(pdf, job.file.name, nerWorker);
            }
            const result = await runBatchJob(batchInput);
            useBatchStore.getState().updateJob(job.id, result);
          } catch (error) {
            useBatchStore.getState().updateJob(job.id, {
              status: 'failed',
              errorMessage: error instanceof Error ? error.message : String(error),
              needsReview: true,
            });
          }
        }
      } finally {
        runningRef.current = false;
        setRunning(false);
      }
    })();
  }, [nerWorker]);

  return { running, start, pause };
}

function createOcrDetector(
  pdf: Pick<PdfWorkerApi, 'renderPagePng'>,
  fileName: string,
  nerWorker?: NerWorkerApi,
) {
  return async (pageIndex: number): Promise<Candidate[]> => {
    const rendered = await pdf.renderPagePng(pageIndex, OCR_RENDER_SCALE);
    const ocr = getOcrWorker();
    const result = await ocr.recognizePng({
      pageIndex,
      png: rendered.png,
    });
    const candidates = detectOcrCandidates({
      pageIndex,
      renderScale: rendered.scale,
      lines: result.lines,
    });
    if (nerWorker === undefined) return candidates;

    const { pageText } = ocrLinesToPageText({
      renderScale: rendered.scale,
      lines: result.lines,
    });
    if (pageText.trim().length === 0) return candidates;

    const rawEntities = await nerWorker.classify(pageText);
    const entities = filterNerEntitiesForText(pageText, rawEntities);
    const nerBoxes = ocrLinesToNerBoxes({
      renderScale: rendered.scale,
      lines: result.lines,
      entities,
    });
    logNerDebug('batch ocr classify result', {
      fileName,
      pageIndex,
      pageText,
      rawEntities: summarizeNerEntities(pageText, rawEntities),
      filteredEntities: summarizeNerEntities(pageText, entities),
      droppedEntities: rawEntities.length - entities.length,
      boxes: nerBoxes,
    });
    const ocrNerBoxes = filterOcrNerBoxes({
      pageIndex,
      boxes: nerBoxes,
      primaryCandidates: candidates,
    });
    return [...candidates, ...nerBoxesToCandidates(pageIndex, ocrNerBoxes, 'ocr-ner')];
  };
}

function createTextNerDetector(
  pdf: Pick<PdfWorkerApi, 'extractStructuredText'>,
  fileName: string,
  nerWorker: NerWorkerApi,
) {
  return async (pageIndex: number): Promise<Candidate[]> => {
    const lines = await pdf.extractStructuredText(pageIndex);
    const pageMap = serialize(lines);
    const boxes: NerBox[] = [];
    logNerDebug('batch page text extracted', {
      fileName,
      pageIndex,
      chars: pageMap.pageText.length,
      pageText: pageMap.pageText,
      lines: summarizeStructuredLines(lines),
    });

    if (pageMap.pageText.trim().length > 0) {
      const rawEntities = await nerWorker.classify(pageMap.pageText);
      const entities = filterNerEntitiesForText(pageMap.pageText, rawEntities);
      const pageBoxes = entitiesToBoxes(pageMap, entities);
      logNerDebug('batch page classify result', {
        fileName,
        pageIndex,
        pageText: pageMap.pageText,
        rawEntities: summarizeNerEntities(pageMap.pageText, rawEntities),
        filteredEntities: summarizeNerEntities(pageMap.pageText, entities),
        droppedEntities: rawEntities.length - entities.length,
        boxes: pageBoxes,
      });
      boxes.push(...pageBoxes);
    }

    for (const [contextIndex, contextMap] of buildContextualNerMaps(lines).entries()) {
      if (contextMap.pageText.trim().length === 0) continue;
      logNerDebug('batch context classify input', {
        fileName,
        pageIndex,
        contextIndex,
        chars: contextMap.pageText.length,
        pageText: contextMap.pageText,
      });
      const rawEntities = await nerWorker.classify(contextMap.pageText);
      const entities = filterNerEntitiesForText(contextMap.pageText, rawEntities);
      const contextBoxes = entitiesToBoxes(
        contextMap,
        entities.filter((entity) => entity.entity_group === 'private_person'),
      );
      logNerDebug('batch context classify result', {
        fileName,
        pageIndex,
        contextIndex,
        rawEntities: summarizeNerEntities(contextMap.pageText, rawEntities),
        filteredEntities: summarizeNerEntities(contextMap.pageText, entities),
        boxes: contextBoxes,
      });
      boxes.push(...contextBoxes);
    }

    return nerBoxesToCandidates(pageIndex, dedupeNerBoxes(boxes), 'ner');
  };
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
