import { describe, expect, it, beforeEach } from 'vitest';
import { useAppStore } from '@/state/store';

describe('AppStore', () => {
  beforeEach(() => useAppStore.getState().reset());

  it('초기 doc 상태는 empty 다', () => {
    expect(useAppStore.getState().doc.kind).toBe('empty');
  });

  it('addManualBox 가 boxes에 한 항목을 추가한다', () => {
    useAppStore.getState().addManualBox({ pageIndex: 0, bbox: [0, 0, 10, 10] });
    expect(Object.values(useAppStore.getState().boxes)).toHaveLength(1);
  });

  it('toggleBox 가 enabled를 뒤집는다', () => {
    const s = useAppStore.getState();
    s.addManualBox({ pageIndex: 0, bbox: [0, 0, 10, 10] });
    const id = Object.keys(useAppStore.getState().boxes)[0]!;
    s.toggleBox(id);
    expect(useAppStore.getState().boxes[id]!.enabled).toBe(false);
  });

  it('reset 이 모든 상태를 초기화한다', () => {
    useAppStore.getState().addManualBox({ pageIndex: 0, bbox: [0, 0, 10, 10] });
    useAppStore.getState().reset();
    expect(Object.keys(useAppStore.getState().boxes).length).toBe(0);
    expect(useAppStore.getState().doc.kind).toBe('empty');
  });

  it('focusBox 가 selectedBoxId 를 갱신하고 focusNonce 를 증가시킨다', () => {
    const s = useAppStore.getState();
    s.addManualBox({ pageIndex: 2, bbox: [0, 0, 10, 10] });
    const id = Object.keys(useAppStore.getState().boxes)[0]!;
    const beforeNonce = useAppStore.getState().focusNonce;
    s.focusBox(id);
    expect(useAppStore.getState().selectedBoxId).toBe(id);
    expect(useAppStore.getState().focusNonce).toBe(beforeNonce + 1);
  });

  it('동일 박스를 focusBox 로 두 번 눌러도 focusNonce 가 매번 증가한다', () => {
    const s = useAppStore.getState();
    s.addManualBox({ pageIndex: 0, bbox: [0, 0, 10, 10] });
    const id = Object.keys(useAppStore.getState().boxes)[0]!;
    s.focusBox(id);
    const firstNonce = useAppStore.getState().focusNonce;
    s.focusBox(id);
    expect(useAppStore.getState().focusNonce).toBe(firstNonce + 1);
  });

  it('사람 이름 NER 후보는 score 가 낮아도 보존하고 threshold 이상 박스만 기본 ON 으로 만든다', () => {
    const s = useAppStore.getState();
    s.setNerThreshold(0.9);
    s.addNerCandidates(0, [
      { category: 'private_person', bbox: { x: 0, y: 0, w: 10, h: 10 }, score: 0.8 },
      { category: 'private_person', bbox: { x: 20, y: 0, w: 10, h: 10 }, score: 0.95 },
    ]);

    const state = useAppStore.getState();
    expect(state.candidates.filter((c) => c.source === 'ner')).toHaveLength(2);
    const boxes = Object.values(state.boxes).sort((a, b) => a.bbox[0] - b.bbox[0]);
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => b.source === 'ner')).toBe(true);
    expect(boxes[0]?.enabled).toBe(false);
    expect(boxes[1]?.enabled).toBe(true);
  });

  it('기본 OFF 인 NER 카테고리를 켜면 해당 NER 박스가 enabled 된다', () => {
    const s = useAppStore.getState();
    s.addNerCandidates(0, [
      { category: 'private_address', bbox: { x: 0, y: 0, w: 10, h: 10 }, score: 0.99 },
    ]);
    const id = Object.keys(useAppStore.getState().boxes)[0]!;
    expect(useAppStore.getState().boxes[id]?.enabled).toBe(false);

    s.toggleCategory('private_address');

    expect(useAppStore.getState().boxes[id]?.enabled).toBe(true);
  });

  it('NER 카테고리를 켤 때 현재 신뢰도 기준 미만 박스는 enabled 하지 않는다', () => {
    const s = useAppStore.getState();
    s.setNerThreshold(0.9);
    s.addNerCandidates(0, [
      { category: 'private_person', bbox: { x: 0, y: 0, w: 10, h: 10 }, score: 0.8 },
      { category: 'private_person', bbox: { x: 20, y: 0, w: 10, h: 10 }, score: 0.95 },
    ]);

    const boxes = Object.values(useAppStore.getState().boxes).sort((a, b) => a.bbox[0] - b.bbox[0]);
    expect(boxes[0]?.enabled).toBe(false);
    expect(boxes[1]?.enabled).toBe(true);
  });

  it('NER 신뢰도를 높이면 기준 미만으로 내려간 enabled 박스를 적용 대상에서 제외한다', () => {
    const s = useAppStore.getState();
    s.addNerCandidates(0, [
      { category: 'private_person', bbox: { x: 0, y: 0, w: 10, h: 10 }, score: 0.8 },
      { category: 'private_person', bbox: { x: 20, y: 0, w: 10, h: 10 }, score: 0.95 },
    ]);

    s.setNerThreshold(0.9);

    const boxes = Object.values(useAppStore.getState().boxes).sort((a, b) => a.bbox[0] - b.bbox[0]);
    expect(boxes[0]?.enabled).toBe(false);
    expect(boxes[1]?.enabled).toBe(true);
  });

  it('OCR 후보는 기존 candidates 와 boxes 에 source ocr 로 추가된다', () => {
    const s = useAppStore.getState();
    s.addOcrCandidates([
      {
        id: 'ocr-rrn-1',
        pageIndex: 0,
        bbox: [10, 20, 80, 34],
        text: '000000-0000001',
        category: 'rrn',
        confidence: 0.91,
        source: 'ocr',
      },
    ]);

    const state = useAppStore.getState();
    expect(state.candidates).toHaveLength(1);
    expect(state.candidates[0]).toMatchObject({ source: 'ocr', category: 'rrn' });
    expect(state.boxes['ocr-rrn-1']).toMatchObject({
      source: 'ocr',
      category: 'rrn',
      enabled: true,
    });
  });

  it('OCR 진행 상태를 페이지 단위로 갱신하고 reset 시 초기화한다', () => {
    const s = useAppStore.getState();
    s.setOcrProgress({
      done: 1,
      total: 3,
      currentPage: 1,
      byPage: {
        0: { status: 'done' },
        1: { status: 'running' },
        2: { status: 'queued' },
      },
    });

    expect(useAppStore.getState().ocrProgress.currentPage).toBe(1);
    expect(useAppStore.getState().ocrProgress.byPage[2]?.status).toBe('queued');

    s.reset();

    expect(useAppStore.getState().ocrProgress).toEqual({
      done: 0,
      total: 0,
      currentPage: null,
      byPage: {},
    });
  });

  it('새 OCR 후보를 추가할 때 다른 페이지의 기존 OCR 후보는 유지한다', () => {
    const s = useAppStore.getState();
    s.addOcrCandidates([
      {
        id: 'ocr-page-0',
        pageIndex: 0,
        bbox: [0, 0, 10, 10],
        text: 'first@example.com',
        category: 'email',
        confidence: 0.9,
        source: 'ocr',
      },
    ]);

    s.addOcrCandidates([
      {
        id: 'ocr-page-1',
        pageIndex: 1,
        bbox: [20, 0, 30, 10],
        text: 'second@example.com',
        category: 'email',
        confidence: 0.9,
        source: 'ocr',
      },
    ]);

    expect(useAppStore.getState().candidates.map((c) => c.id).sort()).toEqual([
      'ocr-page-0',
      'ocr-page-1',
    ]);
    expect(Object.keys(useAppStore.getState().boxes).sort()).toEqual([
      'ocr-page-0',
      'ocr-page-1',
    ]);
  });

  it('카테고리 토글은 OCR 박스도 함께 갱신한다', () => {
    const s = useAppStore.getState();
    s.addOcrCandidates([
      {
        id: 'ocr-phone-1',
        pageIndex: 0,
        bbox: [0, 0, 10, 10],
        text: '010-1234-5678',
        category: 'phone',
        confidence: 0.9,
        source: 'ocr',
      },
    ]);

    s.toggleCategory('phone');

    expect(useAppStore.getState().boxes['ocr-phone-1']?.enabled).toBe(false);
  });

  it('빈 OCR 결과로 페이지를 다시 처리하면 해당 페이지 OCR 후보와 박스만 삭제한다', () => {
    const s = useAppStore.getState();
    const autoCandidate = {
      id: 'auto-page-0',
      pageIndex: 0,
      bbox: [40, 0, 60, 10],
      text: 'kept@example.com',
      category: 'email',
      confidence: 1,
      source: 'auto',
    } as const;
    s.setCandidates([autoCandidate]);
    s.addAutoBox(autoCandidate);
    s.addOcrCandidates([
      {
        id: 'ocr-page-0',
        pageIndex: 0,
        bbox: [0, 0, 10, 10],
        text: 'stale@example.com',
        category: 'email',
        confidence: 0.9,
        source: 'ocr',
      },
      {
        id: 'ocr-page-1',
        pageIndex: 1,
        bbox: [20, 0, 30, 10],
        text: 'kept-ocr@example.com',
        category: 'email',
        confidence: 0.9,
        source: 'ocr',
      },
    ]);

    s.addOcrCandidates([], [0]);

    expect(useAppStore.getState().candidates.map((c) => c.id).sort()).toEqual([
      'auto-page-0',
      'ocr-page-1',
    ]);
    expect(Object.keys(useAppStore.getState().boxes).sort()).toEqual([
      'auto-page-0',
      'ocr-page-1',
    ]);
  });

  it('같은 페이지 OCR 재실행은 기존 OCR ID 를 새 결과로 교체한다', () => {
    const s = useAppStore.getState();
    const autoCandidate = {
      id: 'auto-page-0',
      pageIndex: 0,
      bbox: [40, 0, 60, 10],
      text: 'kept@example.com',
      category: 'email',
      confidence: 1,
      source: 'auto',
    } as const;
    s.setCandidates([autoCandidate]);
    s.addAutoBox(autoCandidate);
    s.addOcrCandidates([
      {
        id: 'ocr-old-page-0',
        pageIndex: 0,
        bbox: [0, 0, 10, 10],
        text: 'old@example.com',
        category: 'email',
        confidence: 0.9,
        source: 'ocr',
      },
      {
        id: 'ocr-page-1',
        pageIndex: 1,
        bbox: [20, 0, 30, 10],
        text: 'kept-ocr@example.com',
        category: 'email',
        confidence: 0.9,
        source: 'ocr',
      },
    ]);

    s.addOcrCandidates(
      [
        {
          id: 'ocr-new-page-0',
          pageIndex: 0,
          bbox: [2, 2, 12, 12],
          text: 'new@example.com',
          category: 'email',
          confidence: 0.95,
          source: 'ocr',
        },
      ],
      [0],
    );

    expect(useAppStore.getState().candidates.map((c) => c.id).sort()).toEqual([
      'auto-page-0',
      'ocr-new-page-0',
      'ocr-page-1',
    ]);
    expect(Object.keys(useAppStore.getState().boxes).sort()).toEqual([
      'auto-page-0',
      'ocr-new-page-0',
      'ocr-page-1',
    ]);
  });

  it('오래된 OCR 요청 clear 는 더 최신 요청을 초기화하지 않는다', () => {
    const s = useAppStore.getState();
    s.requestOcrPage(0);
    const first = useAppStore.getState().ocrRequest;
    expect(first.kind).toBe('page');
    const oldNonce = first.kind === 'idle' ? -1 : first.nonce;

    s.clearOcrRequest(oldNonce);
    expect(useAppStore.getState().ocrRequest).toEqual({ kind: 'idle' });

    s.requestOcrAll();
    const second = useAppStore.getState().ocrRequest;
    expect(second.kind).toBe('all');
    const newNonce = second.kind === 'idle' ? -1 : second.nonce;
    expect(newNonce).not.toBe(oldNonce);

    s.clearOcrRequest(oldNonce);

    expect(useAppStore.getState().ocrRequest).toEqual({ kind: 'all', nonce: newNonce });
  });
});
