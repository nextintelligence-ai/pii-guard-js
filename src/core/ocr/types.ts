import type { Bbox } from '@/types/domain';

export type OcrBackend = 'auto' | 'webgpu' | 'wasm';

export type OcrPoint = {
  x: number;
  y: number;
};

export type OcrLine = {
  id: string;
  pageIndex: number;
  text: string;
  score: number | undefined;
  poly: OcrPoint[];
};

export type NormalizedOcrResult = {
  lines: OcrLine[];
  metrics?: unknown;
  runtime?: unknown;
};

export type OcrDetectionInput = {
  pageIndex: number;
  renderScale: number;
  lines: OcrLine[];
};

export type OcrPixelBbox = Bbox;
