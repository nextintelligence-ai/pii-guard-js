import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OcrStatus } from '@/components/OcrStatus';
import { useAppStore } from '@/state/store';

describe('OcrStatus', () => {
  let root: Root | null = null;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useAppStore.getState().reset();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    useAppStore.getState().reset();
  });

  it('renders compact progress when OCR is active', async () => {
    useAppStore.getState().setOcrProgress({
      done: 1,
      total: 3,
      currentPage: 1,
      byPage: {
        0: { status: 'done' },
        1: { status: 'running' },
        2: { status: 'queued' },
      },
    });

    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root?.render(<OcrStatus />);
    });

    expect(container.textContent).toContain('OCR 1/3 페이지');
    expect(container.textContent).toContain('p2 처리 중');
  });

  it('renders failed page messages for debugging', async () => {
    useAppStore.getState().setOcrProgress({
      done: 2,
      total: 3,
      currentPage: null,
      byPage: {
        0: { status: 'failed', message: 'worker init failed' },
        1: { status: 'done' },
        2: { status: 'failed', message: 'OCR timeout' },
      },
    });

    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root?.render(<OcrStatus />);
    });

    expect(container.textContent).toContain('실패 2');
    expect(container.textContent).toContain('p1: worker init failed');
    expect(container.textContent).toContain('p3: OCR timeout');
  });

  it('renders nothing before OCR starts', async () => {
    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root?.render(<OcrStatus />);
    });

    expect(container.innerHTML).toBe('');
  });
});
