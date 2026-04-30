import { describe, expect, it } from 'vitest';
import { buildContextualNerMaps } from '@/core/nerContext';
import { entitiesToBoxes, type StructuredLine } from '@/core/spanMap';

function line(id: number, text: string): StructuredLine {
  return {
    id,
    spans: [
      {
        id,
        chars: [...text].map((ch, i) => ({
          ch,
          bbox: { x: i * 10, y: id * 20, w: 10, h: 12 },
        })),
      },
    ],
  };
}

describe('NER 문맥 재구성', () => {
  it('비상연락망 표에서 성명 후보만 모아 NER 입력을 만들고 원본 좌표로 되돌린다', () => {
    const maps = buildContextualNerMaps([
      line(0, '분야별'),
      line(1, '성명'),
      line(2, '직위'),
      line(3, '소속'),
      line(4, '연락처'),
      line(5, '사업총괄 PM'),
      line(6, '박종천'),
      line(7, '대표이사'),
      line(8, '(주)넥스트인텔리전스닷'),
      line(9, '010-2572-9243'),
      line(10, '부PM'),
      line(11, '정지훈'),
      line(12, '부장'),
      line(13, '010-4326-2605'),
      line(14, 'AI 엔지니어'),
      line(15, '박태순'),
      line(16, '부장'),
      line(17, '010-6298-9759'),
      line(18, 'AI 개발자'),
      line(19, '허지우'),
      line(20, '차장'),
      line(21, '010-5659-0421'),
      line(22, 'FE 개발자'),
      line(23, '강인찬'),
      line(24, '차장'),
      line(25, '010-7774-3212'),
      line(26, '클라우드/QA'),
      line(27, '박세림'),
      line(28, '대리'),
      line(29, '010-5092-5633'),
    ]);

    expect(maps).toHaveLength(1);
    const map = maps[0]!;
    expect(map.pageText).toBe('성명\n박종천\n정지훈\n박태순\n허지우\n강인찬\n박세림');

    const boxes = entitiesToBoxes(map, [
      {
        entity_group: 'private_person',
        start: map.pageText.indexOf('박종천'),
        end: map.pageText.indexOf('정지훈') + '정지훈'.length,
        score: 0.93,
      },
      {
        entity_group: 'private_person',
        start: map.pageText.indexOf('박태순'),
        end: map.pageText.indexOf('박태순') + '박태순'.length,
        score: 0.93,
      },
      {
        entity_group: 'private_person',
        start: map.pageText.indexOf('허지우'),
        end: map.pageText.indexOf('허지우') + '허지우'.length,
        score: 0.93,
      },
      {
        entity_group: 'private_person',
        start: map.pageText.indexOf('강인찬'),
        end: map.pageText.indexOf('강인찬') + '강인찬'.length,
        score: 0.99,
      },
      {
        entity_group: 'private_person',
        start: map.pageText.indexOf('박세림'),
        end: map.pageText.indexOf('박세림') + '박세림'.length,
        score: 0.98,
      },
    ]);

    expect(boxes).toHaveLength(6);
    expect(boxes.map((box) => box.bbox.y)).toEqual([120, 220, 300, 380, 460, 540]);
    expect(boxes.every((box) => box.category === 'private_person')).toBe(true);
  });

  it('성/명 라벨이 줄바꿈으로 쪼개진 증명서에서 이름만 원본 좌표로 되돌린다', () => {
    const maps = buildContextualNerMaps([
      line(0, '구'),
      line(1, '분'),
      line(2, '신청대상자'),
      line(3, '성'),
      line(4, '명'),
      line(5, '황선영'),
      line(6, '주민등록번호'),
      line(7, '801026-2221311'),
    ]);

    expect(maps).toHaveLength(1);
    const map = maps[0]!;
    expect(map.pageText).toBe('성명 황선영');

    const boxes = entitiesToBoxes(map, [
      {
        entity_group: 'private_person',
        start: 0,
        end: '성명 황선영'.length,
        score: 0.97,
      },
    ]);

    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({
      category: 'private_person',
      bbox: { x: 0, y: 100, w: 30, h: 12 },
      score: 0.97,
    });
  });

  it('소득자 성명 다음 줄 이름은 한 줄 문맥으로 재구성하고 이름만 원본 좌표로 되돌린다', () => {
    const maps = buildContextualNerMaps([
      line(0, '소득자 성명'),
      line(1, '박태순'),
      line(2, '주민등록번호'),
      line(3, '801129-1031511'),
    ]);

    expect(maps).toHaveLength(1);
    const map = maps[0]!;
    expect(map.pageText).toBe('소득자 성명 박태순');

    const boxes = entitiesToBoxes(map, [
      {
        entity_group: 'private_person',
        start: map.pageText.indexOf('박태순'),
        end: map.pageText.indexOf('박태순') + '박태순'.length,
        score: 0.97,
      },
    ]);

    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({
      category: 'private_person',
      bbox: { x: 0, y: 20, w: 30, h: 12 },
      score: 0.97,
    });
  });

  it('번호가 붙은 성명 라벨 다음 줄 이름도 한 줄 문맥으로 재구성한다', () => {
    const maps = buildContextualNerMaps([
      line(0, '① 성 명'),
      line(1, '박태순'),
      line(2, '② 주민등록번호'),
      line(3, '801129-1031511'),
    ]);

    expect(maps).toHaveLength(1);
    const map = maps[0]!;
    expect(map.pageText).toBe('① 성 명 박태순');

    const boxes = entitiesToBoxes(map, [
      {
        entity_group: 'private_person',
        start: 0,
        end: map.pageText.length,
        score: 0.91,
      },
    ]);

    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({
      category: 'private_person',
      bbox: { x: 0, y: 20, w: 30, h: 12 },
      score: 0.91,
    });
  });

  it('제출자 서명란은 이름 뒤 안내 문구를 문맥으로만 쓰고 이름만 원본 좌표로 되돌린다', () => {
    const maps = buildContextualNerMaps([
      line(0, '제출자'),
      line(1, '박태순  (서명 또는 인)'),
      line(2, '세무서장'),
    ]);

    expect(maps).toHaveLength(1);
    const map = maps[0]!;
    expect(map.pageText).toBe('제출자 박태순  (서명 또는 인)');

    const boxes = entitiesToBoxes(map, [
      {
        entity_group: 'private_person',
        start: 0,
        end: map.pageText.length,
        score: 0.99,
      },
    ]);

    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({
      category: 'private_person',
      bbox: { x: 0, y: 20, w: 30, h: 12 },
      score: 0.99,
    });
  });
});
