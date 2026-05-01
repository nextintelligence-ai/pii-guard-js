import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NerProgress } from '@/components/NerProgress';
import { useNerModelStore } from '@/hooks/useNerModel';
import { useAppStore } from '@/state/store';

describe('NerProgress', () => {
  let root: Root | null = null;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    localStorage.clear();
    useAppStore.getState().reset();
    useNerModelStore.setState({
      state: 'idle',
      meta: null,
      worker: null,
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    useAppStore.getState().reset();
    useNerModelStore.setState({
      state: 'idle',
      meta: null,
      worker: null,
    });
  });

  it('shows model idle state before NER is loaded', async () => {
    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root?.render(<NerProgress />);
    });

    expect(container.textContent).toContain('NER 모델 미로드');
  });

  it('shows analysis idle state after NER is loaded', async () => {
    useNerModelStore.setState({
      state: 'ready',
      meta: null,
      worker: null,
    });

    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root?.render(<NerProgress />);
    });

    expect(container.textContent).toContain('NER 분석 대기');
  });

  it('shows active NER progress', async () => {
    useNerModelStore.setState({
      state: 'ready',
      meta: null,
      worker: null,
    });
    useAppStore.getState().setNerProgress({ done: 1, total: 3 });

    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root?.render(<NerProgress />);
    });

    expect(container.textContent).toContain('NER 분석 중 1 / 3');
  });

  it('shows completed NER progress', async () => {
    useNerModelStore.setState({
      state: 'ready',
      meta: null,
      worker: null,
    });
    useAppStore.getState().setNerProgress({ done: 3, total: 3 });

    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root?.render(<NerProgress />);
    });

    expect(container.textContent).toContain('NER 분석 완료 (3/3)');
  });
});
