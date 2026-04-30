import { expose } from 'comlink';
import type { OcrResult } from '@paddleocr/paddleocr-js';
import { normalizeOcrResult } from '@/core/ocr/normalize';
import type { OcrBackend } from '@/core/ocr/types';
import type { OcrWorkerApi } from './ocr.worker.types';
import { installOrtWarningFilter, PADDLE_OCR_ORT_WASM_PATH_PREFIX } from './ortRuntimePaths';
import { createPaddleOcrWorker } from './paddleOcrWorker';

const KOREAN_REC_MODEL_NAME = 'korean_PP-OCRv5_mobile_rec';
const DET_MODEL_NAME = 'PP-OCRv5_mobile_det';
const DET_MODEL_ASSET = '/models/paddleocr/PP-OCRv5_mobile_det_onnx.tar';
const KOREAN_REC_MODEL_ASSET = '/models/paddleocr/korean_PP-OCRv5_mobile_rec_onnx.tar';
const DEFAULT_BACKEND: OcrBackend = 'auto';
const ROTATION_FALLBACKS = [90, 270, 180] as const;
const MIN_ACCEPTABLE_OCR_SCORE = 4;

type OcrRotation = 0 | (typeof ROTATION_FALLBACKS)[number];

type OcrEngine = {
  predict(input: Blob): Promise<OcrResult[]>;
  dispose?: () => Promise<void>;
};

type RotatedBlob = {
  blob: Blob;
  originalWidth: number;
  originalHeight: number;
  rotation: Exclude<OcrRotation, 0>;
};

const engines = new Map<OcrBackend, Promise<OcrEngine>>();

const api: OcrWorkerApi = {
  async warmup(backend = DEFAULT_BACKEND) {
    await getOcrEngine(backend);
    return { backend };
  },
  async recognizePng({ pageIndex, png, backend = DEFAULT_BACKEND }) {
    const bytes = new Uint8Array(png);
    const blob = new Blob([bytes], { type: 'image/png' });
    try {
      return await recognizeBlob(pageIndex, blob, backend);
    } catch (error) {
      if (backend !== 'wasm' && isWasmMemoryBoundsError(error)) {
        await disposeEngine(backend);
        return recognizeBlob(pageIndex, blob, 'wasm');
      }
      throw error;
    }
  },
  async dispose(backend) {
    if (backend) {
      await disposeEngine(backend);
      return;
    }

    await Promise.all(Array.from(engines.keys()).map((key) => disposeEngine(key)));
  },
};

async function recognizeBlob(pageIndex: number, blob: Blob, backend: OcrBackend) {
  const engine = await getOcrEngine(backend);
  const [result] = await engine.predict(blob);

  if (isGoodOcrResult(result)) {
    return normalizeOcrResult(withRotationRuntime(result, 0), pageIndex);
  }

  for (const rotation of ROTATION_FALLBACKS) {
    const rotated = await rotateBlob(blob, rotation);
    if (!rotated) continue;

    const [rotatedResult] = await engine.predict(rotated.blob);
    if (!isBetterOcrResult(rotatedResult, result)) continue;

    return normalizeOcrResult(
      withRotationRuntime(mapRotatedResultToOriginal(rotatedResult, rotated), rotation),
      pageIndex,
    );
  }

  return result ? normalizeOcrResult(withRotationRuntime(result, 0), pageIndex) : { lines: [] };
}

async function disposeEngine(backend: OcrBackend): Promise<void> {
  const engine = engines.get(backend);
  if (!engine) return;
  engines.delete(backend);

  let resolved: OcrEngine;
  try {
    resolved = await engine;
  } catch {
    return;
  }
  await resolved.dispose?.();
}

function isWasmMemoryBoundsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes('memory access out of bounds');
}

async function getOcrEngine(backend: OcrBackend): Promise<OcrEngine> {
  let engine = engines.get(backend);
  if (!engine) {
    engine = createOcrEngine(backend);
    engines.set(backend, engine);
  }
  return engine;
}

