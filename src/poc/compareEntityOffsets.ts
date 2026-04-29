/**
 * entity 출력의 char offset 정확도를 측정하는 비교 함수.
 *
 * `ner-poc.ts` 의 transformers.js import 가 단위 테스트(jsdom)를 깨뜨리지 않도록
 * 순수 함수만 별도 파일로 분리한다.
 */

import type { FixtureCase } from './poc-fixtures';

export interface EntityOutput {
  entity_group: string;
  start: number;
  end: number;
  score: number;
  word: string;
}

/**
 * - `exactMatches`: 카테고리 + start/end 가 정확히 일치하는 entity 개수
 * - `offsetMismatches`: 카테고리는 같지만 start/end 가 ±5 이내로 어긋남
 * - `missing`: 기대했지만 검출되지 않음
 * - `extra`: 기대 외 추가 검출 (false positive 후보)
 */
export interface OffsetCompareResult {
  exactMatches: number;
  offsetMismatches: Array<{
    expected: { entity: string; start: number; end: number };
    observed: { entity: string; start: number; end: number };
    delta: { start: number; end: number };
  }>;
  missing: Array<FixtureCase['expected'][number]>;
  extra: Array<{ entity_group: string; start: number; end: number }>;
}

export function compareEntityOffsets(
  fixture: FixtureCase,
  observed: EntityOutput[],
): OffsetCompareResult {
  const result: OffsetCompareResult = {
    exactMatches: 0,
    offsetMismatches: [],
    missing: [],
    extra: [],
  };
  const usedObs = new Set<number>();

  for (const exp of fixture.expected) {
    let foundIdx = -1;
    for (let i = 0; i < observed.length; i++) {
      if (usedObs.has(i)) continue;
      const obs = observed[i];
      if (obs.entity_group !== exp.entity) continue;
      if (obs.start === exp.start && obs.end === exp.end) {
        foundIdx = i;
        result.exactMatches += 1;
        break;
      }
      if (Math.abs(obs.start - exp.start) <= 5 || Math.abs(obs.end - exp.end) <= 5) {
        foundIdx = i;
        result.offsetMismatches.push({
          expected: { entity: exp.entity, start: exp.start, end: exp.end },
          observed: { entity: obs.entity_group, start: obs.start, end: obs.end },
          delta: { start: obs.start - exp.start, end: obs.end - exp.end },
        });
        break;
      }
    }
    if (foundIdx === -1) {
      result.missing.push(exp);
    } else {
      usedObs.add(foundIdx);
    }
  }

  observed.forEach((obs, i) => {
    if (!usedObs.has(i)) {
      result.extra.push({ entity_group: obs.entity_group, start: obs.start, end: obs.end });
    }
  });

  return result;
}
