import type { Candidate } from '@/types/domain';
import { createId } from '@/utils/id';
import { businessNoRule } from './businessNo';
import { cardRule } from './card';
import { emailRule } from './email';
import { phoneRule } from './phone';
import { rrnRule } from './rrn';
import type { DetectorRule, LineForScan } from './types';

export const ALL_RULES: DetectorRule[] = [
  emailRule,
  phoneRule,
  rrnRule,
  cardRule,
  businessNoRule,
];

export function runDetectors(
  lines: LineForScan[],
  rules: DetectorRule[] = ALL_RULES,
): Candidate[] {
  const out: Candidate[] = [];
  for (const line of lines) {
    for (const rule of rules) {
      for (const m of rule.scan(line.text)) {
        const bboxes = line.charBboxes.slice(m.start, m.end);
        if (bboxes.length === 0) continue;
        const x0 = Math.min(...bboxes.map((b) => b[0]));
        const y0 = Math.min(...bboxes.map((b) => b[1]));
        const x1 = Math.max(...bboxes.map((b) => b[2]));
        const y1 = Math.max(...bboxes.map((b) => b[3]));
        out.push({
          id: createId(),
          pageIndex: line.pageIndex,
          bbox: [x0, y0, x1, y1],
          text: m.matched,
          category: rule.category,
          confidence: m.confidence,
          source: 'auto',
        });
      }
    }
  }
  return out;
}
