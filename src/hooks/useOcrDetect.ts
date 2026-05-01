import { useEffect } from 'react';
import { detectOcrCandidates } from '@/core/ocr/detect';
import { removeDuplicateOcrCandidates } from '@/core/ocr/dedupe';
import { ocrLinesToNerBoxes, ocrLinesToPageText } from '@/core/ocr/ner';
import { filterNerEntitiesForText } from '@/core/nerEntityFilter';
import { useAppStore } from '@/state/store';
import { useNerModel } from './useNerModel';
import { getOcrWorker } from '@/workers/ocrWorkerClient';
import { getPdfWorker } from '@/workers/pdfWorkerClient';
import type { OcrLine } from '@/core/ocr/types';
import type { NerBox } from '@/core/spanMap';

const OCR_RENDER_SCALE = 2;

type OcrDetectOptions = {
  auto?: boolean;
};

export function useOcrDetect(options: OcrDetectOptions = {}): void {
  const auto = options.auto ?? true;
  const doc = useAppStore((s) => s.doc);
  const docEpoch = useAppStore((s) => s.docEpoch);
  const currentPage = useAppStore((s) => s.currentPage);
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
    const pages = [...doc.pages].sort((a, b) => {
      if (a.index === currentPage) return -1;
      if (b.index === currentPage) return 1;
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
          const ocrNerBoxes =
            canRunNer && nerWorker
              ? await detectOcrNerBoxes(
                  {
                    renderScale: rendered.scale,
                    lines: result.lines,
                  },
                  nerWorker,
                  isStaleJob,
                )
              : [];
          if (isStaleJob()) return;
          const state = useAppStore.getState();
          const existingCandidates = state.candidates.filter(
            (candidate) => candidate.source !== 'ocr' && candidate.source !== 'ocr-ner',
          );
          const candidates = removeDuplicateOcrCandidates(ocrCandidates, existingCandidates);
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
  }, [auto, doc, docEpoch, currentPage, ocrRequest, nerState, nerWorker]);
}

async function detectOcrNerBoxes(
  input: {
    renderScale: number;
    lines: OcrLine[];
  },
  nerWorker: NonNullable<ReturnType<typeof useNerModel>['worker']>,
  isStaleJob: () => boolean,
): Promise<NerBox[]> {
  const { pageText } = ocrLinesToPageText(input);
  if (pageText.trim().length === 0) return [];
  const entities = filterNerEntitiesForText(pageText, await nerWorker.classify(pageText));
  if (isStaleJob()) return [];
  return ocrLinesToNerBoxes({ ...input, entities });
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
