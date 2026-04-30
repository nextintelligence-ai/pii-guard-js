import { describe, expect, it } from 'vitest';
import { detectOcrCandidates } from '@/core/ocr/detect';

describe('detectOcrCandidates', () => {
  it('runs regex detectors on OCR lines and emits OCR candidates in PDF points', () => {
    const candidates = detectOcrCandidates({
      pageIndex: 0,
      renderScale: 2,
      lines: [
        {
          id: 'line-1',
          pageIndex: 0,
          text: '주민번호 801129-1234567',
          score: 0.95,
          poly: [
            { x: 0, y: 0 },
            { x: 220, y: 0 },
            { x: 220, y: 20 },
            { x: 0, y: 20 },
          ],
        },
      ],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      pageIndex: 0,
      text: '801129-1234567',
      category: 'rrn',
      source: 'ocr',
    });
    expect(candidates[0]?.bbox[2]).toBeGreaterThan(candidates[0]?.bbox[0] ?? 0);
  });
});
