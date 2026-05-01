import { useEffect } from 'react';
import { detectOcrCandidates } from '@/core/ocr/detect';
import { removeDuplicateOcrCandidates } from '@/core/ocr/dedupe';
import { ocrLinesToNerBoxes, ocrLinesToPageText } from '@/core/ocr/ner';
import { filterOcrNerBoxes } from '@/core/ocr/nerCandidates';
import { filterNerEntitiesForText } from '@/core/nerEntityFilter';
import { logNerDebug, summarizeNerEntities } from '@/core/nerDebug';
import { useAppStore } from '@/state/store';
import { useNerModel } from './useNerModel';
import { getOcrWorker } from '@/workers/ocrWorkerClient';
import { getPdfWorker } from '@/workers/pdfWorkerClient';
import type { OcrLine } from '@/core/ocr/types';
import type { NerBox } from '@/core/spanMap';

const OCR_RENDER_SCALE = 2;
const KNOWN_OCR_NER_RUNTIME_FAILURE_PATTERNS = [
  'GatherBlockQuantized',
  'NormalizeDispatchGroupSize Invalid dispatch group size',
];

type OcrDetectOptions = {
  auto?: boolean;
};

type OcrNerDetectResult = {
  boxes: NerBox[];
  disableForRun: boolean;
};

export function useOcrDetect(options: OcrDetectOptions = {}): void {
  const auto = options.auto ?? true;
  const doc = useAppStore((s) => s.doc);
  const docEpoch = useAppStore((s) => s.docEpoch);
  const ocrRequest = useAppStore((s) => s.ocrRequest);
  const ner = useNerModel();
  const nerState = ner.state;
  const nerWorker = ner.worker;

  useEffect(() => {
    if (doc.kind !== 'ready') return;
    let cancelled = false;
    const request = ocrRequest;
    const requestNonce = request.kind === 'idle' ? null : request.nonce;
    const forcedPages =
      request.kind === 'page'
        ? new Set([request.pageIndex])
        : request.kind === 'all'
          ? new Set(doc.pages.map((page) => page.index))
          : new Set<number>();
    const priorityPage = useAppStore.getState().currentPage;
    const pages = [...doc.pages].sort((a, b) => {
      if (a.index === priorityPage) return -1;
      if (b.index === priorityPage) return 1;
      return a.index - b.index;
    });
    const isStaleJob = (): boolean =>
      cancelled ||
      useAppStore.getState().docEpoch !== docEpoch ||
      useAppStore.getState().doc.kind !== 'ready';
    const canRunNer = nerState === 'ready' && nerWorker !== null;

    void (async () => {
      const pdf = await getPdfWorker();
      if (isStaleJob()) return;
      const targets: number[] = [];

      for (const page of pages) {
        if (isStaleJob()) return;
        const force = forcedPages.has(page.index);
        const alreadyHasOcr = useAppStore
          .getState()
          .candidates.some((candidate) => candidate.source === 'ocr' && candidate.pageIndex === page.index);
        const alreadyHasOcrNer = useAppStore
          .getState()
          .candidates.some(
            (candidate) => candidate.source === 'ocr-ner' && candidate.pageIndex === page.index,
          );
        if (force) {
          targets.push(page.index);
          continue;
        }
        if (alreadyHasOcr) {
          if (auto && canRunNer && !alreadyHasOcrNer) targets.push(page.index);
          continue;
        }
        if (!auto) continue;
        const profile = await pdf.inspectPageContent(page.index);
        if (profile.shouldAutoOcr) targets.push(profile.pageIndex);
      }

      if (targets.length === 0 || isStaleJob()) {
        if (requestNonce !== null) useAppStore.getState().clearOcrRequest(requestNonce);
        return;
      }

      const ocr = getOcrWorker();
      useAppStore.getState().setOcrProgress({
        done: 0,
        total: targets.length,
        currentPage: null,
        byPage: Object.fromEntries(
          targets.map((pageIndex) => [pageIndex, { status: 'queued' as const }]),
        ),
      });

      let done = 0;
      let ocrNerDisabledForRun = false;
      for (const pageIndex of targets) {
        if (isStaleJob()) return;
        useAppStore.getState().setOcrProgress({
          ...useAppStore.getState().ocrProgress,
          done,
          currentPage: pageIndex,
          byPage: {
            ...useAppStore.getState().ocrProgress.byPage,
            [pageIndex]: { status: 'running' },
          },
        });

        try {
          const rendered = await pdf.renderPagePng(pageIndex, OCR_RENDER_SCALE);
          const result = await ocr.recognizePng({
            pageIndex,
            png: rendered.png,
          });
          const ocrCandidates = detectOcrCandidates({
            pageIndex,
            renderScale: rendered.scale,
            lines: result.lines,
          });
          const ocrNer =
            canRunNer && nerWorker && !ocrNerDisabledForRun
              ? await detectOcrNerBoxes(
                  {
                    pageIndex,
                    renderScale: rendered.scale,
                    lines: result.lines,
                  },
                  nerWorker,
                  isStaleJob,
                )
              : { boxes: [], disableForRun: false };
          if (ocrNer.disableForRun) ocrNerDisabledForRun = true;
          if (isStaleJob()) return;
          const state = useAppStore.getState();
          const existingCandidates = state.candidates.filter(
            (candidate) => candidate.source !== 'ocr' && candidate.source !== 'ocr-ner',
          );
          const candidates = removeDuplicateOcrCandidates(ocrCandidates, existingCandidates);
          const ocrNerBoxes = filterOcrNerBoxes({
            pageIndex,
            boxes: ocrNer.boxes,
            primaryCandidates: [...existingCandidates, ...candidates],
          });
          state.addOcrCandidates(candidates, [pageIndex]);
          state.addOcrNerCandidates(pageIndex, ocrNerBoxes);
          logOcrSuccess({
            pageIndex,
            lines: result.lines.length,
            candidates: candidates.length,
            nerCandidates: ocrNerBoxes.length,
            textLines: result.lines.map((line) => line.text),
            renderScale: rendered.scale,
            runtime: result.runtime,
            metrics: result.metrics,
          });
          done += 1;
          state.setOcrProgress({
            ...state.ocrProgress,
            done,
            currentPage: null,
            byPage: {
              ...state.ocrProgress.byPage,
              [pageIndex]: { status: 'done' },
            },
          });
        } catch (error) {
          const message = getErrorMessage(error);
          logOcrFailure({ pageIndex, message });
          const state = useAppStore.getState();
          done += 1;
          state.setOcrProgress({
            ...state.ocrProgress,
            done,
            currentPage: null,
            byPage: {
              ...state.ocrProgress.byPage,
              [pageIndex]: {
                status: 'failed',
                message,
              },
            },
          });
        }
      }

      if (requestNonce !== null) useAppStore.getState().clearOcrRequest(requestNonce);
    })();

    return () => {
      cancelled = true;
    };
  }, [auto, doc, docEpoch, ocrRequest, nerState, nerWorker]);
}

