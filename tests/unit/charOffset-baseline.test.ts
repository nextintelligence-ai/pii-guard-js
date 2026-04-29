import { describe, it, expect } from 'vitest';
import { compareEntityOffsets } from '@/poc/compareEntityOffsets';
import { EN_FIXTURES } from '@/poc/poc-fixtures';

describe('PoC: char offset 정확도 비교', () => {
  it('영문 기대값과 동일한 entity 출력은 모두 exactMatches 로 분류한다', () => {
    const fx = EN_FIXTURES[0];
    const observed = [
      { entity_group: 'private_person', start: 11, end: 22, score: 0.99, word: 'Alice Smith' },
      { entity_group: 'private_email', start: 39, end: 56, score: 0.99, word: 'alice@example.com' },
    ];

    const result = compareEntityOffsets(fx, observed);

    expect(result.exactMatches).toBe(2);
    expect(result.offsetMismatches).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
  });

  it('카테고리는 같지만 offset 이 ±5 이내로 어긋나면 offsetMismatches 로 분류한다', () => {
    const fx = EN_FIXTURES[0];
    const observed = [
      { entity_group: 'private_person', start: 12, end: 22, score: 0.99, word: 'lice Smith' },
    ];

    const result = compareEntityOffsets(fx, observed);

    expect(result.exactMatches).toBe(0);
    expect(result.offsetMismatches).toHaveLength(1);
    expect(result.offsetMismatches[0]).toMatchObject({
      expected: { entity: 'private_person', start: 11, end: 22 },
      observed: { entity: 'private_person', start: 12, end: 22 },
      delta: { start: 1, end: 0 },
    });
  });

  it('기대 entity 가 검출되지 않으면 missing 으로 누적된다', () => {
    const fx = EN_FIXTURES[0];
    const observed = [
      { entity_group: 'private_person', start: 11, end: 22, score: 0.99, word: 'Alice Smith' },
    ];

    const result = compareEntityOffsets(fx, observed);

    expect(result.exactMatches).toBe(1);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0]).toMatchObject({
      entity: 'private_email',
      start: 39,
      end: 56,
    });
  });

  it('기대 외 추가 entity 는 extra 로 분류된다 (false positive 후보)', () => {
    const fx = EN_FIXTURES[0];
    const observed = [
      { entity_group: 'private_person', start: 11, end: 22, score: 0.99, word: 'Alice Smith' },
      { entity_group: 'private_email', start: 39, end: 56, score: 0.99, word: 'alice@example.com' },
      { entity_group: 'private_url', start: 100, end: 110, score: 0.8, word: 'phantom' },
    ];

    const result = compareEntityOffsets(fx, observed);

    expect(result.exactMatches).toBe(2);
    expect(result.extra).toEqual([
      { entity_group: 'private_url', start: 100, end: 110 },
    ]);
  });
});
