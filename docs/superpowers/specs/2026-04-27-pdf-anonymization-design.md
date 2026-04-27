# PDF 익명화 도구 설계 문서

- **작성일**: 2026-04-27
- **상태**: Draft (사용자 검토 대기)
- **타깃 사용자**: LOFA(손해사정 보고서) 시나리오의 사내 사용자 (윈도우 환경 우선)

---

## 1. 목적과 범위

LOFA에서 다운로드한 PDF(예: 손해사정 보고서) 안의 개인정보(PII)를
**브라우저에서만(서버로 업로드하지 않고)** 자동/수동으로 식별하고 제거(redaction)하여,
익명화된 PDF를 다시 내려받게 하는 도구를 만든다.

### 1.1 핵심 요구사항
1. PDF 바이너리는 절대 외부 네트워크로 나가지 않는다.
2. 사용자에게 **별도 설치(.exe 등)가 필요하지 않다.**
3. 빌드 결과물은 **단일 HTML 파일**이며 윈도우에서 더블클릭(`file://`)으로 열어 동작한다.
4. 자동 탐지 결과를 사용자가 검수(추가/삭제/확정)할 수 있다.
5. Redaction은 검은 박스 덮개가 아닌 **MuPDF의 `applyRedactions()` 로 실제 콘텐츠 제거**여야 한다.

### 1.2 비범위 (MVP에 포함하지 않음)
- OCR (스캔본 자동 텍스트화) — 추후 모듈로 추가 가능한 인터페이스만 마련
- NER (이름/주소/기관명 자동 식별)
- PWA / Service Worker
- 다국어 UI (한국어 단일)
- 데스크톱 패키징(Tauri/Electron)
- .exe 형태의 단일 실행 파일

---

## 2. 확정된 결정 (Decisions Log)

| # | 결정 | 비고 |
| - | --- | --- |
| D1 | 배포 형태 = **정적 사이트 (서버 로직 없음)** | LOFA 시나리오, 로컬 처리 |
| D2 | 1차 배포 채널 = **단일 HTML 파일** (`file://` 동작) | .exe 금지 제약 |
| D3 | 프론트엔드 스택 = **React 19 + Vite + TypeScript** | 컴포넌트 분리 용이, 레퍼런스 풍부 |
| D4 | PDF 엔진 = **MuPDF.js (WASM)** | redaction 적용까지 일관 처리 |
| D5 | PII 탐지 = **정규식만 (MVP)** + 수동 보강 | NER/OCR은 후속 |
| D6 | 수동 검수 = **자동 후보 토글 + 텍스트 드래그 + 사각형 박스** 모두 지원 | |
| D7 | 실행 모델 = **Web Worker 오프로드 + Zustand 상태** | UI 끊김 방지, OCR 확장 친화 |
| D8 | OCR = **MVP 제외, 후속 모듈로 확장 가능한 인터페이스 유지** | `TextExtractor` 추상화 |
| D9 | PWA = **불채택** | 사용자 결정 |

---

## 3. 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│ Browser                                                     │
│                                                             │
│  ┌─────────────────────────┐     ┌──────────────────────┐  │
│  │ Main Thread (UI)        │     │ Web Worker           │  │
│  │ ─────────────────────── │     │ ─────────────────── │  │
│  │ React 19 + TS           │◄───►│ MuPDF.js (WASM)      │  │
│  │ Zustand (state)         │ RPC │  - openDocument      │  │
│  │ Tailwind (styling)      │     │  - getStructuredText │  │
│  │                         │     │  - renderPage        │  │
│  │ Canvas (페이지 표시)     │     │  - applyRedactions   │  │
│  │ Box Overlay (그리기)     │     │  - saveDocument      │  │
│  │ ImageBitmap 페인트       │     │ Detector             │  │
│  │                         │     │  - regex 룰셋         │  │
│  └─────────────────────────┘     │  - TextSpan→Candidate│  │
│                                   └──────────────────────┘  │
│                                                             │
│  PDF 바이너리는 워커 안에만 존재. 외부 네트워크 호출 없음.    │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 핵심 원칙
- PDF 바이너리는 워커 메모리에만 보유. 메인은 ImageBitmap과 메타데이터만 받는다.
- 메인↔워커 통신은 `comlink`로 추상화 → 일반 비동기 함수 호출처럼 사용.
- 모든 좌표는 **PDF 페이지 좌표계(points)** 로 통일. 화면 표시 시점에만 viewport scale 적용.
- 외부 네트워크 호출이 코드에 0개여야 한다(빌드 직전 grep으로 검증).

