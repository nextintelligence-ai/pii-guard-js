# PDF 익명화 도구 (pdf-anony)

한국어 PDF 안의 PII(개인정보)를 **브라우저 안에서만** 식별하고 제거하여 익명화된 PDF로 내보내는 도구입니다.

- 주민등록번호 · 전화 · 이메일 · 계좌번호 · 사업자번호 · 카드번호 6종을 정규식으로 자동 탐지
- PaddleOCR 기반 OCR 로 스캔본/이미지 기반 PDF 페이지의 텍스트 후보를 브라우저 안에서 추가 탐지
- OpenAI privacy-filter NER 모델을 사용해 사람 이름 · 주소 · URL · 날짜 · 시크릿 후보를 추가 탐지
- 자동 탐지 결과를 사용자 검수(체크 해제/수동 박스 추가)로 보강
- 홈에서 단일 PDF 처리와 여러 PDF 일괄 자동 처리 흐름을 분리
- MuPDF redaction 으로 텍스트 레이어까지 실제로 제거 후 메타데이터 정리
- 적용 결과를 한 번 더 텍스트 추출로 검증(누수 0건 확인)하여 다운로드

## 핵심 제약

- **PDF 는 외부로 나가지 않습니다.** 모든 처리는 클라이언트 사이드(브라우저) 에서 끝납니다.
- **서버 배포형 정적 사이트.** `npm run build` 는 `dist/` 아래에 HTML, JS chunks, WASM, OCR/ONNX runtime 자산을 생성합니다.
- **정적 서버는 앱과 모델 파일만 제공합니다.** PDF 원본, 렌더링 이미지, OCR 결과는 브라우저 메모리 안에서 처리됩니다.
- NER 런타임은 기본 빌드에 포함됩니다. 모델은 자동 다운로드하지 않고 사용자가 받아둔 폴더를 선택합니다.

## 기술 스택

