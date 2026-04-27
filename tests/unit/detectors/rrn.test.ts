import { describe, expect, it } from 'vitest';
import { rrnRule } from '@/core/detectors/rrn';

describe('rrnRule', () => {
  it('유효한 체크섬은 confidence 1.0 으로 매칭한다', () => {
    // 합성 번호 — 실제 사람과 무관한 가짜 RRN.
    const valid = '000000-0000001';
    const r = rrnRule.scan(valid);
    expect(r.length).toBe(1);
    expect(r[0].confidence).toBe(1);
  });

  it('체크섬 실패 번호는 confidence 0.5 로 보고한다', () => {
    const invalid = '900101-1234567';
    const r = rrnRule.scan(invalid);
    expect(r[0]?.confidence ?? 0).toBeLessThan(1);
  });

  it('형식이 아닌 숫자열은 매칭하지 않는다', () => {
    expect(rrnRule.scan('1234567890').length).toBe(0);
  });
});
