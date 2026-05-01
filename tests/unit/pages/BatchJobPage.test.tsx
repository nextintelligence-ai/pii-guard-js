import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchJobPage } from '@/pages/BatchJobPage';
import { useBatchStore } from '@/state/batchStore';

vi.mock('@/hooks/usePdfDocument', () => ({
  usePdfDocument: () => ({
    load: vi.fn(),
  }),
}));

vi.mock('@/pages/SinglePage', () => ({
  SinglePage: () => <div>단일 편집 화면</div>,
}));

describe('BatchJobPage', () => {
  let root: Root | null = null;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useBatchStore.getState().reset();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    root = null;
    useBatchStore.getState().reset();
  });

  it('job이 있으면 파일명과 일괄 목록 링크를 보여준다', async () => {
    useBatchStore
      .getState()
      .addFiles([new File(['pdf'], 'claim-c.pdf', { type: 'application/pdf' })]);
    const jobId = useBatchStore.getState().jobs[0]!.id;
    const container = document.createElement('div');
    root = createRoot(container);

    await act(async () => {
      root?.render(<BatchJobPage jobId={jobId} />);
    });

    expect(container.textContent).toContain('claim-c.pdf');
    expect(container.textContent).toContain('일괄 목록');
  });

  it('job이 없으면 not-found 메시지를 보여준다', async () => {
    const container = document.createElement('div');
    root = createRoot(container);

    await act(async () => {
      root?.render(<BatchJobPage jobId="missing" />);
    });

    expect(container.textContent).toContain('해당 batch 파일을 찾을 수 없습니다');
  });
});
