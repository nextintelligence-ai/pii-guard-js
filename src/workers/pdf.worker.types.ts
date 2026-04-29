import type {
  ApplyReport,
  Candidate,
  PageMeta,
  RedactionBox,
  TextSpan,
} from '@/types/domain';
import type { StructuredLine } from '@/core/spanMap';

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
  /**
   * NER 용 구조화 텍스트. line → span → char 트리.
   * 현재 mupdf bridge 가 라인 단위만 노출하므로 라인 하나당 span 하나가 들어 있다.
   */
  extractStructuredText(pageIndex: number): Promise<StructuredLine[]>;
  detectAll(pageIndex: number): Promise<Candidate[]>;
  apply(boxes: RedactionBox[]): Promise<{ pdf: Uint8Array; report: ApplyReport }>;
  close(): Promise<void>;
}
