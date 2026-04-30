import type { Bbox, Candidate } from '@/types/domain';

export function removeDuplicateOcrCandidates(
  ocrCandidates: Candidate[],
  existingCandidates: Candidate[],
): Candidate[] {
  return ocrCandidates.filter(
    (ocr) => !existingCandidates.some((existing) => isDuplicate(ocr, existing)),
  );
}

function isDuplicate(ocr: Candidate, existing: Candidate): boolean {
  if (ocr.pageIndex !== existing.pageIndex) return false;
  if (ocr.category !== existing.category) return false;
  if (bboxIou(ocr.bbox, existing.bbox) < 0.5 && centerDistance(ocr.bbox, existing.bbox) > 12) {
    return false;
  }
  return normalizeText(ocr.text) === normalizeText(existing.text);
}

function normalizeText(value: string): string {
  return value.normalize('NFC').replace(/[^\p{Letter}\p{Number}]/gu, '').toLowerCase();
}

function bboxIou(a: Bbox, b: Bbox): number {
  const x0 = Math.max(a[0], b[0]);
  const y0 = Math.max(a[1], b[1]);
  const x1 = Math.min(a[2], b[2]);
  const y1 = Math.min(a[3], b[3]);
  const intersection = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const union = areaA + areaB - intersection;
  return union <= 0 ? 0 : intersection / union;
}

function centerDistance(a: Bbox, b: Bbox): number {
  const ax = (a[0] + a[2]) / 2;
  const ay = (a[1] + a[3]) / 2;
  const bx = (b[0] + b[2]) / 2;
  const by = (b[1] + b[3]) / 2;
  return Math.hypot(ax - bx, ay - by);
}
