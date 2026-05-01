import { describe, expect, it } from 'vitest';
import { normalizeOcrResult } from '@/core/ocr/normalize';

describe('normalizeOcrResult', () => {
  it('trims empty OCR items and normalizes text to NFC', () => {
    const result = normalizeOcrResult({
      items: [
        { text: '  000000-0000001  ', score: 0.92, poly: [[0, 0], [100, 0], [100, 20], [0, 20]] },
        { text: '   ', score: 0.7, poly: [[0, 30], [10, 30], [10, 40], [0, 40]] },
      ],
      metrics: { totalMs: 10, detectedBoxes: 1, recognizedCount: 1 },
      runtime: { requestedBackend: 'auto', detProvider: 'wasm', recProvider: 'wasm', webgpuAvailable: false },
    });

    expect(result.lines).toEqual([
      {
        id: 'line-1',
        pageIndex: 0,
        text: '000000-0000001',
        score: 0.92,
        poly: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 20 },
          { x: 0, y: 20 },
        ],
      },
    ]);
  });
});
