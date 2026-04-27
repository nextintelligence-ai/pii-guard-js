import type { Bbox } from '@/types/domain';

export type Rotation = 0 | 90 | 180 | 270;

// MuPDF page space already uses the canvas-friendly coordinate system:
// top-left origin, y increasing downward, page rotation reflected in bounds.
export function pdfRectToCanvasPx(
  rect: Bbox,
  scale: number,
  _pageWidthPt: number,
  _pageHeightPt: number,
  _rotation: Rotation,
): Bbox {
  const [x0, y0, x1, y1] = rect;
  return [x0 * scale, y0 * scale, x1 * scale, y1 * scale];
}

export function canvasPxToPdfRect(
  rect: Bbox,
  scale: number,
  _pageWidthPt: number,
  _pageHeightPt: number,
  _rotation: Rotation,
): Bbox {
  const [x0, y0, x1, y1] = rect;
  return [x0 / scale, y0 / scale, x1 / scale, y1 / scale];
}

export function bboxesIntersect(a: Bbox, b: Bbox): boolean {
  return !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
}
