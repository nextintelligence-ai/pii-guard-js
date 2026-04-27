import type { DetectorMatch, DetectorRule } from './types';

// 시/도 광역단위 키워드. 약식형(서울시/충북/제주 등)도 포함한다.
const SIDO =
  '(?:서울특별시|서울시|부산광역시|부산시|대구광역시|대구시|인천광역시|인천시|광주광역시|광주시|대전광역시|대전시|울산광역시|울산시|세종특별자치시|세종시|경기도|강원특별자치도|강원도|충청북도|충청남도|전북특별자치도|전라북도|전라남도|경상북도|경상남도|제주특별자치도|제주도|충북|충남|전북|전남|경북|경남|제주)';

// 시/군/구 토큰: 한글 1~12자 + 시/군/구.
const SIGUNGU = '[가-힣]{1,12}(?:시|군|구)';

// 3번째 이후 주소 토큰: (한글/영문/숫자 + 동/읍/면/리/로/길/가/호/층/번지/번길/아파트/빌딩/타워/오피스텔/빌라)
// 또는 순수 숫자/지번(123, 123-45) 만 허용한다. 일반 단어("사람들")는 토큰으로 받지 않아 false positive 를 줄인다.
const NEXT_TOKEN =
  '(?:[가-힣A-Za-z0-9]+(?:동|읍|면|리|로|길|가|호|층|번지|번길|아파트|빌딩|타워|오피스텔|빌라)|\\d+(?:-\\d+)?)';

// 한국어 단어 안에 SIDO 키워드가 포함되어 있는 경우(예: "그서울시")를 배제하기 위한 lookbehind.
// 시/군/구 뒤로 도로명/지번/건물 등 상세 주소가 1개 이상 따라붙어야 후보로 인정한다(전체 주소 마스킹).
const RE = new RegExp(
  `(?<![가-힣A-Za-z])${SIDO}\\s+${SIGUNGU}(?:\\s+${NEXT_TOKEN}){1,6}`,
  'g',
);

export const addressRule: DetectorRule = {
  category: 'address',
  scan(text) {
    const out: DetectorMatch[] = [];
    for (const m of text.matchAll(RE)) {
      if (m.index === undefined) continue;
      out.push({
        start: m.index,
        end: m.index + m[0].length,
        matched: m[0],
        confidence: 0.8,
      });
    }
    return out;
  },
};
