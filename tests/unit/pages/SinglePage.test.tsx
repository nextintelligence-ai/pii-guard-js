import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SinglePage } from '@/pages/SinglePage';
import { useAppStore } from '@/state/store';

const mocks = vi.hoisted(() => ({
  useOcrDetect: vi.fn(),
}));

vi.mock('@/hooks/useOcrDetect', () => ({
  useOcrDetect: mocks.useOcrDetect,
}));

vi.mock('@/components/NerRuntime', () => ({
  default: () => null,
}));

vi.mock('@/components/NerLoadButton', () => ({
  default: () => <button type="button">NER 모델 로드</button>,
}));

vi.mock('@/components/PdfCanvas', () => ({
  PdfCanvas: () => <div data-testid="pdf-canvas" />,
}));

describe('SinglePage', () => {
  let root: Root | null = null;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useAppStore.getState().reset();
    mocks.useOcrDetect.mockClear();
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

  it('embedded 모드에서는 파일 열기와 익명화 적용을 숨기고 OCR 제어는 유지한다', async () => {
    const container = document.createElement('div');
    root = createRoot(container);

    await act(async () => {
      root?.render(<SinglePage embedded />);
    });

    expect(container.textContent).not.toContain('PDF 열기');
    expect(container.textContent).not.toContain('익명화 적용');
    expect(container.textContent).not.toContain('PDF 파일을 여기에 드롭하세요');
    expect(container.querySelector('button[aria-label="현재 페이지 OCR"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="전체 문서 OCR"]')).not.toBeNull();
  });

  it('화면 진입만으로 OCR 자동 실행을 켜지 않는다', async () => {
    const container = document.createElement('div');
    root = createRoot(container);

    await act(async () => {
      root?.render(<SinglePage />);
    });

    expect(mocks.useOcrDetect).toHaveBeenCalledWith({ auto: false });
  });

  it('ready 상태에서는 후보 패널에 높이 제약을 전달한다', async () => {
    useAppStore.setState({
      doc: {
        kind: 'ready',
        fileName: 'sample.pdf',
        pages: [{ index: 0, widthPt: 595, heightPt: 842, rotation: 0 }],
      },
    });
    const container = document.createElement('div');
    root = createRoot(container);

    await act(async () => {
      root?.render(<SinglePage autoDetect={false} />);
    });

    const sidebarBody = container.querySelector('[data-testid="single-sidebar-body"]');
    const candidateSlot = container.querySelector('[data-testid="candidate-panel-slot"]');
    expect(sidebarBody).not.toBeNull();
    expect(candidateSlot).not.toBeNull();
    expect(sidebarBody?.className).toContain('h-full');
    expect(sidebarBody?.className).toContain('min-h-0');
    expect(candidateSlot?.className).toContain('min-h-0');
    expect(candidateSlot?.className).toContain('flex-1');
  });
});
