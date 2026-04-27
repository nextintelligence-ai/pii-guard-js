import { expose, transfer } from 'comlink';
import {
  closeDocument,
  ensureMupdfReady,
  extractSpans,
  openDocument,
  renderPage,
} from '@/core/mupdfBridge';
import type { PdfWorkerApi } from './pdf.worker.types';

const api: Partial<PdfWorkerApi> = {
  async ping() {
    await ensureMupdfReady();
    return 'pong' as const;
  },
  async open(buf, opts) {
    const pages = await openDocument(buf, opts?.password);
    return { pages };
  },
  async renderPage(pageIndex, scale) {
    const result = await renderPage(pageIndex, scale);
    // ImageBitmap 은 transferable 이므로 zero-copy 로 메인 스레드에 전달.
    return transfer(result, [result.bitmap]);
  },
  async extractSpans(pageIndex) {
    return extractSpans(pageIndex);
  },
  async close() {
    closeDocument();
  },
};

expose(api);
