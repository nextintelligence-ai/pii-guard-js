import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoDetect } from '@/hooks/useAutoDetect';
import { useAppStore } from '@/state/store';
import type { Candidate } from '@/types/domain';

const { fakePdfWorker } = vi.hoisted(() => {
  const candidate: Candidate = {
    id: 'auto-email-1',
    pageIndex: 0,
    bbox: [10, 10, 80, 20],
    text: 'alice@example.com',
    category: 'email',
    confidence: 1,
    source: 'auto',
  };
  return {
    fakePdfWorker: {
      detectAll: vi.fn().mockResolvedValue([candidate]),
    },
  };
});

vi.mock('@/workers/pdfWorkerClient', () => ({
  getPdfWorker: vi.fn().mockResolvedValue(fakePdfWorker),
}));

async function waitForStore(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('store condition was not met');
}

describe('정규식 자동탐지 플로우', () => {
  let root: Root | null = null;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useAppStore.getState().reset();
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

  it('PDF 워커 문서 오픈 race 로 NO_DOCUMENT_OPEN 이 한 번 나면 detectAll 을 재시도한다', async () => {
    fakePdfWorker.detectAll
      .mockRejectedValueOnce(new Error('NO_DOCUMENT_OPEN'))
      .mockResolvedValueOnce([
        {
          id: 'auto-email-1',
          pageIndex: 0,
          bbox: [10, 10, 80, 20],
          text: 'alice@example.com',
          category: 'email',
          confidence: 1,
          source: 'auto',
        } satisfies Candidate,
      ]);

    function Probe() {
      useAutoDetect();
      return null;
    }

    useAppStore.getState().setDoc({
      kind: 'ready',
      fileName: 'sample.pdf',
      pages: [{ index: 0, widthPt: 100, heightPt: 100, rotation: 0 }],
    });

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });

    await waitForStore(() => useAppStore.getState().candidates.some((c) => c.source === 'auto'));

    expect(fakePdfWorker.detectAll).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().boxes['auto-email-1']).toMatchObject({
      source: 'auto',
      category: 'email',
      enabled: true,
    });
  });

  it('정규식 자동탐지가 끝나도 기존 OCR 후보 메타데이터를 보존한다', async () => {
    function Probe() {
      useAutoDetect();
      return null;
    }

    useAppStore.getState().addOcrCandidates([
      {
        id: 'ocr-phone-1',
        pageIndex: 0,
        bbox: [0, 0, 40, 10],
        text: '010-1234-5678',
        category: 'phone',
        confidence: 0.88,
        source: 'ocr',
      },
    ]);
    useAppStore.getState().setDoc({
      kind: 'ready',
      fileName: 'sample.pdf',
      pages: [{ index: 0, widthPt: 100, heightPt: 100, rotation: 0 }],
    });

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });

    await waitForStore(() => useAppStore.getState().candidates.some((c) => c.source === 'auto'));

    const state = useAppStore.getState();
    expect(state.candidates.map((c) => c.id).sort()).toEqual([
      'auto-email-1',
      'ocr-phone-1',
    ]);
    expect(state.boxes['ocr-phone-1']).toMatchObject({
      source: 'ocr',
      category: 'phone',
      enabled: true,
    });
  });
});
