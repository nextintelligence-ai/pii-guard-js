import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toolbar } from '@/components/Toolbar';
import { useAppStore } from '@/state/store';

vi.mock('@/components/NerLoadButton', () => ({
  default: () => <button type="button">NER 모델 로드</button>,
}));

async function waitForDom(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('DOM condition was not met');
}

describe('Toolbar', () => {
  let root: Root | null = null;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
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

  it('shows the NER model loader in the default app build', async () => {
    const container = document.createElement('div');
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <Toolbar
          onLoad={() => undefined}
          onApply={() => undefined}
          onHelp={() => undefined}
        />,
      );
    });

    await waitForDom(() => container.textContent?.includes('NER 모델 로드') === true);

    expect(container.textContent).toContain('NER 모델 로드');
  });
});
