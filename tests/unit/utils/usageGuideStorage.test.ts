import { describe, expect, it, vi } from 'vitest';
import { hasSeenUsageGuide, markUsageGuideSeen } from '@/utils/usageGuideStorage';

function makeStorage(value: string | null = null) {
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn(),
  };
}

describe('usageGuideStorage', () => {
  it('저장된 값이 true 이면 사용법을 본 것으로 판단한다', () => {
    expect(hasSeenUsageGuide(makeStorage('true'))).toBe(true);
  });

  it('저장된 값이 없으면 사용법을 보지 않은 것으로 판단한다', () => {
    expect(hasSeenUsageGuide(makeStorage(null))).toBe(false);
  });

  it('사용법 확인 상태를 저장한다', () => {
    const storage = makeStorage();
    markUsageGuideSeen(storage);
    expect(storage.setItem).toHaveBeenCalledWith('pdf-anony.usageGuideSeen.v1', 'true');
  });

  it('스토리지 접근이 실패해도 예외를 던지지 않는다', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked');
      }),
    };

    expect(hasSeenUsageGuide(storage)).toBe(false);
    expect(() => markUsageGuideSeen(storage)).not.toThrow();
  });
});
