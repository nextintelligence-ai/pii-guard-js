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

type OcrEngine = {
  predict(input: Blob): Promise<OcrResult[]>;
  dispose?: () => Promise<void>;
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
  if (!result) {
    return { lines: [] };
  }
  return normalizeOcrResult(result, pageIndex);
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
