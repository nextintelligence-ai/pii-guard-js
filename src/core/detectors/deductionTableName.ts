import type { Candidate } from '@/types/domain';
import { createId } from '@/utils/id';
import type { LineForScan } from './types';

const NON_NAME_WORDS = new Set([
  '관계',
  '코드',
  '자료',
  '구분',
  '국세청',
  '기타',
  '국세청계',
  '기타계',
]);

export function detectDeductionTableNames(
  lines: LineForScan[],
  source: Candidate['source'] = 'auto',
): Candidate[] {
  const headerIndex = lines.findIndex(
    (line, index) => isNameHeader(line.text) && hasDeductionTableHeaders(lines, index),
  );
  if (headerIndex < 0) return [];

  const bodyStart = findBodyStart(lines, headerIndex);
  const bodyEnd = findBodyEnd(lines, bodyStart);
  const candidates: Candidate[] = [];

  for (let i = bodyStart; i < bodyEnd; i += 1) {
    const text = lines[i]!.text.trim();
    if (!isLikelyKoreanName(text)) continue;
    if (!hasPersonRowEvidence(lines, i, bodyEnd)) continue;

    const bbox = lineTextBbox(lines[i]!);
    if (!bbox) continue;
    candidates.push({
      id: createId(),
      pageIndex: lines[i]!.pageIndex,
      bbox,
      text,
      category: 'private_person',
      confidence: 0.95,
      source,
    });
  }

  return candidates;
}

function isNameHeader(text: string): boolean {
  return text.replace(/\s+/g, '') === '성명';
}

function hasDeductionTableHeaders(lines: LineForScan[], headerIndex: number): boolean {
  const before = lines
    .slice(Math.max(0, headerIndex - 6), headerIndex)
    .map((line) => line.text.trim());
  const after = lines
    .slice(headerIndex + 1, Math.min(lines.length, headerIndex + 24))
    .map((line) => line.text.trim());

  return (
    before.includes('인적공제 항목') &&
    before.includes('관계') &&
    after.includes('주민등록번호') &&
    after.includes('자료') &&
    after.includes('구분')
  );
}

function findBodyStart(lines: LineForScan[], headerIndex: number): number {
  for (let i = headerIndex + 1; i < Math.min(lines.length, headerIndex + 120); i += 1) {
    if (lines[i]!.text.trim() === '기타 계') return i + 1;
  }
  return headerIndex + 1;
}

function findBodyEnd(lines: LineForScan[], bodyStart: number): number {
  for (let i = bodyStart; i < lines.length; i += 1) {
    if (lines[i]!.text.trim() === '각종 소득·세액 공제 항목') return i;
  }
  return lines.length;
}

function isLikelyKoreanName(text: string): boolean {
  const compact = text.replace(/\s+/g, '');
  return /^[가-힣]{2,4}$/.test(compact) && !NON_NAME_WORDS.has(compact);
}

function hasPersonRowEvidence(
  lines: LineForScan[],
  nameIndex: number,
  bodyEnd: number,
): boolean {
  const rowWindow = lines
    .slice(nameIndex + 1, Math.min(bodyEnd, nameIndex + 24))
    .map((line) => line.text.trim());
  const hasSourceType = rowWindow.includes('국세청') || rowWindow.includes('기타');
  const hasIdentityMarker =
    rowWindow.some(isResidentIdLine) || rowWindow.some((text) => text.includes('근로자 본인'));
  return hasSourceType && hasIdentityMarker;
}

function isResidentIdLine(text: string): boolean {
  return /^\d{6}-(?:\d{7}|\*{7})$/.test(text.trim());
}

function lineTextBbox(line: LineForScan): Candidate['bbox'] | null {
  const bboxes = line.charBboxes.slice(0, line.text.length);
  if (bboxes.length === 0) return null;
  return [
    Math.min(...bboxes.map((bbox) => bbox[0])),
    Math.min(...bboxes.map((bbox) => bbox[1])),
    Math.max(...bboxes.map((bbox) => bbox[2])),
    Math.max(...bboxes.map((bbox) => bbox[3])),
  ];
}
