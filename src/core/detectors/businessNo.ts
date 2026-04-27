import type { DetectorMatch, DetectorRule } from './types';

const RE = /\b(\d{3})-?(\d{2})-?(\d{5})\b/g;
const W = [1, 3, 7, 1, 3, 7, 1, 3, 5];

function bizChecksum(d: string): boolean {
  if (d.length !== 10) return false;
  let s = 0;
  for (let i = 0; i < 9; i += 1) s += parseInt(d[i], 10) * W[i];
  s += Math.floor((parseInt(d[8], 10) * 5) / 10);
  const c = (10 - (s % 10)) % 10;
  return c === parseInt(d[9], 10);
}

export const businessNoRule: DetectorRule = {
  category: 'businessNo',
  scan(text) {
    const out: DetectorMatch[] = [];
    for (const m of text.matchAll(RE)) {
      if (m.index === undefined) continue;
      const digits = (m[1] + m[2] + m[3]).replace(/\D/g, '');
      const ok = bizChecksum(digits);
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
