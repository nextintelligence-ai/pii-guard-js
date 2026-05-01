import { describe, expect, it } from 'vitest';
import { runDetectors } from '@/core/detectors';
import type { LineForScan } from '@/core/detectors/types';

function line(index: number, text: string): LineForScan {
  return {
    pageIndex: 0,
    text,
    charBboxes: [...text].map((_, i) => [i * 10, index * 20, i * 10 + 10, index * 20 + 12]),
  };
}

describe('공제신고서 인적공제 표 이름 자동탐지', () => {
  it('인적공제 표의 가족 이름을 NER 없이 private_person 후보로 만든다', () => {
    const candidates = runDetectors([
      line(0, '인적공제 항목'),
      line(1, '관계'),
      line(2, '코드'),
      line(3, '성  명'),
      line(4, '자료'),
      line(5, '구분'),
      line(6, '주민등록번호'),
      line(7, '국세청 계'),
      line(8, '기타 계'),
      line(9, '최가명'),
      line(10, 'O'),
      line(11, '국세청'),
      line(12, '(근로자 본인)'),
      line(13, '기타'),
      line(14, '오가명'),
      line(15, 'O'),
      line(16, 'O'),
      line(17, '국세청'),
      line(18, '222222-2222222'),
      line(19, '기타'),
      line(20, '임가명'),
      line(21, 'O'),
      line(22, 'O'),
      line(23, '국세청'),
      line(24, '333333-3333333'),
      line(25, '기타'),
      line(26, '각종 소득·세액 공제 항목'),
    ]);

    const personCandidates = candidates.filter((candidate) => candidate.category === 'private_person');
    expect(personCandidates.map((candidate) => candidate.text)).toEqual([
      '최가명',
      '오가명',
      '임가명',
    ]);
    expect(personCandidates.every((candidate) => candidate.source === 'auto')).toBe(true);
    expect(personCandidates[1]?.bbox).toEqual([0, 280, 30, 292]);
  });
});