async function createOcrEngine(backend: OcrBackend): Promise<OcrEngine> {
  installOrtWarningFilter();

  const { PaddleOCR } = await import('@paddleocr/paddleocr-js');
  return PaddleOCR.create({
    worker: { createWorker: createPaddleOcrWorker },
    textDetectionModelName: DET_MODEL_NAME,
    textDetectionModelAsset: { url: DET_MODEL_ASSET },
    textRecognitionModelName: KOREAN_REC_MODEL_NAME,
    textRecognitionModelAsset: { url: KOREAN_REC_MODEL_ASSET },
    ortOptions: {
      backend,
      wasmPaths: PADDLE_OCR_ORT_WASM_PATH_PREFIX,
      numThreads: 1,
      simd: true,
    },
  });
}

expose(api);

function isGoodOcrResult(result: OcrResult | undefined): result is OcrResult {
  return ocrResultScore(result) >= MIN_ACCEPTABLE_OCR_SCORE;
}

function isBetterOcrResult(candidate: OcrResult | undefined, baseline: OcrResult | undefined): candidate is OcrResult {
  return ocrResultScore(candidate) > ocrResultScore(baseline);
}

function ocrResultScore(result: OcrResult | undefined): number {
  if (!result) return 0;
  return result.items.reduce((score, item) => {
    const textLength = item.text.trim().length;
    if (textLength === 0) return score;
    return score + textLength * (typeof item.score === 'number' ? item.score : 0.5);
  }, 0);
}

async function rotateBlob(blob: Blob, rotation: Exclude<OcrRotation, 0>): Promise<RotatedBlob | null> {
  if (
    typeof createImageBitmap !== 'function' ||
    typeof OffscreenCanvas === 'undefined'
  ) {
    return null;
  }

  const bitmap = await createImageBitmap(blob);
  try {
    const originalWidth = bitmap.width;
    const originalHeight = bitmap.height;
    const swapped = rotation === 90 || rotation === 270;
    const canvas = new OffscreenCanvas(
      swapped ? originalHeight : originalWidth,
      swapped ? originalWidth : originalHeight,
    );
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    applyCanvasRotation(ctx, rotation, originalWidth, originalHeight);
    ctx.drawImage(bitmap, 0, 0);

    return {
      blob: await canvas.convertToBlob({ type: 'image/png' }),
      originalWidth,
      originalHeight,
      rotation,
    };
  } finally {
    bitmap.close();
  }
}

function applyCanvasRotation(
  ctx: OffscreenCanvasRenderingContext2D,
  rotation: Exclude<OcrRotation, 0>,
  originalWidth: number,
  originalHeight: number,
): void {
  if (rotation === 90) {
    ctx.translate(originalHeight, 0);
    ctx.rotate(Math.PI / 2);
    return;
  }

  if (rotation === 180) {
    ctx.translate(originalWidth, originalHeight);
    ctx.rotate(Math.PI);
    return;
  }

  ctx.translate(0, originalWidth);
  ctx.rotate(-Math.PI / 2);
}

function mapRotatedResultToOriginal(result: OcrResult, rotated: RotatedBlob): OcrResult {
  return {
    ...result,
    image: {
      width: rotated.originalWidth,
      height: rotated.originalHeight,
    },
    items: result.items.map((item) => ({
      ...item,
      poly: item.poly.map(([x, y]) =>
        mapRotatedPointToOriginal(x, y, rotated.rotation, rotated.originalWidth, rotated.originalHeight),
      ),
    })),
  };
}

function mapRotatedPointToOriginal(
  x: number,
  y: number,
  rotation: OcrRotation,
  originalWidth: number,
  originalHeight: number,
): [number, number] {
  if (rotation === 90) return [y, originalHeight - x];
  if (rotation === 180) return [originalWidth - x, originalHeight - y];
  if (rotation === 270) return [originalWidth - y, x];
  return [x, y];
}

function withRotationRuntime(result: OcrResult, rotation: OcrRotation): OcrResult {
  return {
    ...result,
    runtime: {
      ...result.runtime,
      rotationApplied: rotation,
    } as OcrResult['runtime'],
  };
}