async function detectOcrNerBoxes(
  input: {
    pageIndex: number;
    renderScale: number;
    lines: OcrLine[];
  },
  nerWorker: NonNullable<ReturnType<typeof useNerModel>['worker']>,
  isStaleJob: () => boolean,
): Promise<OcrNerDetectResult> {
  const { pageText } = ocrLinesToPageText(input);
  if (pageText.trim().length === 0) return { boxes: [], disableForRun: false };
  let rawEntities;
  try {
    rawEntities = await nerWorker.classify(pageText);
  } catch (error) {
    const message = getErrorMessage(error);
    if (isKnownOcrNerRuntimeFailure(message)) {
      logOcrNerDisabled({ pageIndex: input.pageIndex, message });
      return { boxes: [], disableForRun: true };
    }
    logOcrNerFailure({ pageIndex: input.pageIndex, message });
    return { boxes: [], disableForRun: false };
  }
  const entities = filterNerEntitiesForText(pageText, rawEntities);
  if (isStaleJob()) return { boxes: [], disableForRun: false };
  const boxes = ocrLinesToNerBoxes({ ...input, entities });
  logNerDebug('ocr classify result', {
    pageIndex: input.pageIndex,
    pageText,
    rawEntities: summarizeNerEntities(pageText, rawEntities),
    filteredEntities: summarizeNerEntities(pageText, entities),
    droppedEntities: rawEntities.length - entities.length,
    boxes,
  });
  return { boxes, disableForRun: false };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function logOcrSuccess(details: {
  pageIndex: number;
  lines: number;
  candidates: number;
  nerCandidates?: number;
  textLines?: string[];
  renderScale?: number;
  runtime?: unknown;
  metrics?: unknown;
  recovered?: boolean;
  reason?: string;
}): void {
  const payload: Record<string, unknown> = {
    page: details.pageIndex + 1,
    pageIndex: details.pageIndex,
    lines: details.lines,
    candidates: details.candidates,
  };
  if (details.nerCandidates !== undefined) payload.nerCandidates = details.nerCandidates;
  if (details.renderScale !== undefined) payload.renderScale = details.renderScale;
  if (details.textLines !== undefined) {
    payload.textLines = details.textLines;
    payload.text = details.textLines.join('\n');
  }
  if (details.runtime !== undefined) payload.runtime = details.runtime;
  if (details.metrics !== undefined) payload.metrics = details.metrics;
  if (details.recovered !== undefined) payload.recovered = details.recovered;
  if (details.reason !== undefined) payload.reason = details.reason;
  console.info('[useOcrDetect] OCR 성공', payload);
}

function logOcrFailure(details: { pageIndex: number; message: string }): void {
  console.warn('[useOcrDetect] OCR 실패', {
    page: details.pageIndex + 1,
    pageIndex: details.pageIndex,
    message: details.message,
  });
}

function logOcrNerFailure(details: { pageIndex: number; message: string }): void {
  console.warn('[useOcrDetect] OCR-NER 실패', {
    page: details.pageIndex + 1,
    pageIndex: details.pageIndex,
    message: details.message,
  });
}

function logOcrNerDisabled(details: { pageIndex: number; message: string }): void {
  console.info('[useOcrDetect] OCR-NER 비활성화', {
    page: details.pageIndex + 1,
    pageIndex: details.pageIndex,
    message: details.message,
  });
}

function isKnownOcrNerRuntimeFailure(message: string): boolean {
  return KNOWN_OCR_NER_RUNTIME_FAILURE_PATTERNS.some((pattern) => message.includes(pattern));
}
