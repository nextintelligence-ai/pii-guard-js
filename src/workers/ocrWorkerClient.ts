import { wrap, type Remote } from 'comlink';
import OcrWorker from './ocr.worker.ts?worker';
import type { OcrWorkerApi } from './ocr.worker.types';

let cached: Remote<OcrWorkerApi> | null = null;

export function getOcrWorker(): Remote<OcrWorkerApi> {
  if (!cached) {
    cached = wrap<OcrWorkerApi>(new OcrWorker());
  }
  return cached;
}
