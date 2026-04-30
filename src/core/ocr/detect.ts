import { runDetectors } from '@/core/detectors';
import type { Candidate } from '@/types/domain';
import { lineToDetectorLine, ocrPixelBboxToPdfBbox } from './geometry';
import type { OcrDetectionInput } from './types';

export function detectOcrCandidates(input: OcrDetectionInput): Candidate[] {
  const detectorLines = input.lines.map((line) => lineToDetectorLine(line, 4));
  return preferSpecificOverlappingCandidates(runDetectors(detectorLines, undefined, 'ocr')).map((candidate) => ({
    ...candidate,
    bbox: ocrPixelBboxToPdfBbox(candidate.bbox, input.renderScale),
    confidence: findLineConfidence(input.lines, candidate.pageIndex, candidate.text),
  }));
}

function findLineConfidence(lines: OcrDetectionInput['lines'], pageIndex: number, text: string): number {
  const line = lines.find((item) => item.pageIndex === pageIndex && item.text.includes(text));
  return typeof line?.score === 'number' ? line.score : 1;
}

function preferSpecificOverlappingCandidates(candidates: Candidate[]): Candidate[] {
  const out: Candidate[] = [];

  for (const candidate of candidates) {
    const existingIndex = out.findIndex(
      (existing) =>
        existing.pageIndex === candidate.pageIndex &&
        bboxContainsEither(existing.bbox, candidate.bbox) &&
        textContainsEither(existing.text, candidate.text),
    );

    if (existingIndex === -1) {
      out.push(candidate);
      continue;
    }

    if (categoryPriority(candidate) < categoryPriority(out[existingIndex])) {
      out[existingIndex] = candidate;
    }
  }

  return out;
}

function categoryPriority(candidate: Candidate): number {
  switch (candidate.category) {
    case 'rrn':
      return 0;
    case 'businessNo':
      return 1;
    case 'card':
      return 2;
    case 'account':
      return 3;
    case 'email':
      return 4;
    case 'phone':
      return 5;
    case 'address':
      return 6;
    default:
      return 10;
  }
}

function bboxContainsEither(a: Candidate['bbox'], b: Candidate['bbox']): boolean {
  return bboxContains(a, b) || bboxContains(b, a);
}

function bboxContains(a: Candidate['bbox'], b: Candidate['bbox']): boolean {
  return a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3];
}

function textContainsEither(a: string, b: string): boolean {
  const normalizedA = normalizeText(a);
  const normalizedB = normalizeText(b);
  return normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA);
}

function normalizeText(value: string): string {
  return value.normalize('NFC').replace(/[^\p{Letter}\p{Number}]/gu, '').toLowerCase();
}
