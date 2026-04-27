# PDF 익명화 도구 — Handoff

**프로젝트 루트**: `/Users/taesoonpark/Workspace/pdf-anony`
**최종 업데이트**: 2026-04-27
**상태**: M0~M7 + 빌드 사이즈 최적화 + shadcn/ui 마이그레이션 (Phase 0~4) 완료, 사용자 수동 검증 대기. 빌드 13.25MB

---

## Goal

LOFA(손해사정 보고서) 시나리오의 PDF 안에 들어 있는 PII(주민등록번호/전화/이메일/계좌/사업자/카드)를 **브라우저 단독**으로 식별·제거하여 익명화된 PDF를 다운로드하는 도구.

핵심 제약:
- PDF는 절대 외부 네트워크로 나가지 않음 — 전체 처리 클라이언트 사이드
- **단일 HTML 파일** 배포 (`file://` 더블클릭 실행). `.exe`/설치 불가
- React 19 + Vite + TS + MuPDF.js(WASM) + Web Worker
- OCR/NER은 후속, MVP는 정규식 + 수동 검수

---

## Current Progress

### 완료된 마일스톤 (M0~M7) — 33 commits, 32 tests

| | 내용 | 핵심 산출물 |
|---|---|---|
| **M0** | PoC: 부트스트랩, WASM base64 임베드, 워커+MuPDF 동작 | `src/core/mupdfBridge.ts`, `src/workers/pdf.worker.ts`, `docs/poc-report.md` |
| **M1** | 정규식 detector 6종 (TDD) | `src/core/detectors/{rrn,phone,email,account,businessNo,card}.ts` |
| **M2** | Zustand 스토어 + undo/redo, DropZone, Toolbar, PdfCanvas | `src/state/{store,selectors,undoStack}.ts`, `src/components/*` |
| **M3** | 자동 탐지 트리거, BoxOverlay, CandidatePanel, PageNavigator | `src/hooks/useAutoDetect.ts`, `src/components/{BoxOverlay,CandidatePanel,PageNavigator}.tsx` |
| **M4** | 박스 그리기/선택/이동/리사이즈/삭제, Shift+드래그 텍스트 선택, 키보드 | `src/components/BoxOverlay.tsx`, `src/hooks/{useKeyboard,useSpansForPage}.ts` |
| **M5** | redactor + 메타데이터 정리 + postCheck + 다운로드 + 리포트 | `src/core/redactor.ts`, `src/hooks/useApply.ts`, `src/components/ReportModal.tsx` |
| **M6** | 마스킹 스타일, 큰 파일 경고, 암호화 PDF 프롬프트 | `src/components/MaskStylePicker.tsx`, `src/hooks/usePdfDocument.ts` 보강 |
| **M7** | 외부 URL 검증, 통합 테스트, 릴리스 체크리스트 | `scripts/verify-no-external.mjs`, `tests/integration/redact.test.ts`, `docs/release-checklist.md` |

### 검증 상태

```
✓ npm test         → 41/41 passing (단위 39 + 통합 2)
✓ npm run lint     → tsc -b clean
✓ npm run build    → dist/index.html 13.1MB (이전 35.9MB → 62% 감소)
✓ postbuild check  → 외부 URL 0개 + 18MB 사이즈 예산 가드
✓ 통합 redact 테스트 → postCheckLeaks === 0
```

### 빌드/실행

```bash
npm install              # 처음 한 번
npm run dev              # 개발 서버 (http://localhost:5173)
npm run build            # 단일 HTML 산출 (dist/index.html)
npm test                 # 전체 테스트
npm run lint             # 타입 체크
```

---

## What Worked

### 아키텍처
- **MuPDF.js를 Web Worker에 격리** + comlink RPC: UI 끊김 없음, 확장 친화적
- **Zustand + useShallow** 셀렉터: 박스 다수 그릴 때 referential equality 보장
- **PoC 우선 (M0 Day-0)**: 라이브러리 실 API 발견을 본구현 전에 처리 → 후속 마일스톤이 깔끔
- **TDD 엄격 적용** (detector / store / undo): 6 detector 모두 한 번에 동작
- **Subagent-Driven Development**: 마일스톤 단위 dispatch → fresh context로 일관된 품질

