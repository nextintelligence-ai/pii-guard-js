import { useCallback, useRef, useState } from 'react';
import { detectOcrCandidates } from '@/core/ocr/detect';
import { runBatchJob } from '@/core/batch/runBatchJob';
import { useBatchStore } from '@/state/batchStore';
import { getOcrWorker } from '@/workers/ocrWorkerClient';
import { getPdfWorker } from '@/workers/pdfWorkerClient';
import type { Candidate } from '@/types/domain';
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
            const result = await runBatchJob({
              file: job.file,
              settings: useBatchStore.getState().settings,
              pdf,
              ocrDetectPage: createOcrDetector(pdf),
            });
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
  }, []);

  return { running, start, pause };
}

function createOcrDetector(pdf: Pick<PdfWorkerApi, 'renderPagePng'>) {
  return async (pageIndex: number): Promise<Candidate[]> => {
    const rendered = await pdf.renderPagePng(pageIndex, OCR_RENDER_SCALE);
    const ocr = getOcrWorker();
    const result = await ocr.recognizePng({
      pageIndex,
      png: rendered.png,
    });
    return detectOcrCandidates({
      pageIndex,
      renderScale: rendered.scale,
      lines: result.lines,
    });
  };
}
