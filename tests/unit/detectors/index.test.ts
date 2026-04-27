import { describe, expect, it } from 'vitest';
import { runDetectors } from '@/core/detectors/index';
import type { DetectorRule } from '@/core/detectors/types';

describe('runDetectors', () => {
  it('규칙이 매칭되면 글자 bbox에서 합쳐진 영역을 반환한다', () => {
    const rule: DetectorRule = {
      category: 'email',
      scan(t) {
        return /a/.test(t) ? [{ start: 0, end: 1, matched: 'a', confidence: 1 }] : [];
      },
    };
    const result = runDetectors(
      [
        {
          pageIndex: 0,
          text: 'abc',
          charBboxes: [
            [0, 0, 5, 10],
            [5, 0, 10, 10],
            [10, 0, 15, 10],
          ],
        },
      ],
      [rule],
    );
    expect(result).toHaveLength(1);
    expect(result[0].bbox).toEqual([0, 0, 5, 10]);
  });

  it('빈 매칭은 후보로 만들지 않는다', () => {
    const rule: DetectorRule = { category: 'email', scan: () => [] };
    expect(runDetectors([{ pageIndex: 0, text: '', charBboxes: [] }], [rule])).toEqual([]);
  });
});
