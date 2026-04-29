# PDF 익명화 도구 (pdf-anony)

한국어 PDF 안의 PII(개인정보)를 **브라우저 안에서만** 식별하고 제거하여 익명화된 PDF로 내보내는 도구입니다.

- 주민등록번호 · 전화 · 이메일 · 계좌번호 · 사업자번호 · 카드번호 6종을 정규식으로 자동 탐지
- 자동 탐지 결과를 사용자 검수(체크 해제/수동 박스 추가)로 보강
- MuPDF redaction 으로 텍스트 레이어까지 실제로 제거 후 메타데이터 정리
- 적용 결과를 한 번 더 텍스트 추출로 검증(누수 0건 확인)하여 다운로드

## 핵심 제약

- **PDF 는 외부로 나가지 않습니다.** 모든 처리는 클라이언트 사이드(브라우저) 에서 끝납니다.
- **단일 HTML 파일 배포.** `dist/index.html` 을 더블클릭(`file://`)해서 실행합니다. 설치/`.exe` 없습니다.
- OCR/NER 은 후속 마일스톤. 현재는 **정규식 + 수동 검수** 가 MVP 입니다. 스캔본 PDF 처럼 텍스트 레이어가 없으면 자동 탐지 결과는 비고 수동 박스로 처리해야 합니다.

## 기술 스택

- React 19 + Vite 5 + TypeScript
- [MuPDF.js 1.27](https://www.npmjs.com/package/mupdf) (WASM) — Web Worker 안에 격리, comlink RPC
- Zustand (단일 스토어 + undo/redo)
- shadcn/ui (Radix Primitives + Tailwind) — 디자인 시스템 토큰화, 16개 ui primitive
- Sonner (토스트)
- vite-plugin-singlefile + 자체 WASM 임베드 스크립트 (단일 HTML 산출)

## 빌드/실행

```bash
npm install        # 처음 한 번
npm run dev        # 개발 서버 (http://localhost:5173)
npm run build      # 단일 HTML 산출 → dist/index.html (~13.25 MB)
npm test           # 단위 + 통합 테스트 (vitest)
npm run lint       # tsc -b 타입 체크
```

빌드 후엔 `postbuild` 가 자동으로 두 가지를 검증합니다.

- `scripts/verify-no-external.mjs` — 산출 HTML 안에 외부 URL 이 0개인지 확인 (오프라인/`file://` 보장)
- `scripts/verify-build-size.mjs` — 18MB 사이즈 예산 가드

## 사용 방법

1. **PDF 열기** — 화면에 파일을 드롭하거나 상단 `PDF 열기` 버튼으로 선택합니다.
2. **자동 탐지 검수** — 왼쪽 패널의 카테고리(주민/전화/이메일/계좌/사업자/카드)에서 페이지별 후보를 확인하고 제외할 항목은 체크 해제합니다.
3. **누락 영역 보강** — PDF 위에서 드래그해 수동 박스를 추가합니다. 텍스트만 선택하려면 Shift 를 누른 채 드래그합니다.
4. **익명화 적용 → 저장** — 상단의 익명화 버튼으로 redaction 을 수행하면 검증 리포트가 표시되고, `PDF 저장` 으로 내 PC 에 저장합니다.

빌드 산출물(`dist/index.html`)을 더블클릭하면 동일하게 동작합니다 — 설치/네트워크 불필요.

## 프로젝트 구조

```
src/
  App.tsx                  사이드바(검수) + 캔버스 2-column 레이아웃
  components/
    BoxOverlay.tsx         박스 그리기/선택/이동/리사이즈/Shift+텍스트선택
    CandidatePanel.tsx     카테고리 → 페이지 → 후보 Collapsible 그룹화
    PdfCanvas.tsx          MuPDF pixmap → ImageData → canvas
    PageNavigator.tsx      페이지 이동
    DropZone.tsx           드래그 앤 드롭
    Toolbar.tsx            상단 액션 버튼 (열기/익명화/저장/도움말)
    ReportModal.tsx        적용 결과(카테고리별 카운트 + 누수 검증)
    UsageGuideModal.tsx    최초 진입 시 사용법 가이드
    ui/                    shadcn primitive 16종
  core/
    mupdfBridge.ts         MuPDF 1.27 호출 래퍼 (open/render/extract/applyRedactions)
    redactor.ts            annotation 생성, applyRedactions, clearMetadata
    detectors/             정규식 detector 6종 + runDetectors
  hooks/
    useApply.ts            익명화 → 검증 → 다운로드 플로우
    useAutoDetect.ts       문서 로드 시 자동 탐지 트리거
    usePdfDocument.ts      파일 로드 + 비밀번호 프롬프트 + 큰 파일 경고
    useKeyboard.ts         단축키 (Ctrl+Z/Y, Delete 등)
    useCanvasPainter.ts    pixmap 페인팅
    useSpansForPage.ts     페이지 텍스트 span 캐시
  state/
    store.ts               Zustand 단일 스토어
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
  verify-no-external.mjs   postbuild — HTML 안에 외부 URL 0개 보장
  verify-build-size.mjs    postbuild — 18MB 예산 가드
  make-test-fixture.mjs    pdf-lib 로 PII 더미 PDF 생성
tests/
  unit/                    detector / store / undo / redactor 단위
  integration/             redact 전체 플로우 (postCheckLeaks === 0)
```

## 아키텍처 메모

- **MuPDF 는 워커에 격리.** 메인 스레드가 WASM 바이너리를 한 번 디코드해 transferable `ArrayBuffer` 로 워커에 zero-copy 이관(`init-wasm` 핸드셰이크), 워커가 핸드셰이크 후에만 comlink 를 expose 합니다.
- **모든 박스는 PDF point 좌표로 저장.** 화면 표시 시점에만 viewport scale 을 곱해서 rotation 0/90/180/270 을 일관되게 처리합니다.
- **드래그 중에는 로컬 state 로 pending bbox 유지.** drag 한 번 = undo 한 번이 되도록 commit 시점에만 store 업데이트합니다.
- **Zustand + useShallow.** 박스가 늘어나도 referential equality 유지로 리렌더 폭주를 막습니다.
- **단일 HTML 산출.** `vite-plugin-singlefile` + `assetsInlineLimit=100M` + `worker.format='es'` + `?worker&inline`. `mupdf-wasm.js` 의 `new URL(...)` asset emit 은 자체 Vite 플러그인(`stripMupdfWasmAsset`)으로 차단하여 워커 번들이 wasm 을 두 번 임베드하지 않도록 합니다.

## 라이선스 / 비범위

MVP 범위 외(설계상 제외):

- OCR (스캔본 텍스트화) — `TextExtractor` 인터페이스가 확장 가능하도록만 설계되어 있습니다.
- NER (이름/주소/기관명)
- PWA / Service Worker
- 데스크톱 패키징(.exe 등)

자세한 작업 이력과 후속 과제는 [HANDOFF.md](./HANDOFF.md) 를 참고하세요.
