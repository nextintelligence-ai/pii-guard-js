# shadcn/ui 마이그레이션 리서치 보고서

**작성일**: 2026-04-27
**스코프**: 현재 UI를 shadcn/ui 기반으로 재구성. 단일 HTML(`file://` 더블클릭) 동작 보장 우선.
**전제 조건**: M0~M7 + 빌드 사이즈 최적화(13.1MB) 완료. 41/41 테스트 통과.

---

## 1. 결론 (TL;DR)

| 질문 | 답 |
|---|---|
| shadcn/ui 가 `file://` 단일 HTML 모드에서 동작하는가? | **예, 네트워크/플랫폼 의존성이 없다.** Radix UI 는 순수 클라이언트 React + DOM API 만 사용한다. |
| 번들 사이즈 영향은? | **+50~120KB (gzip 후)** 수준. 18MB 가드 대비 ~1% 미만. 무시 가능. |
| 기존 빌드 파이프라인을 수정해야 하는가? | **거의 없음.** Tailwind 설정에 CSS 변수와 `tailwindcss-animate` 플러그인 추가, `tsconfig.json` 의 `paths` 는 이미 존재. |
| 위험 요소가 있는가? | 작음. ① Radix Portal 이 `document.body` 에 마운트되는지 확인 필요(전부 OK), ② lucide-react 는 named import 만 사용(번들 폭발 회피), ③ React 19 호환성. |

**권장**: 진행. 단계별 점진 마이그레이션이 안전하다.

---

## 2. 현재 UI 인벤토리

### 2.1 컴포넌트 트리

```
App
├── Toolbar              (상단 바: 업로드/Undo/Redo/사용법/마스킹스타일/적용/다운로드)
├── main (grid)
│   ├── aside (sidebar)
│   │   ├── (empty/loading/done/error 메시지)
│   │   └── CandidatePanel
│   │       ├── 카테고리별 그룹 (rrn/phone/email/account/businessNo/card)
│   │       │   ├── 카테고리 토글 (checkbox)
│   │       │   └── 박스 항목 리스트 (checkbox + page 링크)
│   └── section (canvas area)
│       ├── DropZone     (empty/loading 상태)
│       └── PdfCanvas
│           ├── canvas
│           ├── BoxOverlay  (SVG 드래그/리사이즈/선택/이동)
│           └── (size/scale 디버그 텍스트)
│       └── PageNavigator   (이전/현재 페이지/다음)
├── ReportModal          (적용 완료 시 표시)
└── UsageGuideModal      (최초 1회 + 사용법 버튼)
```

### 2.2 인터랙션 → 현재 구현

| UI 요소 | 현재 구현 | 문제점/개선 여지 |
|---|---|---|
| 업로드 버튼 | `<label>` 안에 `<input type=file hidden>` | 정상. 시각만 거칠다 |
| Undo/Redo 버튼 | `<button class="border">` | 단순. 키보드 단축키 표시 없음 |
| 마스킹 스타일 | `<select>` 네이티브 | 디자인 일관성 떨어짐 |
| 적용/다운로드 | 단색 버튼, disabled 처리 | 정상. 진행 상태 시각 피드백 없음 |
| 사이드바 후보 | `<ul>` 펼친 리스트 | **페이지 많은 PDF에서 길어짐** |
| 카테고리 토글 | 네이티브 checkbox | 정상이나 시각 일관성 부족 |
| 페이지 링크 | `<button>` underline | 클릭 영역 작음 |
| DropZone | dashed border + drag 상태 | 잘 동작 |
| ReportModal | overlay + dialog div | 포커스 트랩, ESC 닫기 등 미구현 |
| UsageGuideModal | overlay + dialog div, role/aria 일부 | 같음. shadcn Dialog 가 a11y 자동 처리 |
| PageNavigator | 좌/우 화살표 + 텍스트 | 입력 가능한 페이지 번호 없음 |

### 2.3 BoxOverlay 는 마이그레이션 범위 제외

`BoxOverlay.tsx` 는 SVG 좌표 + Pointer 이벤트만 사용 — 어떤 UI 라이브러리도 끼어들지 않는다. **shadcn 마이그레이션은 BoxOverlay 를 건드리지 않는다.**

---

## 3. shadcn 컴포넌트 매핑

