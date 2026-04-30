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

  it('keeps OCR substring candidates tight inside the source line bounds', () => {
    const candidates = detectOcrCandidates({
      pageIndex: 0,
      renderScale: 2,
      lines: [
        {
          id: 'line-1',
          pageIndex: 0,
          text: '고객 010-1234-5678 확인',
          score: 0.95,
          poly: [
            { x: 0, y: 10 },
            { x: 240, y: 10 },
            { x: 240, y: 30 },
            { x: 0, y: 30 },
          ],
        },
      ],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      text: '010-1234-5678',
      category: 'phone',
      source: 'ocr',
    });
    expect(candidates[0]?.bbox[0]).toBeGreaterThan(21);
    expect(candidates[0]?.bbox[2]).toBeLessThan(99);
    expect((candidates[0]?.bbox[3] ?? 0) - (candidates[0]?.bbox[1] ?? 0)).toBeLessThanOrEqual(11);
  });
});
