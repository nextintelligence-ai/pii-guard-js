/**
 * mupdfBridge — mupdf@1.27.0 초기화 및 문서/페이지 작업 래퍼.
 *
 * mupdf@1.27.0 의 ESM 엔트리(`mupdf/dist/mupdf.js`)는 import 평가 시점에
 * top-level `await libmupdf_wasm(globalThis["$libmupdf_wasm_Module"])` 를 실행한다.
 * 따라서 WASM 바이너리를 외부에서 주입하려면 mupdf 모듈을 import 하기 *전에*
 * `globalThis["$libmupdf_wasm_Module"] = { wasmBinary: <Uint8Array> }` 로 설정해야 한다.
 *
 * 이 모듈은 dynamic import 로 그 순서를 보장한다.
 */
import type * as MupdfNS from 'mupdf';
import { runDetectors } from '@/core/detectors';
import type { LineForScan } from '@/core/detectors/types';
import {
  buildRedactAnnotations,
  applyAllRedactions,
  clearMetadata,
} from '@/core/redactor';
import type {
  ApplyReport,
  Bbox,
  MaskStyle,
  PageMeta,
  RedactionBox,
  TextSpan,
} from '@/types/domain';

type MupdfModule = typeof MupdfNS;

let mupdfModulePromise: Promise<MupdfModule> | null = null;

type WasmDeferred = {
  promise: Promise<Uint8Array>;
  resolve: (b: Uint8Array) => void;
};
let wasmDeferred: WasmDeferred | null = null;

function getWasmDeferred(): WasmDeferred {
  if (!wasmDeferred) {
    let resolve!: (b: Uint8Array) => void;
    const promise = new Promise<Uint8Array>((r) => {
      resolve = r;
    });
    wasmDeferred = { promise, resolve };
  }
  return wasmDeferred;
}

/**
 * WASM 바이너리를 외부에서 주입한다.
 * - 워커 환경: 메인이 postMessage 로 전달한 ArrayBuffer 를 Uint8Array 로 감싸 호출.
 * - Node 테스트: `decodeMupdfWasm()` 결과를 직접 호출.
 *
 * 두 번 이상 호출돼도 첫 호출의 buffer 만 적용된다 (Promise.resolve idempotency).
 */
export function setWasmBinary(buf: Uint8Array): void {
  getWasmDeferred().resolve(buf);
}

/**
 * mupdf 를 외부 주입 WASM 바이너리로 1회 초기화하고 모듈 네임스페이스를 반환한다.
 * 동시 호출되어도 단일 Promise 를 공유한다.
 */
export function ensureMupdfReady(): Promise<MupdfModule> {
  if (!mupdfModulePromise) {
    mupdfModulePromise = (async () => {
      const wasmBinary = await getWasmDeferred().promise;
      // mupdf-wasm.js 가 globalThis["$libmupdf_wasm_Module"] 을 Emscripten Module 로 사용한다.
      // wasmBinary 를 미리 주입해 fetch 없이 인스턴스화한다.
      const g = globalThis as unknown as Record<string, unknown>;
      const existing = g['$libmupdf_wasm_Module'];
      const existingObj =
        typeof existing === 'object' && existing !== null
          ? (existing as Record<string, unknown>)
          : {};
      g['$libmupdf_wasm_Module'] = {
        ...existingObj,
        wasmBinary,
      };
      const mod = (await import('mupdf')) as MupdfModule;
      return mod;
    })();
  }
  return mupdfModulePromise;
}

/* ---------------- Document state (worker module-level) ---------------- */

let currentDoc: MupdfNS.Document | null = null;
let currentPdf: MupdfNS.PDFDocument | null = null;

