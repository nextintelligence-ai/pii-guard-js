# CLAUDE.md — pdf-anony 프로젝트 가이드

이 파일은 이 저장소에서 Claude Code 가 작업할 때 따라야 할 컨벤션과 비자명한 제약을 모아둔 것입니다. 새 세션이라면 먼저 [HANDOFF.md](./HANDOFF.md) 와 [README.md](./README.md) 를 함께 훑어 컨텍스트를 잡으세요.

## 프로젝트 한 줄 요약

브라우저 단독으로 한국어 PDF 의 PII 6종(주민/전화/이메일/계좌/사업자/카드)을 redaction 하는 **단일 HTML 도구**. React 19 + Vite + MuPDF.js(WASM) + Web Worker.

## 절대 깨지면 안 되는 제약

이 4가지는 설계 전제입니다. 깨면 도구의 존재 이유가 사라집니다.

1. **외부 네트워크 호출 금지.** PDF 도, 텔레메트리도, 폰트도, 어떤 fetch 도 외부로 나가서는 안 됩니다. `scripts/verify-no-external.mjs` 가 postbuild 에서 산출 HTML 안의 모든 URL 을 검사합니다. dev 안내용 console.error URL(`react.dev/errors/`, `radix-ui.com/primitives/`)만 allow list 에 있습니다.
2. **단일 HTML, `file://` 더블클릭 동작.** 빌드는 `dist/index.html` 하나입니다. Service Worker / PWA / 별도 자산 파일 추가 금지. `vite-plugin-singlefile` 가 inline 하는 전제를 깨면 안 됩니다.
3. **빌드 사이즈 18MB 예산.** `scripts/verify-build-size.mjs` 가 postbuild 에서 가드합니다. 큰 의존성(폰트/모델/별도 wasm) 추가 전엔 사이즈 영향을 먼저 추정하세요.
4. **PII 처리 결과 검증.** 적용 후 `useApply` 가 다시 텍스트를 추출해 누수 0건을 확인합니다(`postCheckLeaks === 0`). 이 검증을 우회하지 마세요.

## 사용자 환경 메모

- 사용자: `taesoon.park@jiransoft.io.kr`. 한국어로 응답하고 PR/커밋 메시지/주석/테스트 이름 모두 한국어를 기본으로 합니다(전역 CLAUDE.md 규칙).
- worktree 에서 작업할 때는 main repo 에 직접 손대지 않습니다.

## 커맨드 (자주 쓰는 순서)

```bash
npm test           # vitest run (단위 + 통합)
npm run lint       # tsc -b
npm run build      # tsc -b && vite build → dist/index.html + postbuild 검증 2종
npm run dev        # http://localhost:5173
```

`prebuild`/`predev`/`pretest` 가 자동으로 `scripts/embed-wasm.mjs` 를 실행해 `src/wasm/mupdfBinary.ts`(gitignored) 를 만듭니다. 직접 만지지 마세요.

작업 종료 전엔 **반드시** `npm test && npm run lint && npm run build` 3종이 통과하는지 확인합니다. shadcn 마이그레이션처럼 큰 변경에서는 Phase 마다 강제했던 게이트입니다.

## 컨벤션

### 코드

- **TypeScript strict.** `any` 금지, 명시적 narrowing 선호.
- **shadcn 컴포넌트는 명시적 반환 타입(`: JSX.Element`) 붙이지 마세요.** React 19 + `jsx: "react-jsx"` 환경에서 `JSX` 글로벌 네임스페이스가 빠져 `TS2503` 이 납니다. 추론에 맡기는 게 기존 컨벤션입니다.
- **`@/` alias** 사용 (`@/components`, `@/state`, `@/hooks`, `@/core`, `@/lib/utils`).
- **모든 박스 좌표는 PDF point.** 화면 표시 시점에만 viewport scale 을 곱합니다. rotation 처리도 좌표 변환 한 곳에서 수행합니다.
- **드래그/리사이즈 중엔 컴포넌트 로컬 state 로 pending bbox 유지**, commit 시점에만 store 업데이트 → drag 1회 = undo 1회.
- **Zustand 셀렉터는 `useShallow`** 로 referential equality 보장.

### 테스트

- 테스트 파일명/`describe`/`it` 모두 **한국어**. (`주민등록번호 detector`, `undo 스택은 ...`)
- 단위 테스트는 `tests/unit/`, 통합은 `tests/integration/`.
- 픽스처 PDF 는 `pdf-lib` 로 동적 생성(`scripts/make-test-fixture.mjs`). 바이너리 PDF 를 저장소에 커밋하지 마세요.
- Node `Buffer.buffer` 는 cross-realm 이슈가 있어 mupdf 에 넘길 때는 `new Uint8Array(...).buffer` 로 새로 만들어 전달합니다.

### 커밋/PR

- 커밋 메시지: 한국어, conventional 스타일(`feat(ui):`, `fix:`, `refactor:`, `docs:`, `chore:`, `perf(build):` 등) — 기존 git log 가 일관된 형식입니다.
- PR 본문도 한국어.

## MuPDF 1.27 함정 모음 (반복해서 부딪히는 곳)

이 부분은 mupdf 공식 문서에 잘 안 나오는 실측 결과입니다. 코드를 만지기 전에 한 번 봅니다.

