import { describe, expect, it } from 'vitest';
import { emailRule } from '@/core/detectors/email';

describe('emailRule', () => {
  it('이메일 한 개를 찾아낸다', () => {
    const m = emailRule.scan('연락처는 hong@example.com 입니다.');
    expect(m).toHaveLength(1);
    expect(m[0].matched).toBe('hong@example.com');
  });

  it('도메인이 짧은 경우는 매칭하지 않는다', () => {
    expect(emailRule.scan('a@b').length).toBe(0);
  });

  it('여러 이메일을 모두 찾는다', () => {
    expect(emailRule.scan('a@x.io b@y.kr').length).toBe(2);
  });
});
