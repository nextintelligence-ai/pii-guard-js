import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchPage } from '@/pages/BatchPage';
import { useBatchStore } from '@/state/batchStore';
import { usePendingFileStore } from '@/state/pendingFileStore';

vi.mock('@/hooks/useBatchRunner', () => ({
  useBatchRunner: () => ({
    running: false,
    start: vi.fn(),
    pause: vi.fn(),
  }),
}));

vi.mock('@/components/batch/BatchReviewDialog', () => ({
  BatchReviewDialog: ({
    jobId,
    open,
  }: {
    jobId: string | null;
    open: boolean;
    onOpenChange(open: boolean): void;
  }) => (open ? <div>검수 팝업 {jobId}</div> : null),
}));

describe('BatchPage', () => {
  let root: Root | null = null;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useBatchStore.getState().reset();
    usePendingFileStore.getState().reset();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    root = null;
    useBatchStore.getState().reset();
    usePendingFileStore.getState().reset();
  });

  it('일괄 처리 액션과 설정을 보여준다', async () => {
    const container = document.createElement('div');
    root = createRoot(container);

    await act(async () => {
      root?.render(<BatchPage />);
    });

    expect(container.textContent).toContain('PDF 추가');
    expect(container.textContent).toContain('처리 시작');
    expect(container.textContent).toContain('OCR 사용');
    expect(container.textContent).toContain('NER 후보도 자동 적용');
  });

  it('검수 버튼을 누르면 batch 화면 안에서 검수 팝업을 연다', async () => {
    const file = new File(['pdf'], 'claim-c.pdf', { type: 'application/pdf' });
    const container = document.createElement('div');
    root = createRoot(container);

    await act(async () => {
      root?.render(<BatchPage />);
    });

    await act(async () => {
      useBatchStore.getState().addFiles([file]);
    });
    const jobId = useBatchStore.getState().jobs[0]!.id;
    await act(async () => {
      useBatchStore.getState().updateJob(jobId, { status: 'warning' });
    });

    const button = Array.from(container.querySelectorAll('button')).find(
      (item) => item.textContent?.includes('검수') === true,
    );
    expect(button).toBeDefined();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain(`검수 팝업 ${jobId}`);
  });

  it('일괄 처리 진입 시 기존 큐를 초기화하고 pending 파일만 추가한다', async () => {
    useBatchStore
      .getState()
      .addFiles([new File(['old'], 'old.pdf', { type: 'application/pdf' })]);
    const pending = new File(['new'], 'new.pdf', { type: 'application/pdf' });
    usePendingFileStore.getState().setBatchFiles([pending]);
    const container = document.createElement('div');
    root = createRoot(container);

    await act(async () => {
      root?.render(<BatchPage />);
    });

    const jobs = useBatchStore.getState().jobs;
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.fileName).toBe('new.pdf');
    expect(container.textContent).toContain('new.pdf');
    expect(container.textContent).not.toContain('old.pdf');
    expect(usePendingFileStore.getState().consumeBatchFiles()).toEqual([]);
  });
});
