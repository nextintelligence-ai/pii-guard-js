import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchReviewDialog } from '@/components/batch/BatchReviewDialog';
import { useBatchStore } from '@/state/batchStore';
import { useAppStore } from '@/state/store';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  applyCurrentDocument: vi.fn(),
}));

vi.mock('@/hooks/usePdfDocument', () => ({
  usePdfDocument: () => ({
    load: mocks.load,
  }),
}));

vi.mock('@/hooks/useApply', () => ({
  applyCurrentDocument: mocks.applyCurrentDocument,
}));

vi.mock('@/pages/SinglePage', () => ({
  SinglePage: ({ embedded }: { embedded?: boolean }) => (
    <div>{embedded ? '임베디드 편집 화면' : '단일 편집 화면'}</div>
  ),
}));

describe('BatchReviewDialog', () => {
  let root: Root | null = null;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useBatchStore.getState().reset();
    useAppStore.getState().reset();
    mocks.load.mockReset();
    mocks.applyCurrentDocument.mockReset();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    root = null;
    useBatchStore.getState().reset();
    useAppStore.getState().reset();
    document.body.innerHTML = '';
  });

  it('loads the selected batch job and renders the embedded editor', async () => {
    const file = new File(['pdf'], 'claim-c.pdf', { type: 'application/pdf' });
    useBatchStore.getState().addFiles([file]);
    const jobId = useBatchStore.getState().jobs[0]!.id;
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <BatchReviewDialog jobId={jobId} open onOpenChange={() => undefined} />,
      );
    });

    expect(document.body.textContent).toContain('claim-c.pdf');
    expect(document.body.textContent).toContain('임베디드 편집 화면');
    expect(mocks.load).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        sourceId: jobId,
        shouldCommit: expect.any(Function),
      }),
    );
  });

  it('invalidates an in-flight load when the dialog closes', async () => {
    const file = new File(['pdf'], 'claim-c.pdf', { type: 'application/pdf' });
    useBatchStore.getState().addFiles([file]);
    const jobId = useBatchStore.getState().jobs[0]!.id;
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <BatchReviewDialog jobId={jobId} open onOpenChange={() => undefined} />,
      );
    });

    const loadOptions = mocks.load.mock.calls[0]?.[1] as
      | { shouldCommit?: () => boolean }
      | undefined;
    expect(loadOptions?.shouldCommit?.()).toBe(true);

    await act(async () => {
      root?.render(
        <BatchReviewDialog
          jobId={jobId}
          open={false}
          onOpenChange={() => undefined}
        />,
      );
    });

    expect(loadOptions?.shouldCommit?.()).toBe(false);
  });

  it('keeps reapply disabled when a same-named document belongs to another job', async () => {
    const file = new File(['pdf'], 'claim-c.pdf', { type: 'application/pdf' });
    useBatchStore.getState().addFiles([file]);
    const jobId = useBatchStore.getState().jobs[0]!.id;
    useAppStore.getState().setDoc({
      kind: 'ready',
      fileName: 'claim-c.pdf',
      sourceId: 'other-job',
      pages: [],
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <BatchReviewDialog jobId={jobId} open onOpenChange={() => undefined} />,
      );
    });

    const reapplyButton = Array.from(document.body.querySelectorAll('button')).find(
      (item) => item.textContent?.includes('다시 적용') === true,
    );
    expect(reapplyButton).toBeDefined();
    expect(reapplyButton).toHaveProperty('disabled', true);

    await act(async () => {
      reapplyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mocks.applyCurrentDocument).not.toHaveBeenCalled();
  });
});
