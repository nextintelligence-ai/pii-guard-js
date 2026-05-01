import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HomePage } from '@/pages/HomePage';

describe('HomePage', () => {
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

  it('단일 처리와 여러 PDF 자동 처리 시작 영역을 보여준다', async () => {
    const container = document.createElement('div');
    root = createRoot(container);

    await act(async () => {
      root?.render(<HomePage />);
    });

    expect(container.textContent).toContain('단일 PDF 처리');
    expect(container.textContent).toContain('여러 PDF 자동 처리');
  });
});
