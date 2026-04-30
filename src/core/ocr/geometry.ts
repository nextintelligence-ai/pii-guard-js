import type { Bbox } from '@/types/domain';
import type { LineForScan } from '@/core/detectors/types';
import type { OcrLine, OcrPoint } from './types';

export function lineToDetectorLine(line: OcrLine, paddingPx = 0): LineForScan {
  const bounds = getPolyBounds(line.poly);
  const chars = Array.from(line.text);
  const charCount = chars.length;

  if (charCount === 0 || bounds[2] <= bounds[0] || bounds[3] <= bounds[1]) {
    return { pageIndex: line.pageIndex, text: line.text, charBboxes: [] };
  }

  const width = bounds[2] - bounds[0];
  const charBboxes = chars.map((_, index): Bbox => {
    const x0 = bounds[0] + width * (index / charCount);
    const x1 = bounds[0] + width * ((index + 1) / charCount);
    return [
      Math.max(0, x0 - paddingPx),
      Math.max(0, bounds[1] - paddingPx),
      x1 + paddingPx,
      bounds[3] + paddingPx,
    ];
  });

  return {
    pageIndex: line.pageIndex,
    text: line.text,
    charBboxes,
  };
}

export function ocrPixelBboxToPdfBbox(bbox: Bbox, renderScale: number): Bbox {
  return [
    bbox[0] / renderScale,
    bbox[1] / renderScale,
    bbox[2] / renderScale,
    bbox[3] / renderScale,
  ];
}

function getPolyBounds(poly: OcrPoint[]): Bbox {
  const xs = poly.map((point) => point.x);
  const ys = poly.map((point) => point.y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
