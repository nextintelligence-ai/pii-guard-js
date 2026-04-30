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

  it('uses approximate visual character widths for OCR line subdivision', () => {
    const line = {
      id: 'line-1',
      pageIndex: 0,
      text: '고객 010-1234-5678 확인',
      score: 0.8,
      poly: [
        { x: 0, y: 10 },
        { x: 240, y: 10 },
        { x: 240, y: 30 },
        { x: 0, y: 30 },
      ],
    };

    const phoneBoxes = lineToDetectorLine(line).charBboxes.slice(3, 16);
    const phoneBbox = [
      Math.min(...phoneBoxes.map((bbox) => bbox[0])),
      Math.min(...phoneBoxes.map((bbox) => bbox[1])),
      Math.max(...phoneBoxes.map((bbox) => bbox[2])),
      Math.max(...phoneBoxes.map((bbox) => bbox[3])),
    ];

    expect(phoneBbox[0]).toBeGreaterThan(40);
    expect(phoneBbox[2]).toBeLessThan(200);
  });

  it('converts OCR pixel bbox to PDF point bbox using render scale', () => {
    expect(ocrPixelBboxToPdfBbox([20, 40, 100, 80], 2)).toEqual([10, 20, 50, 40]);
  });
});
