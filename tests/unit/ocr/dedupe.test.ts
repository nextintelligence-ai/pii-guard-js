import { describe, expect, it } from 'vitest';
import type { Candidate } from '@/types/domain';
import { removeDuplicateOcrCandidates } from '@/core/ocr/dedupe';

describe('removeDuplicateOcrCandidates', () => {
  it('keeps existing text-layer candidate when OCR candidate overlaps and normalizes to same text', () => {
    const existing: Candidate[] = [
      {
        id: 'auto-1',
        pageIndex: 0,
        bbox: [10, 10, 80, 30],
        text: '000000-0000001',
        category: 'rrn',
        confidence: 1,
        source: 'auto',
      },
    ];
    const ocr: Candidate[] = [
      {
        id: 'ocr-1',
        pageIndex: 0,
        bbox: [12, 11, 82, 31],
        text: '000000 0000001',
        category: 'rrn',
        confidence: 0.93,
        source: 'ocr',
      },
      {
        id: 'ocr-2',
        pageIndex: 0,
        bbox: [120, 10, 190, 30],
        text: '000000-0000001',
        category: 'rrn',
        confidence: 0.91,
        source: 'ocr',
      },
    ];

    expect(removeDuplicateOcrCandidates(ocr, existing).map((c) => c.id)).toEqual(['ocr-2']);
  });
});
