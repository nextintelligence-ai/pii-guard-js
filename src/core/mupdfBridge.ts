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
import { MUPDF_WASM_BASE64, MUPDF_WASM_BYTE_LENGTH } from '@/wasm/mupdfBinary';
import type { PageMeta, TextSpan, Bbox } from '@/types/domain';

type MupdfModule = typeof MupdfNS;

let mupdfModulePromise: Promise<MupdfModule> | null = null;

/** Base64 → Uint8Array 디코더 (브라우저/워커 환경 동작). */
function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

/**
 * mupdf 를 base64 WASM 으로 1회 초기화하고 모듈 네임스페이스를 반환한다.
 * 동시 호출되어도 단일 Promise 를 공유한다.
 */
export function ensureMupdfReady(): Promise<MupdfModule> {
  if (!mupdfModulePromise) {
    mupdfModulePromise = (async () => {
      const wasmBinary = decodeBase64(MUPDF_WASM_BASE64);
      if (wasmBinary.byteLength !== MUPDF_WASM_BYTE_LENGTH) {
        throw new Error(
          `mupdf WASM byteLength 불일치: 기대 ${MUPDF_WASM_BYTE_LENGTH}, 실제 ${wasmBinary.byteLength}`,
        );
      }
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
      // 동적 import 로 평가 시점을 보장.
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
      throw new Error('PDF_PASSWORD_REQUIRED');
    }
    const ok = doc.authenticatePassword(password);
    // mupdf 의 authenticatePassword 는 0 이면 실패, 그 외는 권한 비트.
    if (!ok) {
      doc.destroy();
      throw new Error('PDF_PASSWORD_INVALID');
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

/** PoC 단계에서는 미구현이지만 후속 작업용 PDFDocument 핸들 노출. */
export function getPdfDocument(): MupdfNS.PDFDocument | null {
  return currentPdf;
}