- React 19 + Vite 5 + TypeScript
- TanStack Router (홈 / 단일 처리 / 일괄 처리 / batch 상세 route)
- [MuPDF.js 1.27](https://www.npmjs.com/package/mupdf) (WASM) — Web Worker 안에 격리, comlink RPC
- Zustand (단일 편집 스토어 + batch 큐 스토어 + undo/redo)
- @huggingface/transformers + onnxruntime-web (NER 런타임, 로컬 WASM 서빙)
- @paddleocr/paddleocr-js + onnxruntime-web (OCR 런타임과 모델 자산을 same-origin 정적 파일로 서빙)
- shadcn/ui (Radix Primitives + Tailwind) — 디자인 시스템 토큰화, 16개 ui primitive
- Sonner (토스트)
- Vite multi-asset 정적 빌드 + 자체 WASM/OCR 런타임 자산 준비 스크립트

## 빌드/실행

```bash
npm install      # 처음 한 번
npm run dev      # 개발 서버 (http://localhost:5173)
npm run build    # 서버 배포용 multi-asset dist/ 산출
npm run preview  # 빌드 결과 로컬 확인
npm test         # 단위 + 통합 테스트 (vitest)
npm run lint     # tsc -b 타입 체크
```

빌드 후엔 `postbuild` 가 자동으로 정적 산출물의 네트워크 경계를 검증합니다.

- `scripts/verify-no-external.mjs` — `dist/` 안의 HTML/JS/CSS/JSON/MJS text asset 에 외부 URL 이 0개인지 확인

빌드 산출물은 정적 서버로 서빙해야 합니다. 로컬에서 배포 결과를 확인할 때는 `npm run preview` 를 사용합니다.

## 사용 방법

1. **홈에서 작업 선택** — `/` 화면에서 `단일 PDF 처리` 또는 `여러 PDF 자동 처리` 영역에 파일을 드롭하거나 선택합니다.
2. **단일 처리** — `/single` 에서 PDF 한 개를 열고 왼쪽 패널의 카테고리(주민/전화/이메일/계좌/사업자/카드)별 후보를 검수합니다. 텍스트 레이어가 부족한 페이지는 브라우저 OCR 이 이미지 텍스트 후보를 보강합니다.
3. **누락 영역 보강** — PDF 위에서 드래그해 수동 박스를 추가합니다. 텍스트만 선택하려면 Shift 를 누른 채 드래그합니다.
4. **NER 모델 로드(선택)** — 상단 `NER 모델 로드` 버튼으로 받아둔 OpenAI privacy-filter 모델 폴더를 선택해 비정형 PII 후보를 추가할 수 있습니다. OCR 로 추출한 텍스트도 모델이 로드되어 있으면 NER 후보 생성에 사용됩니다.
5. **일괄 처리** — `/batch` 에 여러 PDF를 추가하고 `처리 시작`을 누르면 파일을 하나씩 열어 자동 탐지, 자동 적용, 적용 후 검증을 실행합니다. 성공 파일은 개별 저장하거나 `성공 파일 저장`으로 한 번에 다운로드합니다.
6. **batch 상세 검수** — 검증 경고나 실패 파일은 `/batch/$jobId` 상세 화면에서 단일 처리 편집 경험으로 보강한 뒤 다시 적용할 수 있습니다.

### Batch 자동 적용 정책

- 기본 자동 적용 대상은 정규식 후보(`auto`)와 OCR 정규식 후보(`ocr`)입니다.
- NER 후보(`ner`, `ocr-ner`)는 기본 OFF이며, `/batch` 설정의 `NER 후보도 자동 적용`을 켠 경우 threshold 이상 후보만 포함합니다.
- post-check 검증에서 누수가 남으면 성공이 아니라 `검증 경고` 상태로 남겨 상세 검수를 유도합니다.

## 프로젝트 구조

```
src/
  router.tsx               TanStack Router code-based route tree
  AppShell.tsx             공통 내비게이션, 사용법 모달, Toaster
  App.tsx                  SinglePage 호환 re-export
  components/
    batch/                 batch 드롭존, 툴바, 설정, 요약, job 테이블
    BoxOverlay.tsx         박스 그리기/선택/이동/리사이즈/Shift+텍스트선택
    CandidatePanel.tsx     카테고리 → 페이지 → 후보 Collapsible 그룹화
    PdfCanvas.tsx          MuPDF pixmap → ImageData → canvas
    OcrStatus.tsx          OCR 진행 상태 표시
    PageNavigator.tsx      페이지 이동
    DropZone.tsx           드래그 앤 드롭
    Toolbar.tsx            상단 액션 버튼 (열기/익명화/저장/도움말)
    ReportModal.tsx        적용 결과(카테고리별 카운트 + 누수 검증)
    UsageGuideModal.tsx    최초 진입 시 사용법 가이드
    ui/                    shadcn primitive 16종
  core/
    batch/                 batch 자동 적용 후보 필터와 순차 runner
    mupdfBridge.ts         MuPDF 1.27 호출 래퍼 (open/render/extract/applyRedactions)
    redactor.ts            annotation 생성, applyRedactions, clearMetadata
    detectors/             정규식 detector 6종 + runDetectors
    ocr/                   OCR 결과 정규화/좌표 변환/PII 후보 변환
  hooks/
    useApply.ts            익명화 → 검증 → 다운로드 플로우
    useAutoDetect.ts       문서 로드 시 자동 탐지 트리거
    useOcrDetect.ts        OCR 큐 실행과 후보 병합
    usePdfDocument.ts      파일 로드 + 비밀번호 프롬프트 + 큰 파일 경고
    useKeyboard.ts         단축키 (Ctrl+Z/Y, Delete 등)
    useCanvasPainter.ts    pixmap 페인팅
    useSpansForPage.ts     페이지 텍스트 span 캐시
  pages/
    HomePage.tsx           단일/일괄 작업 시작 화면
    SinglePage.tsx         기존 단일 PDF 편집 화면
    BatchPage.tsx          여러 PDF 일괄 처리 큐
    BatchJobPage.tsx       파일별 검수/재적용 상세
  state/
    store.ts               Zustand 단일 편집 스토어
    batchStore.ts          batch 큐, 상태, 결과 메타데이터
    pendingFileStore.ts    홈에서 route 화면으로 File 객체 전달
    undoStack.ts           past/future 스택
    selectors.ts           useShallow 셀렉터
  workers/
    pdf.worker.ts          comlink 노출 워커 API (init-wasm 핸드셰이크)
  wasm/
    mupdfBinary.ts         (gitignored) prebuild 가 base64 임베드
docs/
  poc-report.md            PoC 결과 + mupdf 1.27 실제 API 발견사항
  release-checklist.md     릴리스 전 검증 항목
  superpowers/specs/       설계 스펙
  superpowers/plans/       구현 계획 (M0~M7, 빌드 사이즈, shadcn)
scripts/
  embed-wasm.mjs           mupdf-wasm.wasm → src/wasm/mupdfBinary.ts (base64)
  copy-ort-assets.mjs      PaddleOCR ONNX Runtime 자산 → public/ort
  verify-no-external.mjs   postbuild — dist text asset 안에 외부 URL 0개 보장
  verify-build-size.mjs    수동 실행용 빌드 사이즈 예산 가드
  make-test-fixture.mjs    pdf-lib 로 PII 더미 PDF 생성
tests/
  unit/                    detector / store / undo / redactor 단위
  integration/             redact 전체 플로우 (postCheckLeaks === 0)
```

## 아키텍처 메모

- **MuPDF 는 워커에 격리.** 메인 스레드가 WASM 바이너리를 한 번 디코드해 transferable `ArrayBuffer` 로 워커에 zero-copy 이관(`init-wasm` 핸드셰이크), 워커가 핸드셰이크 후에만 comlink 를 expose 합니다.
- **OCR 은 same-origin 정적 자산만 사용.** PaddleOCR 모델(`public/models/paddleocr`) 과 ONNX Runtime 파일(`public/ort`) 은 `dist/` 로 복사되어 앱과 같은 origin 에서 fetch 됩니다.
- **Batch 는 순차 처리.** 여러 PDF를 동시에 MuPDF worker에 열지 않고 queued job을 하나씩 처리해 메모리 사용량을 제한합니다.
- **모든 박스는 PDF point 좌표로 저장.** 화면 표시 시점에만 viewport scale 을 곱해서 rotation 0/90/180/270 을 일관되게 처리합니다.
- **드래그 중에는 로컬 state 로 pending bbox 유지.** drag 한 번 = undo 한 번이 되도록 commit 시점에만 store 업데이트합니다.
- **Zustand + useShallow.** 박스가 늘어나도 referential equality 유지로 리렌더 폭주를 막습니다.
- **서버 정적 multi-asset 산출.** Vite 가 `index.html`, hashed JS/CSS chunks, worker/WASM/runtime/model assets 를 `dist/` 로 emit 하고, 배포 단계가 `index.html` 은 짧게 캐시하고 나머지 asset 은 immutable 로 캐시합니다.

## 라이선스 / 비범위

MVP 범위 외(설계상 제외):

- PWA / Service Worker
- 데스크톱 패키징(.exe 등)

자세한 작업 이력과 후속 과제는 [HANDOFF.md](./HANDOFF.md) 를 참고하세요.
    useBatchRunner.ts      batch job 순차 처리
