import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchPage } from '@/pages/BatchPage';
import { useBatchStore } from '@/state/batchStore';

vi.mock('@/hooks/useBatchRunner', () => ({
  useBatchRunner: () => ({
    running: false,
    start: vi.fn(),
    pause: vi.fn(),
  }),
}));

describe('BatchPage', () => {
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
});
