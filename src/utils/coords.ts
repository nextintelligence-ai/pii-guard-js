import type { Bbox } from '@/types/domain';

export type Rotation = 0 | 90 | 180 | 270;

export function pdfRectToCanvasPx(
  rect: Bbox,
  scale: number,
  pageWidthPt: number,
  pageHeightPt: number,
  rotation: Rotation,
): Bbox {
  const [x0, y0, x1, y1] = rect;
  const flipY = (y: number) => pageHeightPt - y;

  const corners: Array<[number, number]> = [
    [x0, flipY(y0)],
    [x1, flipY(y0)],
    [x1, flipY(y1)],
    [x0, flipY(y1)],
  ];

  const rotated = corners.map(([x, y]) => {
    switch (rotation) {
      case 0:
        return [x, y] as [number, number];
      case 90:
        return [pageHeightPt - y, x] as [number, number];
      case 180:
        return [pageWidthPt - x, pageHeightPt - y] as [number, number];
      case 270:
        return [y, pageWidthPt - x] as [number, number];
    }
  });

  const xs = rotated.map((p) => p[0] * scale);
  const ys = rotated.map((p) => p[1] * scale);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function canvasPxToPdfRect(
  rect: Bbox,
  scale: number,
  pageWidthPt: number,
  pageHeightPt: number,
  rotation: Rotation,
): Bbox {
  const [x0, y0, x1, y1] = rect;
  const corners: Array<[number, number]> = [
    [x0 / scale, y0 / scale],
    [x1 / scale, y0 / scale],
    [x1 / scale, y1 / scale],
    [x0 / scale, y1 / scale],
  ];

  const unrotated = corners.map(([x, y]) => {
    switch (rotation) {
      case 0:
        return [x, y] as [number, number];
      case 90:
        return [y, pageHeightPt - x] as [number, number];
      case 180:
        return [pageWidthPt - x, pageHeightPt - y] as [number, number];
      case 270:
        return [pageWidthPt - y, x] as [number, number];
    }
  });

  const flipY = (y: number) => pageHeightPt - y;
  const xs = unrotated.map((p) => p[0]);
  const ys = unrotated.map((p) => flipY(p[1]));
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function bboxesIntersect(a: Bbox, b: Bbox): boolean {
  return !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
}
