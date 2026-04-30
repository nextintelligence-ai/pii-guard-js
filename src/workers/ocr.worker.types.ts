import type { NormalizedOcrResult, OcrBackend } from '@/core/ocr/types';

export type RecognizeImageRequest = {
  pageIndex: number;
  png: Uint8Array;
  backend?: OcrBackend;
};

export interface OcrWorkerApi {
  warmup(backend?: OcrBackend): Promise<{ backend: OcrBackend }>;
  recognizePng(request: RecognizeImageRequest): Promise<NormalizedOcrResult>;
  dispose(backend?: OcrBackend): Promise<void>;
}