/** 열린 문서의 페이지 메타 정보를 채운다. */
export async function openDocument(
  buf: ArrayBuffer,
  password?: string,
): Promise<PageMeta[]> {
  const mupdf = await ensureMupdfReady();
  closeDocument();
  // openDocument 는 ArrayBuffer 를 직접 받는다.
  const doc = mupdf.Document.openDocument(buf, 'application/pdf');
  if (doc.needsPassword()) {
    if (password === undefined) {
      doc.destroy();
      throw new Error('PASSWORD_REQUIRED');
    }
    const ok = doc.authenticatePassword(password);
    // mupdf 의 authenticatePassword 는 0 이면 실패, 그 외는 권한 비트.
    if (!ok) {
      doc.destroy();
      throw new Error('PASSWORD_WRONG');
    }
  }
  currentDoc = doc;
  currentPdf = doc.asPDF();

  const pageCount = doc.countPages();
  const pages: PageMeta[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    const page = doc.loadPage(i);
    try {
      const bounds = page.getBounds();
      const widthPt = bounds[2] - bounds[0];
      const heightPt = bounds[3] - bounds[1];
      const rotation = readPageRotation(page);
      pages.push({
        index: i,
        widthPt,
        heightPt,
        rotation,
      });
    } finally {
      page.destroy();
    }
  }
  return pages;
}

/** PDF 페이지 객체의 /Rotate 항목을 읽어 0|90|180|270 으로 정규화한다. */
function readPageRotation(page: MupdfNS.Page): 0 | 90 | 180 | 270 {
  // PDFPage 가 아닌 경우(예: XPS) 회전 정보는 0 으로 간주.
  const maybePdfPage = page as Partial<MupdfNS.PDFPage>;
  if (typeof maybePdfPage.getObject !== 'function') {
    return 0;
  }
  try {
    const obj = maybePdfPage.getObject();
    const rotateObj = obj?.getInheritable?.('Rotate');
    if (!rotateObj || rotateObj.isNull?.()) return 0;
    const raw = rotateObj.asNumber?.() ?? 0;
    const norm = ((raw % 360) + 360) % 360;
    if (norm === 90 || norm === 180 || norm === 270) return norm;
    return 0;
  } catch {
    return 0;
  }
}

/** 현재 문서를 닫고 메모리를 해제한다. */
export function closeDocument(): void {
  if (currentDoc) {
    try {
      currentDoc.destroy();
    } catch {
      /* ignore */
    }
    currentDoc = null;
    currentPdf = null;
  }
}

/** 내부 보관된 문서 핸들 반환. 없으면 예외. */
function requireDoc(): MupdfNS.Document {
  if (!currentDoc) throw new Error('NO_DOCUMENT_OPEN');
  return currentDoc;
}

/** 페이지를 비트맵으로 렌더링한다. RGBA ImageBitmap 반환. */
export async function renderPage(
  pageIndex: number,
  scale: number,
): Promise<{
  bitmap: ImageBitmap;
  widthPx: number;
  heightPx: number;
  scale: number;
}> {
  const mupdf = await ensureMupdfReady();
  const doc = requireDoc();
  const page = doc.loadPage(pageIndex);
  let pixmap: MupdfNS.Pixmap | null = null;
  try {
    const matrix = mupdf.Matrix.scale(scale, scale);
    pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);
    const widthPx = pixmap.getWidth();
    const heightPx = pixmap.getHeight();
    const numComponents = pixmap.getNumberOfComponents();
    const stride = pixmap.getStride();
    const samples = pixmap.getPixels();
    const rgba = pixmapToRgba(samples, widthPx, heightPx, stride, numComponents);
    // ImageData 는 ArrayBuffer 기반 Uint8ClampedArray 를 요구한다 (lib.dom).
    const imageData = new ImageData(
      rgba as Uint8ClampedArray<ArrayBuffer>,
      widthPx,
      heightPx,
    );
    const bitmap = await createImageBitmap(imageData);
    return { bitmap, widthPx, heightPx, scale };
  } finally {
    pixmap?.destroy();
    page.destroy();
  }
}