### 3.2 데이터 흐름

```
[유저] PDF 드롭
   ↓
[Main]  File → ArrayBuffer → worker.open(buffer) (transfer)
   ↓
[Worker] mupdf.Document.openDocument → PageMeta[]
   ↓
[Main]  store.doc 갱신, 첫 페이지 요청
   ↓
[Worker] page.toStructuredText() → TextSpan[]
        page.toPixmap() → ImageBitmap
   ↓
[Main]  Canvas 페인트 + 자동 탐지 트리거
   ↓
[Worker] Detector.run(textSpans) → Candidate[]
   ↓
[Main]  좌측 패널: 후보 / 우측 캔버스: 하이라이트
   ↓
[유저] 토글 / 텍스트 드래그 / 사각형 그리기
   ↓
[유저] "익명화 적용"
   ↓
[Worker] redaction annotation 생성 → applyRedactions()
        → 메타데이터 정리 → saveDocument() → Uint8Array
   ↓
[Main]  Blob → 다운로드 + 검증 리포트
```

### 3.3 좌표계 처리
- **PDF 좌표**: points (1pt = 1/72 inch). 페이지 회전(rotation) 0/90/180/270 가능.
- **Canvas 좌표**: 픽셀, 좌상단 원점.
- 워커가 페이지 렌더 시 사용한 `scale`과 `width/heightPx`를 함께 반환 → 메인의 `pdfPointToCanvasPx(rect, scale, pageHeightPt, rotation)` 유틸로 변환.
- 박스는 **항상 PDF points 기준으로 저장**, 화면 표시는 viewport scale로 변환만.

---

## 4. 컴포넌트 구조

### 4.1 디렉토리 레이아웃

```
pdf-anony/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── docs/
│   └── superpowers/specs/2026-04-27-pdf-anonymization-design.md
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   │
│   ├── workers/
│   │   ├── pdf.worker.ts          # MuPDF + Detector 호스트
│   │   ├── pdfWorkerClient.ts     # comlink wrapper
│   │   └── pdf.worker.types.ts    # RPC 인터페이스
│   │
│   ├── core/
│   │   ├── mupdfBridge.ts
│   │   ├── textExtractor.ts       # TextExtractor 인터페이스 + Mupdf 구현
│   │   ├── detectors/
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── rrn.ts             # 주민등록번호 (체크섬)
│   │   │   ├── phone.ts
│   │   │   ├── email.ts
│   │   │   ├── account.ts
│   │   │   ├── businessNo.ts      # 사업자번호 (체크섬)
│   │   │   └── card.ts            # 카드 (Luhn)
│   │   └── redactor.ts
│   │
│   ├── state/
│   │   ├── store.ts               # Zustand
│   │   ├── selectors.ts
│   │   └── undoStack.ts
│   │
│   ├── components/
│   │   ├── DropZone.tsx
│   │   ├── Toolbar.tsx
│   │   ├── PageNavigator.tsx
│   │   ├── PdfCanvas.tsx
│   │   ├── BoxOverlay.tsx
│   │   ├── CandidatePanel.tsx
│   │   ├── MaskStylePicker.tsx
│   │   └── DownloadButton.tsx
│   │
│   ├── hooks/
│   │   ├── usePdfDocument.ts
│   │   ├── useCanvasPainter.ts
│   │   └── useKeyboard.ts
│   │
│   ├── utils/
│   │   ├── coords.ts
│   │   ├── fileIO.ts
│   │   └── id.ts
│   │
│   ├── styles/index.css
│   └── types/domain.ts
│
└── tests/
    ├── unit/
    └── fixtures/
```

### 4.2 화면 레이아웃

```
┌─────────────────────────────────────────────────────────┐
│ Toolbar  [업로드][Undo][Redo][마스킹스타일▼][적용][다운로드] │
├──────────────┬──────────────────────────────────────────┤
│ Candidate    │                                          │
│ Panel        │            PDF Canvas + Overlay          │
│              │                                          │
│ ☑ 010-...    │                                          │
│ ☑ hong@...   │                                          │
│ ☐ 12345      │                                          │
│              │                                          │
│ [전화 모두]   │   < 1 / 27 > 페이지 네비게이터            │
│ [이메일 모두] │                                          │
└──────────────┴──────────────────────────────────────────┘
```

