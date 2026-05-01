import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBatchRunner } from '@/hooks/useBatchRunner';
import { useBatchStore } from '@/state/batchStore';
import { runBatchJob } from '@/core/batch/runBatchJob';
import { getPdfWorker } from '@/workers/pdfWorkerClient';

const { fakeNerWorker } = vi.hoisted(() => ({
  fakeNerWorker: {
    classify: vi.fn(),
    load: vi.fn(),
    unload: vi.fn(),
  },
}));

vi.mock('@/workers/pdfWorkerClient', () => ({
  getPdfWorker: vi.fn(),
}));

vi.mock('@/core/batch/runBatchJob', () => ({
  runBatchJob: vi.fn(),
}));

vi.mock('@/hooks/useNerModel', () => ({
  useNerModel: () => ({
    state: 'ready',
    meta: null,
    worker: fakeNerWorker,
    loadFromUserDir: vi.fn(),
    reset: vi.fn(),
  }),
}));

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('조건을 만족하지 못했습니다');
}

describe('useBatchRunner', () => {
  let root: Root | null = null;
  let controls: ReturnType<typeof useBatchRunner> | null = null;

  function Harness() {
    controls = useBatchRunner();
    return null;
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    localStorage.clear();
    useBatchStore.getState().reset();
    vi.mocked(getPdfWorker).mockResolvedValue({} as Awaited<ReturnType<typeof getPdfWorker>>);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    root = null;
    controls = null;
    localStorage.clear();
    useBatchStore.getState().reset();
    vi.clearAllMocks();
    (console.info as typeof console.info & { mockRestore?: () => void }).mockRestore?.();
  });

  it('queued job을 순서대로 처리하고 첫 실패 후에도 다음 job을 실행한다', async () => {
    const first = new File(['a'], 'a.pdf', { type: 'application/pdf' });
    const second = new File(['b'], 'b.pdf', { type: 'application/pdf' });
    useBatchStore.getState().addFiles([first, second]);
    vi.mocked(runBatchJob)
      .mockResolvedValueOnce({
        status: 'failed',
        candidates: [],
        candidateCount: 0,
        enabledBoxCount: 0,
        report: null,
        outputBlob: null,
        errorMessage: 'boom',
        needsReview: true,
      })
      .mockResolvedValueOnce({
        status: 'done',
        candidates: [],
        candidateCount: 1,
        enabledBoxCount: 1,
        report: null,
        outputBlob: new Blob(['ok'], { type: 'application/pdf' }),
        errorMessage: null,
        needsReview: false,
      });

    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root?.render(<Harness />);
    });

    await act(async () => {
      controls?.start();
    });

    await waitFor(() => useBatchStore.getState().jobs.every((job) => job.status !== 'queued'));

    expect(runBatchJob).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ file: first, nerDetectPage: expect.any(Function) }),
    );
    expect(runBatchJob).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ file: second, nerDetectPage: expect.any(Function) }),
    );
    expect(useBatchStore.getState().jobs.map((job) => job.status)).toEqual([
      'failed',
      'done',
    ]);
  });

  it('batch NER 디버그 플래그가 켜지면 batch 원문과 NER 결과를 남긴다', async () => {
    localStorage.setItem('piiGuard.debugNer', '1');
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const file = new File(['a'], 'batch.pdf', { type: 'application/pdf' });
    const text = '담당자 Alice Smith';
    vi.mocked(getPdfWorker).mockResolvedValue({
      extractStructuredText: vi.fn().mockResolvedValue([
        {
          id: 0,
          spans: [
            {
              id: 0,
              chars: [...text].map((ch, i) => ({
                ch,
                bbox: { x: i * 5, y: 0, w: 5, h: 10 },
              })),
            },
          ],
        },
      ]),
    } as unknown as Awaited<ReturnType<typeof getPdfWorker>>);
    fakeNerWorker.classify.mockResolvedValue([
      {
        entity_group: 'private_person',
        start: 4,
        end: 15,
        score: 0.98,
        word: 'Alice Smith',
      },
    ]);
    vi.mocked(runBatchJob).mockImplementation(async (input) => {
      const candidates = await input.nerDetectPage!(0);
      return {
        status: 'done',
        candidates,
        candidateCount: candidates.length,
        enabledBoxCount: candidates.length,
        report: null,
        outputBlob: new Blob(['ok'], { type: 'application/pdf' }),
        errorMessage: null,
        needsReview: false,
      };
    });
    useBatchStore.getState().addFiles([file]);

    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root?.render(<Harness />);
    });

    await act(async () => {
      controls?.start();
    });

    await waitFor(() => useBatchStore.getState().jobs[0]?.status === 'done');

    expect(consoleInfo).toHaveBeenCalledWith(
      '[NER debug] batch page classify result',
      expect.objectContaining({
        fileName: 'batch.pdf',
        pageIndex: 0,
        pageText: '담당자 Alice Smith',
        rawEntities: [
          expect.objectContaining({
            entity_group: 'private_person',
            word: 'Alice Smith',
            text: 'Alice Smith',
          }),
        ],
        filteredEntities: [
          expect.objectContaining({
            entity_group: 'private_person',
            word: 'Alice Smith',
            text: 'Alice Smith',
          }),
        ],
        boxes: [
          expect.objectContaining({
            category: 'private_person',
          }),
        ],
      }),
    );
  });
});
