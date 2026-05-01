import type { DetectorMatch, DetectorRule } from './types';

const RE = /\b(\d{6})-?(\d{7})\b/g;
const MASKED_RE = /(^|[^\d])(\d{6})-(\*{7})(?!\*)/g;
const W = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];

function rrnChecksum(d: string): boolean {
  if (d.length !== 13) return false;
  let s = 0;
  for (let i = 0; i < 12; i += 1) s += parseInt(d[i], 10) * W[i];
  const c = (11 - (s % 11)) % 10;
  return c === parseInt(d[12], 10);
}

export const rrnRule: DetectorRule = {
  category: 'rrn',
  scan(text) {
    const out: DetectorMatch[] = [];
    for (const m of text.matchAll(RE)) {
      if (m.index === undefined) continue;
      const digits = (m[1] + m[2]).replace(/\D/g, '');
      const ok = rrnChecksum(digits);
      out.push({
        start: m.index,
        end: m.index + m[0].length,
        matched: m[0],
        confidence: ok ? 1 : 0.5,
      });
    }
    for (const m of text.matchAll(MASKED_RE)) {
      if (m.index === undefined) continue;
      const prefix = m[1] ?? '';
      const matched = `${m[2]}-${m[3]}`;
      const start = m.index + prefix.length;
      out.push({
        start,
        end: start + matched.length,
        matched,
        confidence: 0.5,
      });
    }
    return out;
  },
};
