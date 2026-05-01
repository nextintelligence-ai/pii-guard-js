import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CandidatePanel } from '@/components/CandidatePanel';
import { useAppStore } from '@/state/store';
import type { Candidate } from '@/types/domain';

describe('CandidatePanel', () => {
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

  it('does not render checkbox buttons inside candidate row buttons', async () => {
    const candidate: Candidate = {
      id: 'candidate-phone-1',
      pageIndex: 0,
      bbox: [10, 20, 80, 34],
      text: '010-1234-5678',
      category: 'phone',
      confidence: 1,
      source: 'auto',
    };
    useAppStore.setState({
      candidates: [candidate],
      boxes: {
        [candidate.id]: {
          id: candidate.id,
          pageIndex: candidate.pageIndex,
          bbox: candidate.bbox,
          source: candidate.source,
          category: candidate.category,
          enabled: true,
        },
      },
    });

    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root?.render(<CandidatePanel />);
    });

    expect(container.querySelector('button button')).toBeNull();
    expect(container.textContent).toContain('박스 #hone-1');
  });

  it('renders regex and OCR matches as source sections under one category', async () => {
    const candidates: Candidate[] = [
      {
        id: 'candidate-phone-regex',
        pageIndex: 0,
        bbox: [10, 20, 80, 34],
        text: '010-1234-5678',
        category: 'phone',
        confidence: 1,
        source: 'auto',
      },
      {
        id: 'candidate-phone-ocr',
        pageIndex: 1,
        bbox: [12, 22, 82, 36],
        text: '010-1234-5678',
        category: 'phone',
        confidence: 0.96,
        source: 'ocr',
      },
    ];
    useAppStore.setState({
      candidates,
      boxes: Object.fromEntries(
        candidates.map((candidate) => [
          candidate.id,
          {
            id: candidate.id,
            pageIndex: candidate.pageIndex,
            bbox: candidate.bbox,
            source: candidate.source,
            category: candidate.category,
            enabled: true,
          },
        ]),
      ),
    });

    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root?.render(<CandidatePanel />);
    });

    expect(container.textContent?.match(/전화번호/g)).toHaveLength(1);
    expect(container.textContent).toContain('정규식');
    expect(container.textContent).toContain('OCR');
  });

  it('does not render the NER threshold control in the candidate list', async () => {
    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root?.render(<CandidatePanel />);
    });

    expect(container.textContent).not.toContain('NER 신뢰도');
  });

  it('keeps automatic candidates in their own scroll area', async () => {
    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root?.render(<CandidatePanel />);
    });

    const autoScrollArea = container.querySelector('[aria-label="자동 개인정보 목록"]');
    expect(autoScrollArea).not.toBeNull();
    expect(autoScrollArea?.className).toContain('min-h-0');
    expect(autoScrollArea?.className).toContain('flex-1');
    expect(autoScrollArea?.textContent).toContain('주민등록번호');
    expect(autoScrollArea?.textContent).not.toContain('직접 마스크한 영역');
  });
});
