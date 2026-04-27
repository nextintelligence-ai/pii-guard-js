import type {
  ApplyReport,
  Candidate,
  PageMeta,
  RedactionBox,
  TextSpan,
} from '@/types/domain';

export interface PdfWorkerApi {
  ping(): Promise<'pong'>;
  open(buf: ArrayBuffer, opts?: { password?: string }): Promise<{ pages: PageMeta[] }>;
  renderPage(
    pageIndex: number,
    scale: number,
  ): Promise<{
    bitmap: ImageBitmap;
    widthPx: number;
    heightPx: number;
    scale: number;
  }>;
  extractSpans(pageIndex: number): Promise<TextSpan[]>;
  detectAll(pageIndex: number): Promise<Candidate[]>;
  apply(boxes: RedactionBox[]): Promise<{ pdf: Uint8Array; report: ApplyReport }>;
  close(): Promise<void>;
}
