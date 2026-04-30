import type { NormalizedOcrResult, OcrLine } from './types';

type PaddleItem = {
  text: string;
  score?: number;
  poly: Array<[number, number]>;
};

type PaddleResult = {
  items: PaddleItem[];
  metrics?: unknown;
  runtime?: unknown;
};

export function normalizeOcrResult(result: PaddleResult, pageIndex = 0): NormalizedOcrResult {
  const lines: OcrLine[] = result.items
    .map((item) => ({
      text: item.text.trim().normalize('NFC'),
      score: item.score,
      poly: item.poly.map(([x, y]) => ({ x, y })),
    }))
    .filter((item) => item.text.length > 0)
    .map((item, index) => ({
      id: `line-${index + 1}`,
      pageIndex,
      text: item.text,
      score: item.score,
      poly: item.poly,
    }));

  return {
    lines,
    metrics: result.metrics,
    runtime: result.runtime,
  };
}