- **초기화는 import 전에.** `globalThis["$libmupdf_wasm_Module"] = { wasmBinary }` 를 먼저 세팅한 뒤 `await import('mupdf')` 합니다(`src/core/mupdfBridge.ts`). 동적 import 가 평가 시점을 보장합니다.
- **워커 포맷은 `'es'`.** `iife` 는 mupdf 의 top-level await 와 호환 안 됩니다. `vite.config.ts` 에서 `worker.format = 'es'` + `?worker&inline` 조합이 정답.
- **WASM 은 메인에서 1회 디코드 → transferable 로 워커에 이관.** `init-wasm` 핸드셰이크 후 워커가 comlink 를 expose 합니다. 워커 번들이 wasm 을 별도로 다시 임베드하지 않도록 `stripMupdfWasmAsset` Vite 플러그인이 `mupdf-wasm.js` 의 `new URL(...)` asset emit 을 차단합니다.
- **Redaction.** `Page.createAnnotation` 은 base `Page` 에 없습니다. **`PDFPage.createAnnotation('Redact')`** 사용. 이후 `setRect` → `setContents(text)` (overlay text 는 `setContents`. `setOverlayText` 같은 메서드는 존재하지 않습니다) → `applyRedactions(true)` per page.
- **저장.** `doc.asPDF()?.saveToBuffer('garbage=4,compress=yes').asUint8Array()`. 메타데이터 정리는 `doc.setMetaData('info:Title', '')` (`info:` prefix 필수).
- **페이지 회전.** `getRotation()` 은 노출 안 됩니다. `PDFPage.getObject().getInheritable('Rotate').asNumber()` 로 읽습니다.
- **Pixmap.** `getPixels()` 는 RGB packed(`getNumberOfComponents()` 로 3/4 구분). `ImageData(rgba, w, h)` 로 변환하려면 직접 RGBA 패킹이 필요합니다(`pixmapToRgba`).

## shadcn / UI 메모

- **shadcn 추가 시 `components.json` 의 alias 와 토큰 변수**를 그대로 따릅니다. 디자인 토큰은 `src/styles/index.css` CSS 변수로 정의되어 있습니다(라이트 전용).
- **Radix Primitives 는 `file://` 호환.** 모두 `React.createPortal` + 표준 DOM API 만 사용하므로 fetch / Service Worker 가 없어 단일 HTML + file:// 환경 그대로 동작합니다. 별도 우회 불필요.
- **Radix dev 안내 URL.** Dialog 등은 `console.error("…see https://radix-ui.com/primitives/docs/components/dialog")` 로 안내 메시지를 출력합니다. fetch 아니지만 `verify-no-external.mjs` 가 잡으므로 allow list 에 추가되어 있습니다.
- **Sonner 토스트**는 `toast.loading({ id })` → 같은 id 로 success/warning/error 갱신해서 중복을 막습니다(`useApply` 참고).
- **Dialog 정중앙 애니메이션.** `tailwindcss-animate` 의 `zoom-in-95` 가 `transform` 을 덮어쓰기 때문에 정중앙 dialog 에는 `slide-in-from-left-1/2` + `slide-in-from-top-[48%]` 를 함께 붙여야 `--tw-enter-translate-{x,y}` 가 -50%/-48% 로 세팅되어 중앙에서 자연스럽게 나타납니다(`src/components/ui/dialog.tsx`).

## 작업 흐름 가이드

1. **새 기능 추가 전엔 [HANDOFF.md](./HANDOFF.md) 의 "What Worked" / "What Didn't Work" 를 먼저 확인합니다.** 같은 함정에 두 번 빠지지 않습니다.
2. **TDD.** detector / store / undo 처럼 순수 로직은 항상 테스트 먼저. 6종 detector 가 한 번에 동작한 이유.
3. **마일스톤 단위로 dispatch 가능한 작업은 fresh subagent 로 위임.** Subagent-Driven Development 스킬 참고.
4. **PoC 우선.** 새 라이브러리(특히 wasm)를 들이려면 본 구현 전에 작은 PoC 로 실 API 를 먼저 확인합니다(M0 가 그렇게 진행됐습니다).
5. **사이즈 변동을 동반하는 작업**(폰트/wasm/큰 의존성)은 18MB 예산 가드를 의식하고, 영향 추정을 먼저 적습니다.

## MVP 범위 밖 (의도된 비범위)

이걸 추가해도 좋겠다는 충동이 들면, 사용자에게 먼저 확인합니다.

- OCR (스캔본 텍스트화) — `TextExtractor` 인터페이스로 확장 여지만 둠
- NER (이름/주소/기관명)
- PWA / Service Worker — 명시적으로 제외 결정됨
- 데스크톱 패키징(.exe 등)

## 자주 참고할 파일

- 설계 배경: `docs/superpowers/specs/2026-04-27-pdf-anonymization-design.md`
- 마일스톤별 구현 의도: `docs/superpowers/plans/2026-04-27-pdf-anonymization.md`
- 빌드 사이즈 최적화 설계: `docs/superpowers/plans/2026-04-27-build-size-optimization.md`
- shadcn 마이그레이션 리서치/플랜: `docs/superpowers/specs/2026-04-27-shadcn-migration-research.md`, `docs/superpowers/plans/2026-04-27-shadcn-migration.md`
- mupdf 1.27 실측 API: `docs/poc-report.md`
- 릴리스 검증: `docs/release-checklist.md`
