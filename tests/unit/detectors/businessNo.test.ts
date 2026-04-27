import { describe, expect, it } from 'vitest';
import { businessNoRule } from '@/core/detectors/businessNo';

describe('businessNoRule', () => {
  it('체크섬 통과한 번호는 confidence 1.0', () => {
    // 합성 사업자번호 — 실제 사업체와 무관.
    const valid = '111-11-00005';
    const r = businessNoRule.scan(valid);
    expect(r.length).toBe(1);
    expect(r[0].confidence).toBe(1);
  });

  it('체크섬 실패는 0.5', () => {
    expect(businessNoRule.scan('111-11-11111')[0]?.confidence ?? 0).toBeLessThan(1);
  });
});