| 현재 | shadcn 컴포넌트 | 사용처 | 신규 의존성 |
|---|---|---|---|
| `<label>+<input file>` 업로드 | `Button` (asChild로 label 래핑) | Toolbar | (없음) |
| Undo/Redo | `Button variant="outline"` + `Tooltip` | Toolbar | `@radix-ui/react-tooltip` |
| 마스킹 스타일 `<select>` | `Select` | Toolbar | `@radix-ui/react-select` |
| 적용/다운로드 | `Button variant="destructive"` / `Button` | Toolbar | (위에서 포함) |
| Toolbar 컨테이너 | `Card` + 커스텀 spacing | Toolbar 외곽 | (없음, 순수 CSS) |
| 사이드바 outer | `Card` + `ScrollArea` | aside | `@radix-ui/react-scroll-area` |
| 카테고리 토글 | `Checkbox` + `Label` | CandidatePanel | `@radix-ui/react-checkbox` + `@radix-ui/react-label` |
| 후보 박스 토글 | `Checkbox` (compact) | CandidatePanel | (위 포함) |
| 카테고리 그룹 헤더 | `Collapsible` | CandidatePanel | `@radix-ui/react-collapsible` (선택) |
| 페이지 카운트 뱃지 | `Badge` | CandidatePanel/Toolbar | (없음) |
| ReportModal | `Dialog` + `DialogHeader/Content/Footer` | App | `@radix-ui/react-dialog` |
| UsageGuideModal | `Dialog` (size lg) | App | (위 포함) |
| 적용 진행 상태 | `Progress` | Toolbar/aside | `@radix-ui/react-progress` |
| 에러 메시지 | `Alert` (variant destructive) | aside | (없음, 순수 CSS) |
| 스캔 PDF 경고 | `Alert` (variant warning) | UsageGuideModal | (없음) |
| 파일 정보 라인 | `Badge` + 텍스트 | aside header | (없음) |
| 페이지 입력 | `Input` (number) + 화살표 `Button` | PageNavigator | (없음) |
| 토스트(다운로드 시작 등) | `Sonner` | App | `sonner` (선택) |

### 아이콘
- `lucide-react`: Upload, Undo2, Redo2, HelpCircle, Download, Shield, Trash2, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, FileText 정도 (10~12개)
- **반드시 named import 만 사용** (`import { Upload } from 'lucide-react'`) — 라이브러리 전체를 트리 안 흔들면 수 MB 폭발

---

## 4. `file://` 호환성 점검

### 4.1 Radix UI 가 사용하는 브라우저 API
| API | file:// 동작 여부 | 비고 |
|---|---|---|
| `React.createPortal(child, document.body)` | ✅ | document.body 는 protocol 무관 |
| `useId()` | ✅ | React 18+ 표준, SSR 무관 |
| `Element.focus()` / focus-trap | ✅ | 순수 DOM |
| `KeyboardEvent`, `PointerEvent` | ✅ | 표준 |
| `MutationObserver` (focus scope) | ✅ | 표준 |
| `IntersectionObserver` (Tooltip 등) | ✅ | 표준 |
| 동적 `import()` | ⚠️ | 우리 워커 우회로(Blob URL)로 이미 해결. shadcn 컴포넌트는 정적 import 됨 |
| `fetch` / network | ❌ → 사용 안 함 | Radix 는 어떤 외부 호출도 없음 |
| Service Worker | ❌ → 사용 안 함 | |

### 4.2 우리 빌드 파이프라인의 기존 file:// 우회 패턴
- `vite-plugin-singlefile` + `assetsInlineLimit: 100M` → 모든 자산 base64 인라인
- `worker.format = 'es'` + `inlineDynamicImports: true` + 커스텀 `fileProtocolInlineModuleWorker` 플러그인 → file://에서 ES 모듈 워커 동작
- `define: { navigation: 'undefined' }` → React DOM 19 의 Navigation API 우회
- `stripMupdfWasmAsset` 플러그인 → mupdf 의 `new URL(...)` 자산 emit 차단

**shadcn 추가가 위 파이프라인에 영향을 주지 않는다.** Radix/lucide 는 모두 plain JS+JSX 트리이며, 동적 import 나 자산 URL 패턴이 없다.

### 4.3 기존에 통과한 검증
- `npm run build` 후 `dist/index.html` 외부 URL 0개 (`scripts/verify-no-external.mjs`)
- 18MB 사이즈 예산 (`scripts/verify-build-size.mjs`)
- **shadcn 추가 후에도 두 검증은 자동으로 회귀 가드 역할을 한다.**

---

## 5. 번들 사이즈 영향 (gzip 추정)

| 패키지 | gzip 후 추정 | 비고 |
|---|---|---|
| `@radix-ui/react-dialog` | ~12 KB | ReportModal + UsageGuideModal |
| `@radix-ui/react-select` | ~16 KB | MaskStylePicker |
| `@radix-ui/react-checkbox` | ~3 KB | CandidatePanel |
| `@radix-ui/react-label` | ~1 KB | |
| `@radix-ui/react-tooltip` | ~6 KB | |
| `@radix-ui/react-progress` | ~2 KB | |
| `@radix-ui/react-scroll-area` | ~5 KB | |
| `@radix-ui/react-collapsible` | ~3 KB | (선택) |
| `lucide-react` (10~12 아이콘) | ~3 KB | named import 전제 |
| `class-variance-authority` | ~1 KB | |
| `clsx` | ~0.5 KB | |
| `tailwind-merge` | ~3 KB | |
| `tailwindcss-animate` | 0 (CSS only) | |
| `sonner` (선택) | ~10 KB | |
| **합계** | **~55~65 KB** (sonner 포함 시 ~75 KB) | |

