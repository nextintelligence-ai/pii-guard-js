import { buildAutoApplyBoxes } from '@/core/batch/buildAutoApplyBoxes';
import { fileToArrayBuffer } from '@/utils/fileIO';
import type { BatchJobStatus, BatchSettings } from '@/state/batchStore';
import type { ApplyReport, Candidate } from '@/types/domain';
import type { PdfWorkerApi } from '@/workers/pdf.worker.types';

type BatchPdfApi = Pick<PdfWorkerApi, 'open' | 'detectAll' | 'apply' | 'close'> &
  Partial<Pick<PdfWorkerApi, 'inspectPageContent'>>;

export type BatchJobRunInput = {
  file: File;
  settings: BatchSettings;
  pdf: BatchPdfApi;
  ocrDetectPage?: (pageIndex: number) => Promise<Candidate[]>;
};

export type BatchJobRunResult = {
  status: Extract<BatchJobStatus, 'done' | 'warning' | 'failed'>;
  candidateCount: number;
  enabledBoxCount: number;
  report: ApplyReport | null;
  outputBlob: Blob | null;
  errorMessage: string | null;
  needsReview: boolean;
};

export async function runBatchJob(input: BatchJobRunInput): Promise<BatchJobRunResult> {
  const candidates: Candidate[] = [];
  const ocrErrors: string[] = [];

  try {
    const buffer = await fileToArrayBuffer(input.file);
    const { pages } = await input.pdf.open(buffer);

    for (const page of pages) {
      candidates.push(...(await input.pdf.detectAll(page.index)));

      if (!input.settings.useOcr || input.ocrDetectPage === undefined) continue;
      const shouldRunOcr =
        input.pdf.inspectPageContent === undefined
          ? true
          : (await input.pdf.inspectPageContent(page.index)).shouldAutoOcr;
      if (!shouldRunOcr) continue;

      try {
        candidates.push(...(await input.ocrDetectPage(page.index)));
      } catch (error) {
        ocrErrors.push(getErrorMessage(error));
      }
    }

    const boxes = buildAutoApplyBoxes(candidates, {
      autoApplyNer: input.settings.autoApplyNer,
    });
    if (boxes.length === 0) {
      return {
        status: 'warning',
        candidateCount: candidates.length,
        enabledBoxCount: 0,
        report: null,
        outputBlob: null,
        errorMessage:
          ocrErrors.length > 0
            ? `OCR 실패: ${ocrErrors.join(', ')}`
            : '자동 적용할 후보가 없습니다.',
        needsReview: true,
      };
    }

    const { pdf, report } = await input.pdf.apply(boxes);
    const blob = new Blob([pdf.buffer as ArrayBuffer], { type: 'application/pdf' });
    const status = report.postCheckLeaks > 0 || ocrErrors.length > 0 ? 'warning' : 'done';

    return {
      status,
      candidateCount: candidates.length,
      enabledBoxCount: boxes.length,
      report,
      outputBlob: blob,
      errorMessage:
        ocrErrors.length > 0
          ? `OCR 실패: ${ocrErrors.join(', ')}`
          : report.postCheckLeaks > 0
            ? `검증 누수 ${report.postCheckLeaks}건`
            : null,
      needsReview: status === 'warning',
    };
  } catch (error) {
    return {
      status: 'failed',
      candidateCount: candidates.length,
      enabledBoxCount: 0,
      report: null,
      outputBlob: null,
      errorMessage: getErrorMessage(error),
      needsReview: true,
    };
  } finally {
    await input.pdf.close().catch(() => undefined);
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
