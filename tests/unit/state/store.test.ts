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

  it('NER 후보는 score 가 낮아도 보존하고 박스는 기본 OFF 로 만든다', () => {
    const s = useAppStore.getState();
    s.setNerThreshold(0.9);
    s.addNerCandidates(0, [
      { category: 'private_person', bbox: { x: 0, y: 0, w: 10, h: 10 }, score: 0.8 },
      { category: 'private_person', bbox: { x: 20, y: 0, w: 10, h: 10 }, score: 0.95 },
    ]);

    const state = useAppStore.getState();
    expect(state.candidates.filter((c) => c.source === 'ner')).toHaveLength(2);
    const boxes = Object.values(state.boxes);
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => b.source === 'ner')).toBe(true);
    expect(boxes.every((b) => b.enabled === false)).toBe(true);
  });

  it('NER 카테고리를 켜면 해당 NER 박스가 enabled 된다', () => {
    const s = useAppStore.getState();
    s.addNerCandidates(0, [
      { category: 'private_person', bbox: { x: 0, y: 0, w: 10, h: 10 }, score: 0.99 },
    ]);
    const id = Object.keys(useAppStore.getState().boxes)[0]!;
    expect(useAppStore.getState().boxes[id]?.enabled).toBe(false);

    s.toggleCategory('private_person');

    expect(useAppStore.getState().boxes[id]?.enabled).toBe(true);
  });

  it('NER 카테고리를 켤 때 현재 신뢰도 기준 미만 박스는 enabled 하지 않는다', () => {
    const s = useAppStore.getState();
    s.setNerThreshold(0.9);
    s.addNerCandidates(0, [
      { category: 'private_person', bbox: { x: 0, y: 0, w: 10, h: 10 }, score: 0.8 },
      { category: 'private_person', bbox: { x: 20, y: 0, w: 10, h: 10 }, score: 0.95 },
    ]);

    s.toggleCategory('private_person');

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
    s.toggleCategory('private_person');

    s.setNerThreshold(0.9);

    const boxes = Object.values(useAppStore.getState().boxes).sort((a, b) => a.bbox[0] - b.bbox[0]);
    expect(boxes[0]?.enabled).toBe(false);
    expect(boxes[1]?.enabled).toBe(true);
  });
});
