import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBatchRunner } from '@/hooks/useBatchRunner';
import { useBatchStore } from '@/state/batchStore';
import { runBatchJob } from '@/core/batch/runBatchJob';
import { getPdfWorker } from '@/workers/pdfWorkerClient';

vi.mock('@/workers/pdfWorkerClient', () => ({
  getPdfWorker: vi.fn(),
}));

vi.mock('@/core/batch/runBatchJob', () => ({
  runBatchJob: vi.fn(),
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
    useBatchStore.getState().reset();
    vi.mocked(getPdfWorker).mockResolvedValue({} as Awaited<ReturnType<typeof getPdfWorker>>);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    root = null;
    controls = null;
    useBatchStore.getState().reset();
    vi.clearAllMocks();
  });

  it('queued job을 순서대로 처리하고 첫 실패 후에도 다음 job을 실행한다', async () => {
    const first = new File(['a'], 'a.pdf', { type: 'application/pdf' });
    const second = new File(['b'], 'b.pdf', { type: 'application/pdf' });
    useBatchStore.getState().addFiles([first, second]);
    vi.mocked(runBatchJob)
      .mockResolvedValueOnce({
        status: 'failed',
        candidateCount: 0,
        enabledBoxCount: 0,
        report: null,
        outputBlob: null,
        errorMessage: 'boom',
        needsReview: true,
      })
      .mockResolvedValueOnce({
        status: 'done',
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
      expect.objectContaining({ file: first }),
    );
    expect(runBatchJob).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ file: second }),
    );
    expect(useBatchStore.getState().jobs.map((job) => job.status)).toEqual([
      'failed',
      'done',
    ]);
  });
});
