import { describe, expect, it } from 'vitest';
import { cardRule } from '@/core/detectors/card';

describe('cardRule', () => {
  it('Luhn 통과 카드 번호는 confidence 1.0', () => {
    const r = cardRule.scan('카드 4242-4242-4242-4242');
    expect(r.length).toBe(1);
    expect(r[0].confidence).toBe(1);
  });

  it('Luhn 실패는 confidence 0.5', () => {
    expect(cardRule.scan('1234-5678-9012-3456')[0]?.confidence).toBeLessThan(1);
  });
});