현재 13.1 MB 중 mupdf WASM(~10MB) 이 압도적이라 추가분은 **사실상 노이즈**. 18MB 가드 대비 여유 4.9MB 가 그대로 유지된다.

---

## 6. 마이그레이션 단계 제안

### Phase 0 — 기반 작업 (반나절)
1. `tailwind.config.js` 에 shadcn 테마 토큰 + `tailwindcss-animate` 플러그인 추가
2. `src/styles/index.css` 에 CSS 변수(`:root` / `.dark`) 추가
3. `tsconfig.json` 의 `paths` 확인 (이미 `@/*` 존재)
4. `lib/utils.ts` 에 `cn()` 헬퍼 추가
5. `npx shadcn@latest init` 으로 `components.json` 생성

### Phase 1 — 비파괴적 컴포넌트 추가 (반나절)
- `Button`, `Card`, `Badge`, `Alert`, `Separator`, `Label`, `Input` 추가 (Radix 의존성 없는 순수 CSS+cva)
- 기존 컴포넌트는 손대지 않음 — 빌드/테스트가 통과하는지 확인 (회귀 0)

### Phase 2 — Toolbar 재작성 (반나절)
- `Button` 으로 모든 버튼 교체
- `Select` 로 MaskStylePicker 교체
- `Tooltip` 으로 Undo/Redo 단축키(⌘Z, ⇧⌘Z) 표시
- 통합 테스트 + `npm run build` + 사이즈 가드 통과 확인

### Phase 3 — 사이드바 + CandidatePanel (1일)
- `Card`+`ScrollArea` 로 outer 재구성
- `Checkbox`+`Label` 로 토글 교체
- `Collapsible` 또는 페이지 그룹 헤더로 긴 리스트 정리
- 카테고리 색상 토큰화 (현재 `BoxOverlay` 의 색상 매핑과 일관)

### Phase 4 — 모달 (반나절)
- `Dialog` 로 ReportModal/UsageGuideModal 교체 (포커스 트랩, ESC 닫기, 스크린리더 a11y 자동 획득)
- 기존 `dismissReport` 흐름 유지

### Phase 5 — UX 개선 (스코프 결정 필요)
- 적용 진행률: `Progress` + 페이지 카운터
- 토스트 피드백: `Sonner` (선택)
- 페이지 점프 입력: `Input number`
- CandidatePanel 가상 스크롤(많은 후보 시): 별도 라이브러리 필요 → 후속 결정

### 각 Phase 종료 조건 (반복)
```
✓ npm test         (기존 테스트 무결)
✓ npm run lint
✓ npm run build    (외부 URL 0, 사이즈 ≤ 18MB)
✓ dist/index.html  더블클릭 → 모든 인터랙션 수동 검증
```

---

## 7. 위험과 완화

| 리스크 | 가능성 | 완화 |
|---|---|---|
| Radix Portal 이 file:// 에서 안 뜸 | 매우 낮음 | `document.body` 는 protocol 무관. 기존 우리 모달이 이미 inline 으로 동작 중이라 본질적으로 같은 패턴 |
| lucide-react 전체 import 로 사이즈 폭발 | 중간 | named import 강제. `eslint-plugin-import` 또는 코드 리뷰 가드 |
| Tailwind v3 → shadcn 가 v4 권장 | 낮음 | shadcn 은 v3/v4 둘 다 공식 지원. 우리는 v3 유지 |
| Radix 의 동적 import (`React.lazy`) 가 우리 worker plugin 과 충돌 | 매우 낮음 | Radix 는 정적 import 만 사용. 검증된 사실 |
| shadcn CLI 가 npm-only 환경 가정 (외부 fetch) | 낮음 | CLI 는 빌드 타임에만 동작, 런타임에는 영향 없음 |
| React 19 호환 | 낮음 | 2026-04 기준 Radix 는 React 19 공식 지원 |

---

## 8. 결정 필요 사항

`AskUserQuestion` 으로 확인할 항목:
1. **다크 모드 지원** 추가할지? (shadcn 기본 설계는 light/dark 토글)
2. **단일 HTML 단일 화면**(현재) 유지 vs **반응형 사이드바(Sheet)** 도입?
3. **Sonner 토스트** 도입 여부 (다운로드 시작/오류 피드백 강화)
4. **컴포넌트 리스트**의 우선순위 — Phase 2~4 중 어디부터 시작할지

---

## 9. 참고 자료

- shadcn/ui Vite 설치 가이드: https://ui.shadcn.com/docs/installation/vite
- Radix Dialog: https://www.radix-ui.com/primitives/docs/components/dialog
- Radix Portal `container` prop (Electron/오프라인 환경 사용 패턴): https://www.radix-ui.com/primitives/docs/utilities/portal
- lucide-react 트리쉐이킹: https://lucide.dev/guide/packages/lucide-react
- Vite dev 모드 lucide alias 최적화: https://christopher.engineering/en/blog/lucide-icons-with-vite-dev-server