/**
 * mupdf Pixmap.getPixels() 결과(RGB 패킹 또는 RGBA)를 RGBA Uint8ClampedArray 로 변환.
 * stride 와 컴포넌트 수를 고려해 line-by-line 으로 안전하게 복사한다.
 */
function pixmapToRgba(
  samples: Uint8ClampedArray,
  width: number,
  height: number,
  stride: number,
  numComponents: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  if (numComponents === 4) {
    // 이미 RGBA: stride 만 보정.
    for (let y = 0; y < height; y += 1) {
      const srcRow = y * stride;
      const dstRow = y * width * 4;
      out.set(samples.subarray(srcRow, srcRow + width * 4), dstRow);
    }
    return out;
  }
  // RGB → RGBA
  for (let y = 0; y < height; y += 1) {
    const srcRow = y * stride;
    for (let x = 0; x < width; x += 1) {
      const s = srcRow + x * numComponents;
      const d = (y * width + x) * 4;
      out[d] = samples[s] ?? 0;
      out[d + 1] = samples[s + 1] ?? 0;
      out[d + 2] = samples[s + 2] ?? 0;
      out[d + 3] = 255;
    }
  }
  return out;
}

/** 텍스트 스팬 추출. 라인 단위 bbox + 누적 텍스트. */
export async function extractSpans(pageIndex: number): Promise<TextSpan[]> {
  await ensureMupdfReady();
  const doc = requireDoc();
  const page = doc.loadPage(pageIndex);
  let stext: MupdfNS.StructuredText | null = null;
  try {
    stext = page.toStructuredText();
    const spans: TextSpan[] = [];
    let currentText = '';
    let currentBbox: Bbox | null = null;
    stext.walk({
      beginLine: (bbox) => {
        currentText = '';
        currentBbox = [bbox[0], bbox[1], bbox[2], bbox[3]];
      },
      onChar: (c) => {
        currentText += c;
      },
      endLine: () => {
        if (currentBbox && currentText.length > 0) {
          spans.push({
            text: currentText,
            bbox: currentBbox,
            pageIndex,
          });
        }
        currentText = '';
        currentBbox = null;
      },
    });
    return spans;
  } finally {
    stext?.destroy();
    page.destroy();
  }
}

/**
 * 임의의 mupdf Document 핸들에서 라인 단위 텍스트 + 글자 bbox 를 추출한다.
 * `extractLines` 와 postCheck (재오픈한 임시 문서 대상) 양쪽에서 사용한다.
 */
function extractLinesFromDoc(
  doc: MupdfNS.Document,
  pageIndex: number,
): { pageIndex: number; text: string; charBboxes: Bbox[] }[] {
  const page = doc.loadPage(pageIndex);
  let stext: MupdfNS.StructuredText | null = null;
  try {
    stext = page.toStructuredText();
    const lines: { pageIndex: number; text: string; charBboxes: Bbox[] }[] = [];
    let currentText = '';
    let currentBboxes: Bbox[] = [];
    let inLine = false;
    stext.walk({
      beginLine: () => {
        currentText = '';
        currentBboxes = [];
        inLine = true;
      },
      onChar: (c, _origin, _font, _size, quad) => {
        if (!inLine) return;
        // quad: ul-x, ul-y, ur-x, ur-y, ll-x, ll-y, lr-x, lr-y
        const xs = [quad[0], quad[2], quad[4], quad[6]];
        const ys = [quad[1], quad[3], quad[5], quad[7]];
        const bbox: Bbox = [
          Math.min(...xs),
          Math.min(...ys),
          Math.max(...xs),
          Math.max(...ys),
        ];
        // c 는 한 글자(또는 surrogate pair) 문자열. 정규식은 JS string index 기반(UTF-16
        // code unit)으로 동작하므로, charBboxes 길이를 string.length 와 맞추기 위해
        // 각 code unit 마다 동일 bbox 를 push 한다.
        for (let i = 0; i < c.length; i += 1) {
          currentText += c[i];
          currentBboxes.push(bbox);
        }
      },
      endLine: () => {
        if (currentText.length > 0 && currentBboxes.length === currentText.length) {
          lines.push({
            pageIndex,
            text: currentText,
            charBboxes: currentBboxes,
          });
        }
        currentText = '';
        currentBboxes = [];
        inLine = false;
      },
    });
    return lines;
  } finally {
    stext?.destroy();
    page.destroy();
  }
}

