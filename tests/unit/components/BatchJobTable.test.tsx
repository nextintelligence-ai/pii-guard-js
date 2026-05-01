import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchJobTable } from '@/components/batch/BatchJobTable';
import type { BatchJob } from '@/state/batchStore';

function createJob(patch: Partial<BatchJob> = {}): BatchJob {
  const file = new File(['pdf'], 'sample.pdf', { type: 'application/pdf' });
  return {
    id: 'job-1',
    file,
    fileName: file.name,
    status: 'queued',
    candidateCount: 0,
    enabledBoxCount: 0,
    report: null,
    outputBlob: null,
    errorMessage: null,
    needsReview: false,
    ...patch,
  };
}

describe('BatchJobTable', () => {
  let root: Root | null = null;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    root = null;
  });

  it('shows loading feedback for a running batch job', async () => {
    const container = document.createElement('div');
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <BatchJobTable jobs={[createJob({ status: 'detecting' })]} onReview={vi.fn()} />,
      );
    });

    expect(container.textContent).toContain('개인정보 후보 탐지 중...');
    expect(container.querySelector('[aria-label="처리 중"]')).not.toBeNull();
  });

  it('does not show loading feedback for a queued batch job', async () => {
    const container = document.createElement('div');
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <BatchJobTable jobs={[createJob({ status: 'queued' })]} onReview={vi.fn()} />,
      );
    });

    expect(container.textContent).not.toContain('개인정보 후보 탐지 중...');
    expect(container.querySelector('[aria-label="처리 중"]')).toBeNull();
  });

  it('calls onReview when the review button is clicked', async () => {
    const onReview = vi.fn();
    const container = document.createElement('div');
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <BatchJobTable
          jobs={[createJob({ id: 'job-review', status: 'warning' })]}
          onReview={onReview}
        />,
      );
    });

    const button = Array.from(container.querySelectorAll('button')).find(
      (item) => item.textContent?.includes('검수') === true,
    );
    expect(button).toBeDefined();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onReview).toHaveBeenCalledWith('job-review');
  });
});
