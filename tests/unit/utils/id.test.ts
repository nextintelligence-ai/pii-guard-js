import { describe, expect, it } from 'vitest';
import { createId } from '@/utils/id';

describe('createId', () => {
  it('호출할 때마다 서로 다른 문자열을 반환한다', () => {
    const a = createId();
    const b = createId();
    expect(a).not.toBe(b);
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(8);
  });
});
