import { describe, expect, it, vi } from 'vitest';
import { runBatchJob } from '@/core/batch/runBatchJob';
import type { ApplyReport, Candidate } from '@/types/domain';
import type { PdfWorkerApi } from '@/workers/pdf.worker.types';

const page = { index: 0, widthPt: 100, heightPt: 100, rotation: 0 as const };
const report: ApplyReport = {
  totalBoxes: 1,
  byCategory: {
    rrn: 0,
    phone: 0,
    email: 1,
    account: 0,
    businessNo: 0,
    card: 0,
    address: 0,
    private_person: 0,
    private_address: 0,
    private_url: 0,
    private_date: 0,
    secret: 0,
    manual: 0,
  },
  pagesAffected: [0],
  postCheckLeaks: 0,
};

const candidate: Candidate = {
  id: 'auto-1',
  pageIndex: 0,
  bbox: [0, 0, 10, 10],
  text: 'a@example.com',
  category: 'email',
  confidence: 1,
  source: 'auto',
};

function createPdfFake(
  overrides: Partial<Pick<PdfWorkerApi, 'open' | 'detectAll' | 'apply' | 'close' | 'inspectPageContent'>> = {},
) {
  return {
    open: vi.fn().mockResolvedValue({ pages: [page] }),
    detectAll: vi.fn().mockResolvedValue([candidate]),
    apply: vi.fn().mockResolvedValue({
      pdf: new Uint8Array([1, 2, 3]),
      report,
    }),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('runBatchJob', () => {
  it('detectAll 결과만으로 apply를 호출한다', async () => {
    const pdf = createPdfFake();

    const result = await runBatchJob({
      file: new File(['pdf'], 'a.pdf', { type: 'application/pdf' }),
      settings: { useOcr: false, autoApplyNer: false },
      pdf,
    });

    expect(pdf.open).toHaveBeenCalledOnce();
    expect(pdf.detectAll).toHaveBeenCalledWith(0);
    expect(pdf.apply).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'auto-1', enabled: true }),
    ]);
    expect(pdf.close).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status: 'done',
      candidateCount: 1,
      enabledBoxCount: 1,
      report,
    });
    expect(result.outputBlob).toBeInstanceOf(Blob);
  });

  it('post-check 누수가 있으면 warning 상태로 반환한다', async () => {
    const warningReport = { ...report, postCheckLeaks: 2 };
    const pdf = createPdfFake({
      apply: vi.fn().mockResolvedValue({
        pdf: new Uint8Array([1, 2, 3]),
        report: warningReport,
      }),
    });

    const result = await runBatchJob({
      file: new File(['pdf'], 'leak.pdf', { type: 'application/pdf' }),
      settings: { useOcr: false, autoApplyNer: false },
      pdf,
    });

    expect(result).toMatchObject({
      status: 'warning',
      needsReview: true,
      report: warningReport,
    });
  });

  it('한 job 실패는 failed result로 반환하고 close를 호출한다', async () => {
    const pdf = createPdfFake({
      detectAll: vi.fn().mockRejectedValue(new Error('boom')),
    });

    const result = await runBatchJob({
      file: new File(['pdf'], 'broken.pdf', { type: 'application/pdf' }),
      settings: { useOcr: false, autoApplyNer: false },
      pdf,
    });

    expect(result).toMatchObject({
      status: 'failed',
      errorMessage: 'boom',
      needsReview: true,
    });
    expect(pdf.close).toHaveBeenCalledOnce();
  });

  it('OCR이 필요한 페이지에 주입된 OCR 후보를 병합한다', async () => {
    const ocrCandidate: Candidate = {
      ...candidate,
      id: 'ocr-1',
      source: 'ocr',
      text: '010-1234-5678',
      category: 'phone',
    };
    const pdf = createPdfFake({
      inspectPageContent: vi.fn().mockResolvedValue({
        pageIndex: 0,
        pageAreaPt: 10000,
        textCharCount: 0,
        textLineCount: 0,
        textAreaRatio: 0,
        imageAreaRatio: 1,
        imageBlocks: [],
        hasLargeImage: true,
        shouldAutoOcr: true,
      }),
    });
    const ocrDetectPage = vi.fn().mockResolvedValue([ocrCandidate]);

    await runBatchJob({
      file: new File(['pdf'], 'scan.pdf', { type: 'application/pdf' }),
      settings: { useOcr: true, autoApplyNer: false },
      pdf,
      ocrDetectPage,
    });

    expect(ocrDetectPage).toHaveBeenCalledWith(0);
    expect(pdf.apply).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'auto-1' }),
      expect.objectContaining({ id: 'ocr-1' }),
    ]);
  });

  it('주입된 NER 후보를 batch 후보와 자동 적용 대상에 포함한다', async () => {
    const nerCandidate: Candidate = {
      ...candidate,
      id: 'ner-1',
      source: 'ner',
      text: 'Alice Smith',
      category: 'private_person',
      confidence: 0.95,
    };
    const pdf = createPdfFake({
      detectAll: vi.fn().mockResolvedValue([]),
    });
    const nerDetectPage = vi.fn().mockResolvedValue([nerCandidate]);

    const result = await runBatchJob({
      file: new File(['pdf'], 'ner.pdf', { type: 'application/pdf' }),
      settings: { useOcr: false, autoApplyNer: true },
      pdf,
      nerDetectPage,
    });

    expect(nerDetectPage).toHaveBeenCalledWith(0);
    expect(pdf.apply).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'ner-1', source: 'ner', enabled: true }),
    ]);
    expect(result).toMatchObject({
      candidateCount: 1,
      candidates: [expect.objectContaining({ id: 'ner-1', source: 'ner' })],
    });
  });
});
