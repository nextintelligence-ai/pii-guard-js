import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoxOverlay } from '@/components/BoxOverlay';
import { useAppStore } from '@/state/store';

const { fakePdfWorker } = vi.hoisted(() => ({
  fakePdfWorker: {
    extractSpans: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/workers/pdfWorkerClient', () => ({
  getPdfWorker: vi.fn().mockResolvedValue(fakePdfWorker),
}));

describe('BoxOverlay', () => {
  let root: Root | null = null;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useAppStore.getState().reset();
    useAppStore.getState().setDoc({
      kind: 'ready',
      fileName: 'sample.pdf',
      pages: [{ index: 0, widthPt: 100, heightPt: 100, rotation: 0 }],
    });
    vi.clearAllMocks();
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

  it('NER 박스는 SVG 기본 검은 fill 대신 투명 fill 을 명시한다', async () => {
    useAppStore.getState().addNerCandidates(0, [
      { category: 'private_person', bbox: { x: 10, y: 20, w: 30, h: 10 }, score: 0.99 },
    ]);
    useAppStore.getState().toggleCategory('private_person');

    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root?.render(<BoxOverlay widthPx={100} heightPx={100} scale={1} />);
    });

    const boxRect = container.querySelector('svg > rect');
    expect(boxRect?.getAttribute('fill')).toBe('transparent');
  });

  it('OCR 박스도 카테고리 색상을 사용한다', async () => {
    useAppStore.getState().addOcrCandidates([
      {
        id: 'ocr-rrn-1',
        pageIndex: 0,
        bbox: [10, 20, 40, 30],
        text: '801129-1031511',
        category: 'rrn',
        confidence: 1,
        source: 'ocr',
      },
    ]);

    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root?.render(<BoxOverlay widthPx={100} heightPx={100} scale={1} />);
    });

    const boxRect = container.querySelector('svg > rect');
    expect(boxRect?.getAttribute('fill')).toBe('rgba(220,38,38,0.35)');
  });
});
