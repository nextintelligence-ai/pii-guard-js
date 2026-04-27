import type { DetectorMatch, DetectorRule } from './types';

const RE = /\b(?:\d[ -]?){13,19}\b/g;

function luhn(d: string): boolean {
  let s = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i -= 1) {
    let n = parseInt(d[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    s += n;
    alt = !alt;
  }
  return s % 10 === 0;
}

export const cardRule: DetectorRule = {
  category: 'card',
  scan(text) {
    const out: DetectorMatch[] = [];
    for (const m of text.matchAll(RE)) {
      if (m.index === undefined) continue;
      const digits = m[0].replace(/\D/g, '');
      if (digits.length < 13 || digits.length > 19) continue;
      const ok = luhn(digits);
      out.push({
        start: m.index,
        end: m.index + m[0].length,
        matched: m[0],
        confidence: ok ? 1 : 0.5,
      });
    }
    return out;
  },
};
