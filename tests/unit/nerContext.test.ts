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
      line(6, '김가명'),
      line(7, '대표이사'),
      line(8, '(주)넥스트인텔리전스닷'),
      line(9, '010-2572-9243'),
      line(10, '부PM'),
      line(11, '이가명'),
      line(12, '부장'),
      line(13, '010-4326-2605'),
      line(14, 'AI 엔지니어'),
      line(15, '최가명'),
      line(16, '부장'),
      line(17, '010-0000-0000'),
      line(18, 'AI 개발자'),
      line(19, '정가명'),
      line(20, '차장'),
      line(21, '010-5659-0421'),
      line(22, 'FE 개발자'),
      line(23, '윤가명'),
      line(24, '차장'),
      line(25, '010-7774-3212'),
      line(26, '클라우드/QA'),
      line(27, '한가명'),
      line(28, '대리'),
      line(29, '010-5092-5633'),
    ]);

    expect(maps).toHaveLength(1);
    const map = maps[0]!;
    expect(map.pageText).toBe('성명\n김가명\n이가명\n최가명\n정가명\n윤가명\n한가명');

    const boxes = entitiesToBoxes(map, [
      {
        entity_group: 'private_person',
        start: map.pageText.indexOf('김가명'),
        end: map.pageText.indexOf('이가명') + '이가명'.length,
        score: 0.93,
      },
      {
        entity_group: 'private_person',
        start: map.pageText.indexOf('최가명'),
        end: map.pageText.indexOf('최가명') + '최가명'.length,
        score: 0.93,
      },
      {
        entity_group: 'private_person',
        start: map.pageText.indexOf('정가명'),
        end: map.pageText.indexOf('정가명') + '정가명'.length,
        score: 0.93,
      },
      {
        entity_group: 'private_person',
        start: map.pageText.indexOf('윤가명'),
        end: map.pageText.indexOf('윤가명') + '윤가명'.length,
        score: 0.99,
      },
      {
        entity_group: 'private_person',
        start: map.pageText.indexOf('한가명'),
        end: map.pageText.indexOf('한가명') + '한가명'.length,
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
      line(5, '홍가명'),
      line(6, '주민등록번호'),
      line(7, '111111-1111111'),
    ]);

    expect(maps).toHaveLength(1);
    const map = maps[0]!;
    expect(map.pageText).toBe('성명 홍가명');

    const boxes = entitiesToBoxes(map, [
      {
        entity_group: 'private_person',
        start: 0,
        end: '성명 홍가명'.length,
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
      line(1, '최가명'),
      line(2, '주민등록번호'),
      line(3, '000000-0000001'),
    ]);

    expect(maps).toHaveLength(1);
    const map = maps[0]!;
    expect(map.pageText).toBe('소득자 성명 최가명');

    const boxes = entitiesToBoxes(map, [
      {
        entity_group: 'private_person',
        start: map.pageText.indexOf('최가명'),
        end: map.pageText.indexOf('최가명') + '최가명'.length,
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

  it('사용자명 다음 줄 이름은 앞쪽 주민등록번호 문맥과 함께 재구성한다', () => {
    const maps = buildContextualNerMaps([
      line(0, '주민등록번호'),
      line(1, '111111-*******'),
      line(2, '사용자명'),
      line(3, '홍가명'),
      line(4, '결제기간'),
    ]);

    expect(maps).toHaveLength(1);
    const map = maps[0]!;
    expect(map.pageText).toBe('사용자명: 홍가명');

    const boxes = entitiesToBoxes(map, [
      {
        entity_group: 'private_person',
        start: 0,
        end: map.pageText.length,
        score: 0.97,
      },
    ]);

    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({
      category: 'private_person',
      bbox: { x: 0, y: 60, w: 30, h: 12 },
      score: 0.97,
    });
  });

  it('성명/주민등록번호 헤더 다음 행의 이름은 표 문맥으로 재구성한다', () => {
    const maps = buildContextualNerMaps([
      line(0, '■ 가입자 인적사항'),
      line(1, '성 명'),
      line(2, '주 민 등 록 번 호'),
      line(3, '최가명'),
      line(4, '000000-*******'),
    ]);

    expect(maps).toHaveLength(1);
    const map = maps[0]!;
    expect(map.pageText).toBe('성 명: 최가명');

    const boxes = entitiesToBoxes(map, [
      {
        entity_group: 'private_person',
        start: map.pageText.indexOf('최가명'),
        end: map.pageText.indexOf('최가명') + '최가명'.length,
        score: 0.99,
      },
    ]);

    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({
      category: 'private_person',
      bbox: { x: 0, y: 60, w: 30, h: 12 },
      score: 0.99,
    });
  });

  it('공제신고서 인적공제 표의 반복 이름 행을 성명 문맥으로 재구성한다', () => {
    const maps = buildContextualNerMaps([
      line(0, 'Ⅰ. 인적공제 및 소득·세액공제 명세'),
      line(1, '인적공제 항목'),
      line(2, '관계'),
      line(3, '코드'),
      line(4, '성  명'),
      line(5, '자료'),
      line(6, '구분'),
      line(7, '주민등록번호'),
      line(8, '국세청 계'),
      line(9, '기타 계'),
      line(10, '최가명'),
      line(11, 'O'),
      line(12, '국세청'),
      line(13, '(근로자 본인)'),
      line(14, '기타'),
      line(15, '오가명'),
      line(16, 'O'),
      line(17, 'O'),
      line(18, '국세청'),
      line(19, '222222-2222222'),
      line(20, '기타'),
      line(21, '임가명'),
      line(22, 'O'),
      line(23, 'O'),
      line(24, '국세청'),
      line(25, '333333-3333333'),
      line(26, '기타'),
    ]);

    expect(maps).toHaveLength(1);
    const map = maps[0]!;
    expect(map.pageText).toBe('성명: 최가명\n성명: 오가명\n성명: 임가명');

    const boxes = entitiesToBoxes(map, [
      {
        entity_group: 'private_person',
        start: map.pageText.indexOf('오가명') - 1,
        end: map.pageText.indexOf('오가명') + '오가명'.length,
        score: 0.99,
      },
      {
        entity_group: 'private_person',
        start: map.pageText.indexOf('임가명') - 1,
        end: map.pageText.indexOf('임가명') + '임가명'.length,
        score: 0.99,
      },
    ]);

    expect(boxes).toHaveLength(2);
    expect(boxes.map((box) => box.bbox.y)).toEqual([300, 420]);
    expect(boxes.every((box) => box.category === 'private_person')).toBe(true);
  });

  it('번호가 붙은 성명 라벨 다음 줄 이름도 한 줄 문맥으로 재구성한다', () => {
    const maps = buildContextualNerMaps([
      line(0, '① 성 명'),
      line(1, '최가명'),
      line(2, '② 주민등록번호'),
      line(3, '000000-0000001'),
    ]);

    expect(maps).toHaveLength(1);
    const map = maps[0]!;
    expect(map.pageText).toBe('① 성 명 최가명');

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
      line(1, '최가명  (서명 또는 인)'),
      line(2, '세무서장'),
    ]);

    expect(maps).toHaveLength(1);
    const map = maps[0]!;
    expect(map.pageText).toBe('제출자 최가명  (서명 또는 인)');

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
