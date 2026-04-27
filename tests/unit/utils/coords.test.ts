import { describe, expect, it } from 'vitest';
import { pdfRectToCanvasPx, canvasPxToPdfRect } from '@/utils/coords';

const PAGE_H = 800;
const PAGE_W = 600;

describe('좌표 변환', () => {
  it('회전 0도에서 PDF 좌표를 캔버스 픽셀로 변환한다', () => {
    const r = pdfRectToCanvasPx([100, 100, 200, 120], 2, PAGE_W, PAGE_H, 0);
    expect(r).toEqual([200, (PAGE_H - 120) * 2, 400, (PAGE_H - 100) * 2]);
  });

  it('회전 90도에서 좌표를 적절히 회전한다', () => {
    const r = pdfRectToCanvasPx([100, 100, 200, 120], 2, PAGE_W, PAGE_H, 90);
    expect(r.length).toBe(4);
    expect(r[2] - r[0]).toBeGreaterThan(0);
    expect(r[3] - r[1]).toBeGreaterThan(0);
  });

  it('canvas → PDF 왕복 변환은 항등이다 (회전 0)', () => {
    const orig = [50, 60, 250, 110] as const;
    const px = pdfRectToCanvasPx(orig, 3, PAGE_W, PAGE_H, 0);
    const back = canvasPxToPdfRect(px, 3, PAGE_W, PAGE_H, 0);
    back.forEach((v, i) => expect(v).toBeCloseTo(orig[i], 5));
  });
});