### 4.3 도메인 타입 (`src/types/domain.ts`)

```ts
export type Bbox = readonly [x0: number, y0: number, x1: number, y1: number]; // PDF points

export type TextSpan = {
  text: string;
  bbox: Bbox;
  pageIndex: number;
};

export type DetectionCategory = 'rrn' | 'phone' | 'email' | 'account' | 'businessNo' | 'card';

export type Candidate = {
  id: string;
  pageIndex: number;
  bbox: Bbox;
  text: string;
  category: DetectionCategory;
  confidence: number;            // 0..1, 체크섬 통과 시 1.0
  source: 'auto';
};

export type RedactionBox = {
  id: string;
  pageIndex: number;
  bbox: Bbox;
  source: 'auto' | 'text-select' | 'manual-rect';
  category?: DetectionCategory;
  label?: string;                // 대체 텍스트(선택)
  enabled: boolean;
};

export type MaskStyle =
  | { kind: 'blackout' }
  | { kind: 'label'; label: string }
  | { kind: 'pattern'; pattern: string };

export type PageMeta = {
  index: number;
  widthPt: number;
  heightPt: number;
  rotation: 0 | 90 | 180 | 270;
};
```

### 4.4 Zustand Store 개요

```ts
type DocState =
  | { kind: 'empty' }
  | { kind: 'loading' }
  | { kind: 'ready'; pages: PageMeta[]; fileName: string }
  | { kind: 'applying' }
  | { kind: 'done'; outputBlob: Blob; report: ApplyReport }
  | { kind: 'error'; message: string };

type AppState = {
  doc: DocState;
  currentPage: number;
  candidates: Candidate[];
  boxes: Record<string, RedactionBox>;
  selectedBoxId: string | null;
  maskStyle: MaskStyle;
  categoryEnabled: Record<DetectionCategory, boolean>;
};
```

`boxes` 변경은 undo 스택(최대 100단계)에 스냅샷을 push. `doc`/`candidates`는 비추적.

### 4.5 워커 RPC 인터페이스

```ts
export interface PdfWorkerApi {
  open(buf: ArrayBuffer, opts?: { password?: string }): Promise<{ pages: PageMeta[] }>;
  renderPage(pageIndex: number, scale: number)
    : Promise<{ bitmap: ImageBitmap; widthPx: number; heightPx: number; scale: number }>;
  extractSpans(pageIndex: number): Promise<TextSpan[]>;
  detectAll(pageIndex: number): Promise<Candidate[]>;
  apply(boxes: RedactionBox[], maskStyle: MaskStyle)
    : Promise<{ pdf: Uint8Array; report: ApplyReport }>;
  close(): Promise<void>;
}

export type ApplyReport = {
  totalBoxes: number;
  byCategory: Record<DetectionCategory | 'manual', number>;
  pagesAffected: number[];
  postCheckLeaks: number;          // 결과 PDF에서 같은 정규식이 다시 잡힌 개수
};
```

---

## 5. 워크플로우 상세

### 5.1 파일 로드
1. DropZone에 파일 드롭 또는 선택.
2. `File.arrayBuffer()` → ArrayBuffer.
3. `workerApi.open(buffer)` (transfer로 zero-copy).
4. 암호화 PDF면 `password` 입력 모달 → 재시도 (최대 3회).
5. 성공 시 `store.doc = { kind: 'ready', pages, fileName }`.

### 5.2 페이지 렌더 + 탐지 (현재 페이지 + ±2 prefetch)
- `currentPage` 변경 시 `renderPage` + `extractSpans` 동시 호출.
- spans 도착 즉시 `detectAll` 트리거 → Candidate를 RedactionBox(`source='auto', enabled=true`)로 등록.
- 다단/표/회전 텍스트 대응: 같은 line spans를 합본해 정규식 매칭, 결과를 다시 원본 span 좌표로 분할.

