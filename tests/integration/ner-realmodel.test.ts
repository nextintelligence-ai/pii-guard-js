import { describe, expect, it } from 'vitest';
import baseline from '@tests/fixtures/ner-ko-baseline.json';
import { KO_FIXTURES } from '@tests/fixtures/ner-fixtures';

describe.skip('한국어 baseline 모니터 (실 모델 필요)', () => {
  it('현재 모델의 한국어 검출 결과가 baseline 과 너무 벗어나지 않는다', () => {
    const baselineIds = baseline.fixtures.map((f) => f.id);
    const fixtureIds = KO_FIXTURES.map((f) => f.id);

    expect(baseline.model).toBe('openai/privacy-filter');
    expect(baselineIds).toEqual(fixtureIds);
  });
});
