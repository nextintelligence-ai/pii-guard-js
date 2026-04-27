import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  applyRedactions,
  closeDocument,
  ensureMupdfReady,
  extractLines,
  openDocument,
  setWasmBinary,
} from '@/core/mupdfBridge';
import { decodeMupdfWasm } from '@/wasm/decodeMupdfWasm';
import { runDetectors } from '@/core/detectors';
import type { RedactionBox } from '@/types/domain';

describe('통합: 디지털 PDF 익명화', () => {
  beforeAll(async () => {
    setWasmBinary(decodeMupdfWasm());
    await ensureMupdfReady();
  });

  afterAll(() => {
    closeDocument();
  });

  it('자동 탐지된 항목이 결과 PDF에서 사라진다 (postCheckLeaks=0)', async () => {
    const fixturePath = path.resolve('tests/fixtures/digital-with-pii.pdf');
    const buf = await readFile(fixturePath);
    // jsdom 환경에서 Node 의 ArrayBuffer 가 mupdf 측 instanceof 검사를 통과하지 않을 수
    // 있어, 새 Uint8Array 를 만들고 그 underlying buffer 를 ArrayBuffer 로 넘긴다.
    // (Uint8Array 가 새로 할당한 buffer 는 글로벌 ArrayBuffer 인스턴스이다.)
    const u8 = new Uint8Array(buf.byteLength);
    u8.set(buf);
    const ab = u8.buffer;

    const pages = await openDocument(ab);
    expect(pages.length).toBeGreaterThan(0);

    const lines = await extractLines(0);
    const candidates = runDetectors(lines);

    // 픽스처에는 email/phone/card 3종 PII 가 있다.
    expect(candidates.length).toBeGreaterThan(0);

    const boxes: RedactionBox[] = candidates.map((c) => ({
      id: c.id,
      pageIndex: c.pageIndex,
      bbox: c.bbox,
      source: 'auto',
      category: c.category,
      enabled: true,
    }));

    const { pdf, report } = await applyRedactions(boxes, { kind: 'blackout' });
    expect(pdf.byteLength).toBeGreaterThan(0);
    expect(report.totalBoxes).toBe(boxes.length);
    expect(report.postCheckLeaks).toBe(0);
  });
});
