import { describe, expect, it } from 'vitest';
import { pdfRectToCanvasPx, canvasPxToPdfRect } from '@/utils/coords';

const PAGE_H = 800;
const PAGE_W = 600;

describe('좌표 변환', () => {
  it('MuPDF 좌상단 좌표를 Y축 반전 없이 캔버스 픽셀로 변환한다', () => {
    const r = pdfRectToCanvasPx([100, 100, 200, 120], 2, PAGE_W, PAGE_H, 0);
    expect(r).toEqual([200, 200, 400, 240]);
  });

  it('회전된 페이지도 MuPDF가 반환한 페이지 좌표를 추가 회전하지 않는다', () => {
    const r = pdfRectToCanvasPx([795, 50, 815, 118], 1.5, 842, 595, 90);
    expect(r).toEqual([1192.5, 75, 1222.5, 177]);
  });

  it('canvas → MuPDF 좌표 왕복 변환은 항등이다', () => {
    const orig = [50, 60, 250, 110] as const;
    const px = pdfRectToCanvasPx(orig, 3, PAGE_W, PAGE_H, 0);
    const back = canvasPxToPdfRect(px, 3, PAGE_W, PAGE_H, 0);
    back.forEach((v, i) => expect(v).toBeCloseTo(orig[i], 5));
  });

  it('캔버스에서 만든 수동 박스를 MuPDF redaction 좌표로 되돌린다', () => {
    const back = canvasPxToPdfRect([75, 112.5, 354.21, 141.285], 1.5, PAGE_W, PAGE_H, 0);
    expect(back[0]).toBeCloseTo(50, 5);
    expect(back[1]).toBeCloseTo(75, 5);
    expect(back[2]).toBeCloseTo(236.14, 5);
    expect(back[3]).toBeCloseTo(94.19, 5);
  });
});
