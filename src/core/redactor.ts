/**
 * redactor — Redact 어노테이션 생성/적용 + 메타데이터 정리.
 *
 * mupdf 1.27 실 API 메모:
 * - Redact 어노테이션은 `PDFPage.createAnnotation('Redact')` 로 생성한다.
 *   `Page` 가 아니라 `PDFPage` 인 경우에만 가능하므로 호출부는 `Document.asPDF()`
 *   결과(`PDFDocument`)에서 `loadPage` 한다.
 * - 어노테이션에 `setOverlayText` 메서드는 존재하지 않는다. Redact 의 overlay text
 *   는 `setContents(text)` 로 지정한다 (mupdf 가 redaction 적용 시 박스 내부에
 *   contents 를 그려준다).
 * - `applyRedactions` 는 `PDFPage` 인스턴스 메서드이며, 각 페이지마다 호출한다.
 * - 메타데이터 키는 `Document.META_INFO_*` 정적 상수에 정의된 `info:Title` 등
 *   prefix 를 가진다.
 */
import type * as MupdfNS from 'mupdf';
import type {
  ApplyReport,
  DetectionCategory,
  RedactionBox,
} from '@/types/domain';

const META_KEYS: readonly string[] = [
  'info:Title',
  'info:Author',
  'info:Subject',
  'info:Keywords',
  'info:Creator',
  'info:Producer',
];

function makeEmptyCounts(): ApplyReport['byCategory'] {
  return {
    rrn: 0,
    phone: 0,
    email: 0,
    account: 0,
    businessNo: 0,
    card: 0,
    manual: 0,
  };
}

/**
 * 활성화된 박스들을 PDFPage Redact 어노테이션으로 변환한다.
 * - 영향 받은 페이지 인덱스 집합 / 카테고리별 카운트 / 총 적용 개수 반환.
 * - 호출자는 반환된 페이지 목록에 대해 `applyAllRedactions` 를 이어서 호출한다.
 */
export function buildRedactAnnotations(
  pdfDoc: MupdfNS.PDFDocument,
  boxes: RedactionBox[],
): { pages: number[]; counts: ApplyReport['byCategory']; total: number } {
  const counts = makeEmptyCounts();
  const pageSet = new Set<number>();
  let total = 0;

  for (const box of boxes) {
    if (!box.enabled) continue;
    const page = pdfDoc.loadPage(box.pageIndex);
    try {
      const annot = page.createAnnotation('Redact');
      annot.setRect([box.bbox[0], box.bbox[1], box.bbox[2], box.bbox[3]]);
      annot.update();
      const cat: DetectionCategory | 'manual' = box.category ?? 'manual';
      counts[cat] += 1;
      pageSet.add(box.pageIndex);
      total += 1;
    } finally {
      page.destroy();
    }
  }

  const pages = [...pageSet].sort((a, b) => a - b);
  return { pages, counts, total };
}

/**
 * 주어진 페이지들에 대해 PDFPage.applyRedactions 호출.
 * black_boxes=true: 텍스트 영역을 검은 사각형으로 채움.
 */
export function applyAllRedactions(
  pdfDoc: MupdfNS.PDFDocument,
  pageIndexes: number[],
): void {
  for (const i of pageIndexes) {
    const page = pdfDoc.loadPage(i);
    try {
      page.applyRedactions(true);
    } finally {
      page.destroy();
    }
  }
}

/**
 * Document Info 사전의 PII 흔적을 비운다. 일부 키는 미지원 엔진/드라이버에서
 * 예외가 날 수 있으므로 try/catch 로 무시한다.
 */
export function clearMetadata(doc: MupdfNS.Document): void {
  for (const key of META_KEYS) {
    try {
      doc.setMetaData(key, '');
    } catch {
      /* 일부 키는 PDF 가 지원하지 않을 수 있다. 무시. */
    }
  }
}
