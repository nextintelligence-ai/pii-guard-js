import { describe, expect, it } from 'vitest';
import { accountRule } from '@/core/detectors/account';

describe('accountRule', () => {
  it('"계좌"/"계좌번호" 키워드 근방 숫자열만 매칭한다', () => {
    expect(accountRule.scan('계좌번호: 110-123-456789').length).toBe(1);
    expect(accountRule.scan('주문번호: 110-123-456789').length).toBe(0);
  });
});
