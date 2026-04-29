import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNerDetect } from '@/hooks/useNerDetect';
import { useAppStore } from '@/state/store';
import type { StructuredLine } from '@/core/spanMap';

const { fakeWorker, fakePdfWorker } = vi.hoisted(() => {
  const text = 'My name is Alice Smith';
  const chars = [...text].map((ch, i) => ({
    ch,
    bbox: { x: i * 5, y: 0, w: 5, h: 10 },
  }));
  const lines: StructuredLine[] = [{ id: 0, spans: [{ id: 0, chars }] }];
  return {
    fakeWorker: {
      classify: vi.fn().mockResolvedValue([
        {
          entity_group: 'private_person',
          start: 11,
          end: 22,
          score: 0.99,
          word: 'Alice Smith',
        },
      ]),
      load: vi.fn(),
      unload: vi.fn(),
    },
    fakePdfWorker: {
      extractStructuredText: vi.fn().mockResolvedValue(lines),
    },
  };
});

vi.mock('@/hooks/useNerModel', () => ({
  useNerModel: () => ({
    state: 'ready',
    meta: null,
    worker: fakeWorker,
    loadFromUserDir: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock('@/workers/pdfWorkerClient', () => ({
  getPdfWorker: vi.fn().mockResolvedValue(fakePdfWorker),
}));

async function waitForStore(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('store condition was not met');
}

describe('NER 플로우 통합', () => {
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

  it('영문 페이지에서 mock 워커가 반환한 entity 가 store 의 NER 후보로 들어간다', async () => {
    function Probe() {
      useNerDetect(1, 0);
      return null;
    }

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });

    await waitForStore(() => useAppStore.getState().nerProgress.done === 1);

    const state = useAppStore.getState();
    const candidate = state.candidates.find((c) => c.source === 'ner');
    expect(candidate).toMatchObject({
      pageIndex: 0,
      category: 'private_person',
      confidence: 0.99,
      source: 'ner',
    });
    expect(Object.values(state.boxes)).toHaveLength(1);
    expect(Object.values(state.boxes)[0]).toMatchObject({
      source: 'ner',
      category: 'private_person',
      enabled: false,
      bbox: [55, 0, 110, 10],
    });
  });
});
