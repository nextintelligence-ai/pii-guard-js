import type { DetectorMatch, DetectorRule } from './types';

const RE = /(?:\+82[\s-]?)?(?:0?1[016789]|0\d{1,2})[\s-]?\d{3,4}[\s-]?\d{4}/g;

export const phoneRule: DetectorRule = {
  category: 'phone',
  scan(text) {
    const out: DetectorMatch[] = [];
    for (const m of text.matchAll(RE)) {
      if (m.index === undefined) continue;
      const digits = m[0].replace(/\D/g, '');
      if (digits.length < 9 || digits.length > 13) continue;
      out.push({
        start: m.index,
        end: m.index + m[0].length,
        matched: m[0],
        confidence: 0.9,
      });
    }
    return out;
  },
};
