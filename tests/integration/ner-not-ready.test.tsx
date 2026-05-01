import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNerDetect } from '@/hooks/useNerDetect';
import { useAppStore } from '@/state/store';
import { getPdfWorker } from '@/workers/pdfWorkerClient';

vi.mock('@/hooks/useNerModel', () => ({
  useNerModel: () => ({
    state: 'idle',
    meta: null,
    worker: null,
    loadFromUserDir: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock('@/workers/pdfWorkerClient', () => ({
  getPdfWorker: vi.fn(),
}));

describe('NER 미준비 상태', () => {
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
    vi.restoreAllMocks();
  });

  it('모델이 ready 가 아니면 분석 대기 사유를 콘솔에 남기고 PDF worker 를 호출하지 않는다', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    function Probe() {
      useNerDetect(1, 0);
      return null;
    }

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });

    expect(info).toHaveBeenCalledWith(
      '[useNerDetect] NER 분석 대기',
      expect.objectContaining({
        reason: 'model-not-ready',
        nerState: 'idle',
        hasWorker: false,
        pageCount: 1,
      }),
    );
    expect(getPdfWorker).not.toHaveBeenCalled();
  });
});
