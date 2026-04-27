import type { DetectorMatch, DetectorRule } from './types';

const RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export const emailRule: DetectorRule = {
  category: 'email',
  scan(text) {
    const out: DetectorMatch[] = [];
    for (const m of text.matchAll(RE)) {
      if (m.index === undefined) continue;
      out.push({
        start: m.index,
        end: m.index + m[0].length,
        matched: m[0],
        confidence: 1,
      });
    }
    return out;
  },
};
