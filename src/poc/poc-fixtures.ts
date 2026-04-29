/**
 * PoC 픽스처 — 영문 / 한국어 텍스트와 사람이 검수한 기대 entity.
 *
 * `expected` 의 start/end 는 `text` 안의 UTF-16 char offset (`text.slice(start, end) === word`).
 * 한국어 픽스처는 모델 한국어 성능이 미지수라 `expected` 를 비워두고 baseline JSON 으로 측정한다.
 */

export interface FixtureCase {
  id: string;
  text: string;
  expected: Array<{ entity: string; start: number; end: number; word: string }>;
}

export const EN_FIXTURES: FixtureCase[] = [
  {
    id: 'en-basic',
    text: 'My name is Alice Smith and my email is alice@example.com.',
    expected: [
      { entity: 'private_person', start: 11, end: 22, word: 'Alice Smith' },
      { entity: 'private_email', start: 39, end: 56, word: 'alice@example.com' },
    ],
  },
  {
    id: 'en-multientity',
    text: 'Contact Bob at +1-212-555-0100 or visit https://acme.com on 2024-03-15.',
    expected: [
      { entity: 'private_person', start: 8, end: 11, word: 'Bob' },
      { entity: 'private_phone', start: 15, end: 30, word: '+1-212-555-0100' },
      { entity: 'private_url', start: 40, end: 56, word: 'https://acme.com' },
      { entity: 'private_date', start: 60, end: 70, word: '2024-03-15' },
    ],
  },
];

export const KO_FIXTURES: FixtureCase[] = [
  {
    id: 'ko-name-address',
    text: '김철수 (서울특별시 강남구 테헤란로 123) 010-1234-5678 alice@example.com',
    expected: [],
  },
  {
    id: 'ko-mixed',
    text: '담당자 이영희 부장은 서울시 마포구에 거주하며 사번 1001 입니다.',
    expected: [],
  },
];
