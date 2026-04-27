import { describe, expect, it } from 'vitest';
import { phoneRule } from '@/core/detectors/phone';

describe('phoneRule', () => {
  it.each([
    ['010-1234-5678', 1],
    ['01012345678', 1],
    ['010 1234 5678', 1],
    ['02-1234-5678', 1],
    ['+82 10-1234-5678', 1],
  ])('"%s" 는 %d개 매칭', (s, n) => {
    expect(phoneRule.scan(s).length).toBe(n);
  });

  it('의미 없는 짧은 숫자열은 매칭하지 않는다', () => {
    expect(phoneRule.scan('1234').length).toBe(0);
  });
});