### MuPDF 1.27 실제 API
- 초기화: `globalThis.$libmupdf_wasm_Module = { wasmBinary }` → `await import('mupdf')`
- 워커 포맷: **`worker.format = 'es'`** + `?worker&inline` (`iife` 는 TLA 충돌)
- Redaction: `PDFPage.createAnnotation('Redact')` → `setRect` → `setContents(text)` (overlay text) → `applyRedactions(true)` per page
- 저장: `doc.asPDF()?.saveToBuffer('garbage=4,compress=yes').asUint8Array()`
- 메타데이터: `doc.setMetaData('info:Title', '')` (info: prefix)
- 페이지 회전: `PDFPage.getObject().getInheritable('Rotate').asNumber()` (`getRotation()` 없음)
- Pixmap: `getPixels()` RGB-packed → 수동 RGBA 변환 후 `ImageData` → `createImageBitmap`

### 좌표/도구 UX
- 모든 박스를 **PDF point 좌표로 저장**, 화면 표시 시점에만 viewport scale 적용 → rotation 0/90/180/270 일관 처리
- 박스 이동/리사이즈 중 `updateBox`를 즉시 호출하지 않고 컴포넌트 로컬 state로 pending bbox 유지 → drag 1회 = undo 1회
- pointer capture로 cursor가 SVG 밖으로 나가도 추적 유지

### 통합 테스트
- 픽스처 PDF는 `pdf-lib`로 자동 생성 (`scripts/make-test-fixture.mjs`)
- Node `Buffer.buffer`는 cross-realm 이슈가 있어 `new Uint8Array(...).buffer` 로 새로 만들어 mupdf에 전달

---

## What Didn't Work

### 시도했다가 폐기된 접근
1. **`worker.format = 'iife'`** (플랜 초안): mupdf의 top-level await가 IIFE 출력 포맷에서 깨짐 → `'es'` + dynamic-imports inline로 변경
2. **`require.resolve('mupdf/dist/mupdf-wasm.wasm')`**: mupdf@1.27 `package.json`이 subpath를 export하지 않아 실패 → 메인 엔트리 디렉터리에서 sibling 파일을 `fs.access`로 탐색하는 fallback 추가 (`scripts/embed-wasm.mjs`)
3. **mupdf의 `setOverlayText`**: 존재하지 않음 → `setContents(text)`로 대체
4. **`tsc -b --noEmit`** lint 스크립트: composite project ref가 emit하면서 TS6310 충돌 → `tsc -b`로 단순화 (`tsconfig.json`이 이미 `noEmit: true`)
5. **`undoStack.push(cur)`** in `redo()` (플랜 초안): future stack을 클리어해서 연속 redo 불가 → `pushPast(cur)` 추가로 수정

### 알려진 이슈 / 한계
- ~~**빌드 산출물 35.9MB**~~ → **해결됨 (2026-04-27, 13.1MB)**: WASM 을 메인 스레드에서 1회 디코드 → `postMessage(buf, [buf])` transferable 로 워커에 zero-copy 이관. 워커는 `init-wasm` 핸드셰이크 후에만 comlink expose. Vite 의 `mupdf-wasm.js` `new URL(...)` 자산 emit 도 `stripMupdfWasmAsset` 플러그인으로 차단. `scripts/verify-build-size.mjs` 가 18MB 예산을 postbuild 에 강제. 자세한 설계는 `docs/superpowers/plans/2026-04-27-build-size-optimization.md`.
- **`docs/poc-report.md`**의 사용자 수동 검증 항목이 미완료: `file://` 더블클릭 → Chrome/Edge/Firefox 동작 검증
- **CandidatePanel**이 페이지 그룹화 없이 전체 후보를 카테고리별로 펼침: 페이지 많은 PDF에서 길어짐. UX 개선 여지

### 손대지 않은 의도된 비범위 (MVP 제외)
- OCR (스캔본 텍스트화) — `TextExtractor` 인터페이스가 확장 가능하도록만 설계
- NER (이름/주소/기관명)
- PWA / Service Worker (사용자 결정으로 제외)
- 데스크톱 패키징

---

## Next Steps

### 즉시 (사용자 검증 후 결정)
1. **사용자 수동 검증** — `npm run build` → `dist/index.html`을 OS에서 더블클릭:
   - [ ] Chrome (Windows / macOS)
   - [ ] Edge (Windows)
   - [ ] Firefox
   - 검증 항목: 워커 ping 응답, PDF 업로드 → 캔버스 렌더, 자동 탐지 → 적용 → 다운로드, 결과 PDF 메타데이터 비어있음, DevTools 콘솔 에러 없음
2. 검증 결과를 `docs/poc-report.md`에 기록