### 5.3 사용자 검수
- **자동 후보 토글**: 체크박스 / 카테고리별 일괄 / "전체 선택/해제".
- **텍스트 드래그**: Canvas hit-test로 현재 페이지 spans 골라 RedactionBox 생성 (`source='text-select'`).
- **사각형 드래그**: Pointer 이벤트 기반 (`source='manual-rect'`). 빈 영역도 가능.
- **박스 편집**: 클릭→선택, drag→이동, 모서리→리사이즈, Delete→삭제.
- **Undo/Redo**: `Ctrl+Z` / `Ctrl+Shift+Z`. 스택 길이 100.

### 5.4 적용 + 다운로드
1. `store.doc = 'applying'`.
2. enabled=true 박스를 워커로 일괄 전송.
3. 워커:
   - 페이지별 redaction annotation 생성 (`annot.setRect`, fill/label).
   - `page.applyRedactions()`.
   - 메타데이터 정리: PDF Info(Author/Creator/Producer/Title/Keywords) 클리어, XMP 메타데이터 제거, JavaScript actions 제거, Embedded files 제거.
   - `saveDocument({ garbage: 4, deflate: true })` → Uint8Array.
   - **postCheck**: 결과 PDF를 다시 열어 spans 추출 후 적용 카테고리의 정규식이 매칭되면 `leaks++`.
4. Blob → `URL.createObjectURL` → 다운로드 트리거.
5. 검증 리포트 모달: 총 적용 N건, 카테고리별 분포, 누수 0건 여부.

---

## 6. 에러 처리 / 엣지 케이스

| 상황 | 동작 |
| --- | --- |
| 암호화 PDF | 비밀번호 모달, 3회 실패 시 안내 |
| 권한 제한 PDF (수정 금지 플래그) | 경고 후 best-effort. 실패 시 명확한 안내 |
| 텍스트 레이어 없음 (스캔본) | "자동 탐지 0건" 안내, 사각형 박스로 진행 가능 |
| 매우 큰 파일 (>200MB) | 사전 경고 모달 |
| 워커 메모리 OOM | try/catch로 친화적 메시지 + 워커 재기동 옵션 |
| WASM 초기화 실패 | 지원 브라우저 안내 (`file://` 제약 가능성 명시) |
| postCheck 누수 발견 | 누수 항목 표시 + 재적용/수동 보강 유도 |
| 회전 페이지 | bbox 변환에 rotation 반영 |
| 다단/표/회전 텍스트 | line span 합본 매칭 후 좌표 재분할 |
| Undo 후 적용 | 현재 store 스냅샷 기준으로 적용 |

---

## 7. 테스트 전략

### 7.1 단위 테스트 (Vitest)
- `core/detectors/*` — 양/음성 케이스, 한국 RRN/사업자번호 체크섬, 카드 Luhn.
- `utils/coords.ts` — PDF↔Canvas 왕복 정확도, rotation 0/90/180/270.
- `state/store.ts` — toggleBox, addManualBox, undo/redo 시나리오.
- `core/redactor.ts` — RedactionBox → annotation params 변환.

### 7.2 통합 테스트 (Vitest + 샘플 PDF)
- `tests/fixtures/`: 가상 PII 더미 PDF 3~5개 (디지털, 회전, 스캔본 포함).
- 시나리오:
  1. 디지털 PDF → 자동 탐지 → 적용 → 결과 PDF에서 원본 PII 부재 확인.
  2. 스캔본 → 자동 탐지 0건 → 수동 박스 → 적용 → 영역 변형 확인.
  3. 회전 페이지 → 좌표 변환 정상.
  4. 메타데이터(Author 등) 클리어 검증.

### 7.3 E2E (Playwright, 옵션)
- 정적 빌드를 로컬 http로 띄우고 드롭→적용→다운로드 검증.
- Chromium / Firefox / WebKit 매트릭스.

### 7.4 `file://` 모드 검증 (수동)
- `dist/index.html` 더블클릭 → Chrome / Edge / Firefox에서 동작 확인.
- 릴리스 체크리스트 항목으로 명시.

### 7.5 한글 작성 규칙
- 테스트 케이스 이름은 한글로 작성.
- 예: `it('주민등록번호 정규식이 잘못된 체크섬을 거부한다', ...)`.

---

## 8. 빌드 / 배포

### 8.1 Vite 설정 핵심

```ts
// vite.config.ts (요지)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  worker: { format: 'iife' },           // 워커도 인라인 가능한 IIFE
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,     // 모든 자산 인라인
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
```

