import type { DetectorMatch, DetectorRule } from './types';

// 시/도 광역단위 키워드. 정식형/약식형/단축형(서울/경기/강원 등) 모두 포함.
// 단독 "경기" 같은 짧은 형은 false positive 가 우려되지만, 패턴 전체가 SIGUNGU + 상세 토큰
// 1개 이상을 강제하므로 단독 등장(예: "경기를 보다") 은 매치되지 않는다.
// alternation 은 항상 긴 형부터 — JS 정규식은 첫 매치를 채택하므로 길이 우선순위가 중요하다.
const SIDO =
  '(?:서울특별시|서울시|서울|부산광역시|부산시|부산|대구광역시|대구시|대구|인천광역시|인천시|인천|광주광역시|광주시|광주|대전광역시|대전시|대전|울산광역시|울산시|울산|세종특별자치시|세종시|세종|경기도|경기|강원특별자치도|강원도|강원|충청북도|충북|충청남도|충남|전북특별자치도|전라북도|전북|전라남도|전남|경상북도|경북|경상남도|경남|제주특별자치도|제주도|제주)';

// 시/군/구 토큰.
const SIGUNGU = '[가-힣]{1,12}(?:시|군|구)';

// 3번째 이후 주소 토큰.
// - 한글/영문/숫자 + 동/읍/면/리/로/길/가/호/층/번지/번길/아파트/빌딩/타워/오피스텔/빌라/단지
// - 또는 순수 숫자/지번. 단, 숫자 토큰은 뒤에 공백/콤마/괄호/줄끝이 와야 인정해서
//   "1번 출구" 같은 false positive 를 막는다.
const NEXT_TOKEN =
  '(?:[가-힣A-Za-z0-9]+(?:동|읍|면|리|로|길|가|호|층|번지|번길|아파트|빌딩|타워|오피스텔|빌라|단지)|\\d+(?:-\\d+)?(?=[\\s,()]|$))';

// 토큰 사이 구분자. 공백/콤마 모두 허용하고 0개도 허용해서 "경기남양주시와부읍덕소로213"
// 처럼 띄어쓰기 없이 붙은 표기와 ", " 같은 구두점 분리 모두 흡수한다.
const SEP = '[\\s,]*';

// 주소 본문 (시/도 + 시/군/구 + 1~6 디테일 토큰).
const CORE = `${SIDO}${SEP}${SIGUNGU}(?:${SEP}${NEXT_TOKEN}){1,6}`;

// 주소 본문 뒤에 괄호로 묶인 보충 정보(법정동, 단지명 등) 가 붙는 경우 함께 흡수.
// 폭주 방지를 위해 80자 상한.
const PAREN_TAIL = '\\s*\\([^)]{1,80}\\)';

// 한국어 단어 안에 SIDO 키워드가 포함된 경우(예: "그서울시") 는 lookbehind 로 배제.
const RE = new RegExp(`(?<![가-힣A-Za-z])${CORE}(?:${PAREN_TAIL})?`, 'g');

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
