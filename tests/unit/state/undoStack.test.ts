import { describe, expect, it, beforeEach } from 'vitest';
import { useAppStore } from '@/state/store';

describe('Undo/Redo', () => {
  beforeEach(() => useAppStore.getState().reset());

  it('박스 추가 후 undo 하면 이전 상태로 돌아간다', () => {
    const s = useAppStore.getState();
    s.addManualBox({ pageIndex: 0, bbox: [0, 0, 1, 1] });
    s.undo();
    expect(Object.keys(useAppStore.getState().boxes).length).toBe(0);
  });

  it('undo 후 redo 하면 복원된다', () => {
    const s = useAppStore.getState();
    s.addManualBox({ pageIndex: 0, bbox: [0, 0, 1, 1] });
    s.undo();
    s.redo();
    expect(Object.keys(useAppStore.getState().boxes).length).toBe(1);
  });

  it('연속 undo 와 연속 redo 가 모두 동작한다', () => {
    const s = useAppStore.getState();
    s.addManualBox({ pageIndex: 0, bbox: [0, 0, 1, 1] });
    s.addManualBox({ pageIndex: 0, bbox: [10, 10, 20, 20] });
    expect(Object.keys(useAppStore.getState().boxes).length).toBe(2);
    s.undo();
    s.undo();
    expect(Object.keys(useAppStore.getState().boxes).length).toBe(0);
    s.redo();
    expect(Object.keys(useAppStore.getState().boxes).length).toBe(1);
    s.redo();
    expect(Object.keys(useAppStore.getState().boxes).length).toBe(2);
  });
});
