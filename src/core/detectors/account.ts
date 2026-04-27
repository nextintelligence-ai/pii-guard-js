import type { DetectorMatch, DetectorRule } from './types';

const RE = /(계좌(?:번호)?|입금|예금주)[^\d\n]{0,30}((?:\d[\s-]?){6,20})/g;

export const accountRule: DetectorRule = {
  category: 'account',
  scan(text) {
    const out: DetectorMatch[] = [];
    for (const m of text.matchAll(RE)) {
      if (m.index === undefined || !m[2]) continue;
      const numStart = m.index + m[0].indexOf(m[2]);
      out.push({
        start: numStart,
        end: numStart + m[2].length,
        matched: m[2],
        confidence: 0.7,
      });
    }
    return out;
  },
};
