import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NerLoadButton } from '@/components/NerLoadButton';
import { useNerModelStore } from '@/hooks/useNerModel';
import { useAppStore } from '@/state/store';

describe('NerLoadButton', () => {
  let root: Root | null = null;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
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

  it('shows the NER threshold control after the model is loaded', async () => {
    useAppStore.setState({ nerThreshold: 0.75 });
    useNerModelStore.setState({
      state: 'ready',
      meta: null,
      worker: null,
    });

    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root?.render(<NerLoadButton />);
    });

    expect(container.textContent).toContain('NER 로드됨');
    expect(container.textContent).toContain('NER 신뢰도 0.75');
    expect(container.querySelector('input[aria-label="NER 신뢰도 임계값"]')).not.toBeNull();
  });
});
