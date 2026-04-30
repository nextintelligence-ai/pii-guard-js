import { describe, expect, it } from 'vitest';
import { lineToDetectorLine, ocrPixelBboxToPdfBbox } from '@/core/ocr/geometry';

describe('OCR geometry', () => {
  it('creates proportional char boxes from one OCR line', () => {
    const line = {
      id: 'line-1',
      pageIndex: 0,
      text: 'ABCDEF',
      score: 0.8,
      poly: [
        { x: 10, y: 20 },
        { x: 70, y: 20 },
        { x: 70, y: 40 },
        { x: 10, y: 40 },
      ],
    };

    expect(lineToDetectorLine(line).charBboxes).toEqual([
      [10, 20, 20, 40],
      [20, 20, 30, 40],
      [30, 20, 40, 40],
      [40, 20, 50, 40],
      [50, 20, 60, 40],
      [60, 20, 70, 40],
    ]);
  });

  it('converts OCR pixel bbox to PDF point bbox using render scale', () => {
    expect(ocrPixelBboxToPdfBbox([20, 40, 100, 80], 2)).toEqual([10, 20, 50, 40]);
  });
});
