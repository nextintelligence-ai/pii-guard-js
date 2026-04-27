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
});