### ~~우선순위 1 — 빌드 사이즈 최적화~~ → **완료 (2026-04-27)**
13.1MB 달성. `?worker&inline` 은 그대로 두되 WASM 만 워커 번들에서 분리해 메인이 transferable 로 이관. 추가로 `mupdf-wasm.js` 의 `new URL(...)` asset emit 을 Vite 플러그인으로 차단해야 했던 점이 발견사항. 자세한 내역은 `docs/superpowers/plans/2026-04-27-build-size-optimization.md`.

### ~~우선순위 1 — UX 개선~~ → **부분 완료 (2026-04-27)**
shadcn/ui 마이그레이션 (Phase 0~4) 완료:
- 디자인 토큰화 (CSS 변수 라이트 전용) + Tailwind config 갱신
- 16개 ui primitive 추가 (`src/components/ui/{button,card,badge,alert,separator,label,input,tooltip,checkbox,select,dialog,scroll-area,collapsible,progress,sonner}.tsx`)
- Toolbar/MaskStylePicker/PageNavigator/DropZone/CandidatePanel/ReportModal/UsageGuideModal 모두 shadcn 기반 재구성
- CandidatePanel: 카테고리 안에서 페이지 그룹화 + Collapsible (긴 PDF 대응)
- Sonner 토스트로 적용/다운로드/에러 피드백 일원화
- 빌드 13.06 MB → **13.25 MB** (+0.19MB, 18MB 가드 여유 4.75MB)
- `scripts/verify-no-external.mjs` allow list 에 Radix a11y 경고 URL 추가 (`https://radix-ui.com/primitives/`, console.error 메시지에만 사용되며 fetch 아님)
- BoxOverlay/PdfCanvas/PDF 처리 코어는 손대지 않음

남은 UX 항목:
- BoxOverlay 에서 Shift 누른 동안 커서 변경 (텍스트 선택 모드 시각화)
- 적용 진행 중 페이지별 진행률 표시 (현재 통째로 `applying` 상태) — Progress 컴포넌트 준비됨
- CandidatePanel 가상 스크롤 (수천 후보 시)

### 우선순위 2 — 테스트 보강
- 회전된 페이지 PDF로 좌표 검증 (`scripts/make-test-fixture.mjs`에 rotation 옵션 추가)
- 한국어 텍스트가 들어간 fixture (Helvetica 한계 → Noto Sans KR 임베드 또는 별도 PDF)
- `Buffer` cross-realm 이슈를 회피하는 헬퍼 함수로 추출 (`tests/utils/loadFixturePdf.ts`)

### 후속 — OCR 통합 (별도 마일스톤)
- `TextExtractor` 인터페이스에 `TesseractTextExtractor` 추가
- dynamic import로 메인 번들 영향 최소화
- 한국어 학습 데이터(`kor.traineddata` ~30MB)는 lazy-load + 캐시

---

## 파일 맵

### 산출 문서
- `docs/superpowers/specs/2026-04-27-pdf-anonymization-design.md` — 설계 스펙
- `docs/superpowers/plans/2026-04-27-pdf-anonymization.md` — 구현 계획 (M0~M7 태스크별)
- `docs/poc-report.md` — PoC 결과 + mupdf 1.27 발견사항
- `docs/release-checklist.md` — 릴리스 전 검증 항목

### 핵심 소스
- `src/core/mupdfBridge.ts` — MuPDF 호출 통합 (open/render/extract/applyRedactions)
- `src/core/redactor.ts` — annotation 생성 / applyRedactions / clearMetadata
- `src/core/detectors/index.ts` + `*.ts` — 6 detector + runDetectors
- `src/workers/pdf.worker.ts` — comlink로 노출되는 워커 API
- `src/state/store.ts` — Zustand 단일 스토어 + undo/redo
- `src/components/BoxOverlay.tsx` — 가장 복잡한 UI (drag-create / select / move / resize / shift+drag text-select)

### 빌드/배포
- `vite.config.ts` — singlefile + worker.format='es' + assetsInlineLimit=100M
- `scripts/embed-wasm.mjs` — mupdf wasm → base64 → `src/wasm/mupdfBinary.ts` (gitignored)
- `scripts/verify-no-external.mjs` — postbuild 검증 (외부 URL 0)
- `scripts/make-test-fixture.mjs` — pdf-lib로 PII 더미 PDF 생성

---

## 첫 새 세션을 시작할 때

```bash
cd /Users/taesoonpark/Workspace/pdf-anony
cat HANDOFF.md   # 이 파일
git log --oneline | head -20
npm test
npm run dev
```

설계 결정 배경이 필요하면 `docs/superpowers/specs/`, 구현 의도 단계가 필요하면 `docs/superpowers/plans/`를 본다. mupdf 1.27 API의 실측 결과는 `docs/poc-report.md`에 모여 있다.