추가 처리:
- MuPDF WASM은 빌드 단계에서 base64로 인코딩하여 JS 모듈에 임베드.
- 런타임에서 `mupdf.initWithBinary(Uint8Array.from(atob(WASM_B64), c => c.charCodeAt(0)))` 형태로 초기화.

### 8.2 빌드 산출물
- 1차 채널: `dist/index.html` (단일 파일, 약 15~25MB).
- 보조 채널(옵션): `dist-multi/`(분할 자산) — 사내 인트라넷 호스팅 시 사용.
- 외부 통신 없음 — 빌드 직전 `grep` 검증.

### 8.3 배포 채널
1. **단일 HTML** — 사내 메일/공유 폴더로 `pdf-anony-vX.Y.Z.html` 배포. 사용자는 다운로드 → 더블클릭.
2. **사내 인트라넷** (옵션) — 분할 빌드를 nginx/IIS에 정적 호스팅.
3. **GitHub 릴리스** (개발팀 내부) — 태그에 `pdf-anony-vX.Y.Z.html` + SHA-256 첨부.

### 8.4 보안 검증 체크리스트 (릴리스 전 수동)
- [ ] `dist/index.html` 안에 외부 URL 0개 (`grep -E 'https?://' dist/index.html` 결과 검토).
- [ ] CSP 메타: `default-src 'self' 'unsafe-inline' data: blob:` (인라인 자산 동작 + 외부 차단).
- [ ] PDF 처리 코드에 fetch/WebSocket 호출 0.
- [ ] 결과 PDF에서 원본 PII 문자열 0건 (자동 postCheck + 수동 샘플).

### 8.5 브라우저 호환성
- **공식 지원**: Chrome 120+, Edge 120+, Firefox 115+ (윈도우 기준).
- **베스트 에포트**: Safari (`file://` 제약 큼 — 사내 인트라넷 권장).

---

## 9. PoC (Day 0 — 본 구현 전 필수)

본 구현 시작 전 단일 PoC로 다음을 검증한다.

1. Vite + React + TS + `vite-plugin-singlefile` 빈 앱 빌드 → 단일 HTML 생성 확인.
2. 단일 HTML에서 Blob URL Worker 동작 확인 (Chrome / Edge / Firefox, `file://`).
3. 워커 안에서 base64 WASM 주입으로 MuPDF.js 초기화 성공.
4. 샘플 PDF 1개 → 페이지 수, 첫 페이지 spans, 첫 페이지 ImageBitmap 메인 전송 → 캔버스 렌더 확인.
5. 결과를 `docs/poc-report.md` 에 정리.

### 9.1 PoC 실패 시 대응
- 워커 인라인이 막힘 → 메인 스레드 폴백 (성능 저하 경고).
- WASM 인라인이 막힘 → 분할 빌드(`dist-multi/`) + 사내 인트라넷 호스팅(A안)으로 회귀.
- 의사결정 시점은 PoC 종료 직후로 명시한다.

---

## 10. 마일스톤 개요

```
M0  PoC: 단일 HTML + Worker + WASM 동작
M1  도메인/탐지 코어: TextSpan, Detector(정규식 4~6종), 단위 테스트
M2  워커 RPC + PDF 로드 + 페이지 렌더: 첫 페이지 표시
M3  자동 탐지 → 후보 패널 + 캔버스 하이라이트 + 토글
M4  수동 도구: 텍스트 드래그 선택, 사각형 박스, undo/redo
M5  적용 + 메타데이터 정리 + 다운로드 + postCheck
M6  마스킹 스타일, 카테고리 일괄, 키보드 핫키
M7  엣지: 암호화 PDF, 회전 페이지, 큰 파일 경고
M8  단일 HTML 빌드 + 보안 체크리스트 + 릴리스
```

세부 작업 분해는 다음 단계(writing-plans)에서 진행한다.

---

## 11. 향후 확장 (참고)

- **OCR 추가**: `TextExtractor` 인터페이스에 `TesseractTextExtractor` 구현 추가. dynamic import로 메인 번들 영향 최소화.
- **NER 추가**: 한글 NER ONNX 모델을 워커에서 추론. 모델 로딩은 사용자 동의 후 별도 채널.
- **다중 파일 일괄 처리**: 동일한 redaction 룰을 여러 PDF에 적용.
- **사내 인트라넷 PWA화**: 사내 호스팅이 확정되면 Service Worker로 오프라인 지원.