/**
 * 라인 단위 텍스트 + 글자 bbox 추출.
 *
 * 각 `onChar` 콜백의 `quad`(8개 좌표: 4개 코너) 에서 axis-aligned bbox 를 계산해
 * `charBboxes` 에 누적한다. surrogate pair 는 JS string 으로 전달되며 `text` 길이와
 * `charBboxes` 길이를 일치시키기 위해 char 단위 push 를 그대로 사용한다.
 */
export async function extractLines(
  pageIndex: number,
): Promise<{ pageIndex: number; text: string; charBboxes: Bbox[] }[]> {
  await ensureMupdfReady();
  const doc = requireDoc();
  return extractLinesFromDoc(doc, pageIndex);
}

/**
 * 적용 단계: 박스를 Redact 어노테이션으로 변환 → applyRedactions →
 * 메타데이터 클리어 → saveToBuffer → 결과를 다시 열어 postCheck 로 누수 검증.
 */
export async function applyRedactions(
  boxes: RedactionBox[],
  maskStyle: MaskStyle,
): Promise<{ pdf: Uint8Array; report: ApplyReport }> {
  const mupdf = await ensureMupdfReady();
  const doc = requireDoc();
  const pdfDoc = doc.asPDF();
  if (!pdfDoc) {
    throw new Error('NOT_A_PDF_DOCUMENT');
  }

  const { pages: pagesAffected, counts, total } = buildRedactAnnotations(
    pdfDoc,
    boxes,
    maskStyle,
  );
  applyAllRedactions(pdfDoc, pagesAffected);
  clearMetadata(pdfDoc);

  // saveToBuffer 옵션은 string("k=v,...") 또는 record 둘 다 받는다.
  // garbage=4: 미참조 객체 정리, deflate=yes: 스트림 압축.
  const savedBuf = pdfDoc.saveToBuffer('garbage=4,compress=yes');
  let outBytes: Uint8Array;
  try {
    // asUint8Array 결과는 wasm 메모리를 참조하므로 외부에서 다시 열기 전에 복사한다.
    outBytes = new Uint8Array(savedBuf.asUint8Array());
  } finally {
    savedBuf.destroy();
  }

  // postCheck: 결과 PDF 를 임시로 다시 열어 모든 페이지 텍스트를 다시 스캔.
  let postCheckLeaks = 0;
  let verifyDoc: MupdfNS.Document | null = null;
  try {
    // openDocument 는 ArrayBuffer/Uint8Array 모두 허용.
    verifyDoc = mupdf.Document.openDocument(outBytes, 'application/pdf');
    const pageCount = verifyDoc.countPages();
    const allLines: LineForScan[] = [];
    for (let i = 0; i < pageCount; i += 1) {
      const lines = extractLinesFromDoc(verifyDoc, i);
      for (const ln of lines) allLines.push(ln);
    }
    postCheckLeaks = runDetectors(allLines).length;
  } finally {
    verifyDoc?.destroy();
  }

  return {
    pdf: outBytes,
    report: {
      totalBoxes: total,
      byCategory: counts,
      pagesAffected,
      postCheckLeaks,
    },
  };
}

/** PoC 단계에서는 미구현이지만 후속 작업용 PDFDocument 핸들 노출. */
export function getPdfDocument(): MupdfNS.PDFDocument | null {
  return currentPdf;
}
