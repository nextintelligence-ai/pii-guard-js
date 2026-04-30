import type { Bbox } from '@/types/domain';
import type { LineForScan } from '@/core/detectors/types';
import type { OcrLine, OcrPoint } from './types';

export function lineToDetectorLine(line: OcrLine, paddingPx = 0): LineForScan {
  const bounds = getPolyBounds(line.poly);
  const glyphs = Array.from(line.text);
  const weights = glyphs.map(approximateOcrGlyphWidth);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  if (glyphs.length === 0 || totalWeight <= 0 || bounds[2] <= bounds[0] || bounds[3] <= bounds[1]) {
    return { pageIndex: line.pageIndex, text: line.text, charBboxes: [] };
  }

  const width = bounds[2] - bounds[0];
  const charBboxes: Bbox[] = [];
  let offsetWeight = 0;
  glyphs.forEach((glyph, index) => {
    const x0 = bounds[0] + width * (offsetWeight / totalWeight);
    offsetWeight += weights[index] ?? 1;
    const x1 = bounds[0] + width * (offsetWeight / totalWeight);
    const bbox: Bbox = [
      roundCoord(Math.max(0, x0 - paddingPx)),
      roundCoord(Math.max(0, bounds[1] - paddingPx)),
      roundCoord(x1 + paddingPx),
      roundCoord(bounds[3] + paddingPx),
    ];
    for (let i = 0; i < glyph.length; i += 1) {
      charBboxes.push(bbox);
    }
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

function approximateOcrGlyphWidth(glyph: string): number {
  if (/\s/u.test(glyph)) return 0.35;
  if (/[-‐‑‒–—―.,:;()[\]{}]/u.test(glyph)) return 0.4;
  if (/[0-9]/u.test(glyph)) return 0.62;
  if (/[A-Za-z]/u.test(glyph)) return 0.68;
  if (/[가-힣ㄱ-ㅎㅏ-ㅣ一-龯ぁ-ゟ゠-ヿ]/u.test(glyph)) return 1;
  return 0.8;
}

function roundCoord(value: number): number {
  return Number(value.toFixed(6));
}
