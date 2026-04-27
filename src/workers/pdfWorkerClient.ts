import { wrap, type Remote } from 'comlink';
import PdfWorker from './pdf.worker.ts?worker&inline';
import type { PdfWorkerApi } from './pdf.worker.types';

let cached: Remote<PdfWorkerApi> | null = null;

export function getPdfWorker(): Remote<PdfWorkerApi> {
  if (cached) return cached;
  // Vite `?worker&inline` 변환을 사용해 단일 HTML 빌드 시 워커가 인라인되도록 한다.
  // mupdf 가 dynamic import 를 사용하므로 worker.format='iife' 와 호환되지 않는
  // `new URL(..., import.meta.url)` 패턴 대신 이 형태를 사용한다.
  const w = new PdfWorker();
  cached = wrap<PdfWorkerApi>(w);
  return cached;
}
