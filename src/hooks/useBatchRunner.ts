import { useCallback, useRef, useState } from 'react';
import { detectOcrCandidates } from '@/core/ocr/detect';
import { ocrLinesToNerBoxes, ocrLinesToPageText } from '@/core/ocr/ner';
import { runBatchJob } from '@/core/batch/runBatchJob';
import { filterNerEntitiesForText } from '@/core/nerEntityFilter';
import { buildContextualNerMaps } from '@/core/nerContext';
import { entitiesToBoxes, serialize, type NerBox } from '@/core/spanMap';
import { useNerModel } from '@/hooks/useNerModel';
import { useBatchStore } from '@/state/batchStore';
import { createId } from '@/utils/id';
import { getOcrWorker } from '@/workers/ocrWorkerClient';
import { getPdfWorker } from '@/workers/pdfWorkerClient';
import type { Candidate, DetectionCategory } from '@/types/domain';
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
              ocrDetectPage: createOcrDetector(pdf, nerWorker ?? undefined),
            };
            if (nerWorker !== null) {
              batchInput.nerDetectPage = createTextNerDetector(pdf, nerWorker);
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

    const entities = filterNerEntitiesForText(pageText, await nerWorker.classify(pageText));
    const nerBoxes = ocrLinesToNerBoxes({
      renderScale: rendered.scale,
      lines: result.lines,
      entities,
    });
    return [...candidates, ...nerBoxesToCandidates(pageIndex, nerBoxes, 'ocr-ner')];
  };
}

function createTextNerDetector(
  pdf: Pick<PdfWorkerApi, 'extractStructuredText'>,
  nerWorker: NerWorkerApi,
) {
  return async (pageIndex: number): Promise<Candidate[]> => {
    const lines = await pdf.extractStructuredText(pageIndex);
    const pageMap = serialize(lines);
    const boxes: NerBox[] = [];

    if (pageMap.pageText.trim().length > 0) {
      boxes.push(
        ...entitiesToBoxes(
          pageMap,
          filterNerEntitiesForText(pageMap.pageText, await nerWorker.classify(pageMap.pageText)),
        ),
      );
    }

    for (const contextMap of buildContextualNerMaps(lines)) {
      if (contextMap.pageText.trim().length === 0) continue;
      const entities = filterNerEntitiesForText(
        contextMap.pageText,
        await nerWorker.classify(contextMap.pageText),
      );
      boxes.push(
        ...entitiesToBoxes(
          contextMap,
          entities.filter((entity) => entity.entity_group === 'private_person'),
        ),
      );
    }

    return nerBoxesToCandidates(pageIndex, dedupeNerBoxes(boxes), 'ner');
  };
}

function nerBoxesToCandidates(
  pageIndex: number,
  boxes: NerBox[],
  source: Extract<Candidate['source'], 'ner' | 'ocr-ner'>,
): Candidate[] {
  return boxes.map((box) => ({
    id: createId(),
    pageIndex,
    bbox: [
      box.bbox.x,
      box.bbox.y,
      box.bbox.x + box.bbox.w,
      box.bbox.y + box.bbox.h,
    ],
    text: '',
    category: box.category as DetectionCategory,
    confidence: box.score,
    source,
  }));
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
