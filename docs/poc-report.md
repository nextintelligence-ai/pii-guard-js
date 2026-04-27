# PoC 결과 (2026-04-27)

## 환경

- mupdf: 1.27.0
- Vite: 5.4.21
- comlink: 4.4.1
- 빌드 결과: `dist/index.html` 단일 파일 약 **34 MB** (gzip 약 14.8 MB)
  - 예상치(15-25 MB) 보다 큼. 원인: `?worker&inline` 가 워커 번들을 base64
    Data URL 로 인라인하면서 mupdf-wasm 바이트가 사실상 워커 안에 한 번 더
    들어가는 형태가 되어 단일 HTML 안에 base64 표현이 두 번 포함된다.
    M7 단계에서 `loadWasmFromBundleUrl` 등으로 단일 임베드로 줄이는 최적화 여지가 있음.

## 검증 결과 (자동)

- [x] 워커 + mupdf base64 wasm 초기화 → ping 응답 (`npm run dev` 부팅 성공, 포트 5173)
- [x] 단일 HTML 빌드 산출 (`npm run build` 성공, `dist/index.html` 생성)
- [x] `npm run lint` (tsc -b) 통과
- [x] `npm test` (vitest, 5 테스트) 통과
- [ ] 캔버스 렌더 + spans 추출 — dev 에서 사용자가 PDF 업로드해 확인 필요 (브라우저 GUI)

## 검증 결과 (사용자 수동 — file:// 더블클릭)

자동화 환경에서 GUI 브라우저 검증을 수행하지 않았다. 다음 항목을 사용자가 직접 확인해야 한다.

- [ ] Chrome 에서 `dist/index.html` 더블클릭 → "워커 ping" 클릭 → "응답: pong" 표시
- [ ] Edge 에서 동일 확인
- [ ] Firefox 에서 동일 확인
- [ ] 브라우저에서 작은 PDF 업로드 → 페이지 0 캔버스 렌더 + spans 카운트 표시
- [ ] DevTools 콘솔에 에러가 없는지 확인 (특히 CSP, WASM, Worker 관련)

## 주요 발견 (mupdf 1.27 실제 API)

### 초기화

- `import mupdf from "mupdf"` 는 **top-level await** 으로 즉시 wasm 을 인스턴스화한다:
  `const libmupdf = await libmupdf_wasm(globalThis["$libmupdf_wasm_Module"]);`
- 외부에서 wasm 바이너리를 주입하려면 **mupdf 모듈을 import 하기 전에**
  `globalThis["$libmupdf_wasm_Module"] = { wasmBinary: <Uint8Array> }` 를 설정해야 한다.
  이 PoC 는 `await import('mupdf')` 동적 import 로 평가 시점을 보장한다 (`src/core/mupdfBridge.ts`).
- mupdf-wasm.js Emscripten 모듈은 표준 옵션 `wasmBinary` 와 `instantiateWasm` 모두 지원하므로
  base64 → Uint8Array 디코드 후 `wasmBinary` 로 넘기면 fetch 없이 동작한다.

### Document / Page

- `mupdf.Document.openDocument(buf, magic)` — `Buffer | ArrayBuffer | Uint8Array | Stream | string` 입력.
  ArrayBuffer 입력 시 magic 인자에 `"application/pdf"` 명시.
- `doc.needsPassword()` / `doc.authenticatePassword(pwd)` — 후자는 0 이면 실패, 그 외엔 권한 비트.
- `doc.countPages()`, `doc.loadPage(i)` 사용. 반환 타입은 `PDFPage | Page`.
- 페이지 회전: 별도 `getRotation()` 메서드는 **노출되지 않음**. `PDFPage.getObject()` 로
  PDF 객체를 얻고 `getInheritable("Rotate")` 로 읽어야 한다 (PoC 에서 `readPageRotation` 으로 처리).
- `page.getBounds()` 는 `[x0, y0, x1, y1]` 형태의 회전 후 좌표. 단위는 PDF point.

### 렌더

- `page.toPixmap(matrix, colorspace, alpha?, showExtras?, ...)` — `Matrix.scale(s, s)` 와
  `ColorSpace.DeviceRGB` 사용. alpha=false 면 **3채널 RGB packed**.
- `Pixmap.getPixels()` 는 `Uint8ClampedArray`. `getStride()` 가 한 줄 바이트 수, `getNumberOfComponents()` 로 RGB(3)/RGBA(4) 구분.
- 따라서 `ImageData(rgba, w, h)` 로 변환하려면 RGB→RGBA 패킹이 필요하다 (`pixmapToRgba` 헬퍼).

### 텍스트 추출

- `page.toStructuredText()` → `StructuredText`. `walk(walker)` 콜백으로 처리.
- 콜백 시그니처: `beginLine(bbox, wmode, direction)`, `onChar(c, origin, font, size, quad, color)`, `endLine()`, `beginTextBlock(bbox)` 등.
  PoC 에서는 `beginLine`/`onChar`/`endLine` 만 사용해 라인 단위 `TextSpan` 을 생성.
- `StructuredText.asJSON(scale?)` 도 사용 가능 (M1 단계 선택지).

### 적용 (Redaction) — 후속 작업 메모

- 직접 `Page.createAnnotation` 은 base `Page` 에서 노출되지 않음. **`PDFPage.createAnnotation("Redact")`** 사용.
- `PDFPage.applyRedactions(black_boxes?, image_method?, line_art_method?, text_method?)` 로 일괄 적용.
- 저장: `doc.asPDF()?.saveToBuffer(options)` → `Buffer.asUint8Array()` 로 Uint8Array 획득.

## 빌드 설정 발견 (중요)

- `worker.format = 'iife'` 는 **mupdf 의 top-level await 와 호환되지 않는다** (Vite/Rollup 에러:
  *"Module format \"iife\" does not support top-level await"*).
- 또한 `new Worker(new URL(...), { type: 'module' })` 패턴은 `worker.format='iife'` 와 코드 스플리팅
  불일치로 빌드 실패한다 (*"UMD and IIFE output formats are not supported for code-splitting builds"*).
- 해결: `vite.config.ts` 에서 `worker.format = 'es'` 로 변경하고, 워커 import 는 `?worker&inline`
  형태로 사용한다. 워커 번들에도 `output.inlineDynamicImports = true` 를 적용해 mupdf 의 내부
  dynamic import 가 모두 단일 청크로 인라인되도록 한다.
- 결과: 단일 HTML 산출이 정상 생성되며, 모듈 워커는 inline data URL 형태로 포함된다.

## 폴백 결정

- **PoC 자동 검증은 모두 OK** → 본 구현 진행.
- 사용자 수동 GUI 검증에서 `file://` 환경 이슈가 발견되면, M7 단계에서 다음을 검토:
  1. CSP `worker-src 'self' blob:` 외에 `data:` 추가 필요할 수 있음 (현재 `index.html` 의 CSP 는 `worker-src 'self' blob:`).
  2. `?worker&inline` 이 `Blob` 기반 URL 을 사용하는지 `data:` 인지 확인 후 CSP 보강.
  3. 그래도 깨지면 `dist-multi` 멀티파일 모드 (`npm run build:multi`) 사용 검토.
- 빌드 산출 크기(34 MB) 가 사용자 요구치 대비 과하면 M7 에서 워커 번들이 wasm 을 따로 다시 인라인하지 않도록
  공유 import 구조 또는 `instantiateWasm` 콜백을 통한 wasm 모듈 공유 검토.
