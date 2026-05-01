import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SinglePage } from '@/pages/SinglePage';
import { useAppStore } from '@/state/store';

vi.mock('@/components/NerRuntime', () => ({
  default: () => null,
}));

vi.mock('@/components/NerLoadButton', () => ({
  default: () => <button type="button">NER 모델 로드</button>,
}));

describe('SinglePage', () => {
  let root: Root | null = null;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useAppStore.getState().reset();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    root = null;
    useAppStore.getState().reset();
  });

  it('PDF가 없을 때 단일 처리 드롭존을 보여준다', async () => {
    const container = document.createElement('div');
    root = createRoot(container);

    await act(async () => {
      root?.render(<SinglePage />);
    });

    expect(container.textContent).toContain('아직 검사할 PDF가 없습니다');
    expect(container.textContent).toContain('PDF 파일을 여기에 드롭하세요');
  });
});
