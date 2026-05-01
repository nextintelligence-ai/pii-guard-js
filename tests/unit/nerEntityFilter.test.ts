import { describe, expect, it } from 'vitest';
import { filterNerEntitiesForText } from '@/core/nerEntityFilter';
import type { NerEntity } from '@/core/spanMap';

describe('NER entity 후처리', () => {
  it('세무 서식 쪽수 참조 문구가 사람 이름으로 오탐되면 제거한다', () => {
    const text =
      '해당 공제를 신청할 때에는 이 서식 제8쪽의 연금ㆍ저축 등 소득ㆍ세액 공제명세서를 작성해야 합니다.';
    const start = text.indexOf('이 서식 제8쪽');
    const entities: NerEntity[] = [
      {
        entity_group: 'private_person',
        start,
        end: start + '이 서식 제8쪽'.length,
        score: 0.999,
      },
    ];

    expect(filterNerEntitiesForText(text, entities)).toEqual([]);
  });

  it('실제 사람 이름은 유지한다', () => {
    const text = '성명: 최가명';
    const start = text.indexOf('최가명');
    const entities: NerEntity[] = [
      {
        entity_group: 'private_person',
        start,
        end: start + '최가명'.length,
        score: 0.99,
      },
    ];

    expect(filterNerEntitiesForText(text, entities)).toEqual(entities);
  });

  it('세무 서식 쪽수 참조 문구 일부만 사람 이름으로 오탐되어도 제거한다', () => {
    const text = '이 서식 제8쪽';
    const start = text.indexOf('쪽');
    const entities: NerEntity[] = [
      {
        entity_group: 'private_person',
        start,
        end: start + '쪽'.length,
        score: 0.8,
      },
    ];

    expect(filterNerEntitiesForText(text, entities)).toEqual([]);
  });
});
