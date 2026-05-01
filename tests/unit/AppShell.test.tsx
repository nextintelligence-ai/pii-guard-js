import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { router } from '@/router';

describe('AppShell', () => {
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

  it('상단 내비게이션에서 홈, 단일 처리, 일괄 처리를 보여준다', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] });
    router.update({ history });

    const container = document.createElement('div');
    root = createRoot(container);

    await act(async () => {
      root?.render(<RouterProvider router={router} />);
    });

    expect(container.textContent).toContain('PDF 익명화 도구');
    expect(container.textContent).toContain('단일 처리');
    expect(container.textContent).toContain('일괄 처리');
  });
});
