# TanStack Router Batch/Single Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** TanStack Router로 홈, 단일 PDF 처리, 여러 PDF 일괄 자동 처리, batch 파일별 검수 상세 화면을 분리한다.

**Architecture:** 기존 단일 PDF 편집 흐름은 `SinglePage`로 보존하고, root route의 `AppShell`이 내비게이션과 사용법 모달을 담당한다. 홈에서 선택한 `File` 객체는 URL에 담을 수 없으므로 pending file store에 잠시 보관한 뒤 `/single` 또는 `/batch` route에서 소비한다. Batch는 별도 Zustand store와 순차 runner를 사용해 한 번에 한 PDF만 MuPDF worker에 열고 자동 탐지, 적용, post-check 검증을 실행한다.

**Tech Stack:** React 19, TypeScript, Vite, TanStack Router, Zustand, MuPDF worker, PaddleOCR worker, Vitest, shadcn/ui, lucide-react.

---

## 설계 참조

- `docs/plans/2026-05-01-tanstack-router-batch-single-design.md`
- `CLAUDE.md`
- `README.md`

## 구현 전제

- 외부 네트워크 호출 금지.
- PWA/Service Worker 추가 금지.
- batch는 여러 PDF를 동시에 열지 않고 순차 처리한다.
- batch 자동 적용 기본 대상은 `auto`, `ocr` 후보만이다.
- NER 자동 적용은 설정만 먼저 노출하되 기본 OFF로 둔다. 구현 중 NER worker 연동 범위가 커지면 별도 후속 task로 분리한다.
- 작업 완료 전 `npm test`, `npm run lint`, `npm run build`를 통과시킨다.

## Task 1: TanStack Router 의존성과 라우터 smoke 테스트

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/router.tsx`
- Create: `tests/unit/router.test.tsx`

**Step 1: Write the failing test**

Create `tests/unit/router.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { router } from '@/router';

describe('TanStack Router 라우팅', () => {
  it('홈, 단일 처리, 일괄 처리, batch 상세 route 를 등록한다', () => {
    const routePaths = router.flatRoutes.map((route) => route.fullPath).sort();

    expect(routePaths).toContain('/');
    expect(routePaths).toContain('/single');
    expect(routePaths).toContain('/batch');
    expect(routePaths).toContain('/batch/$jobId');
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/unit/router.test.tsx
```

Expected: FAIL because `@/router` does not exist.

**Step 3: Install dependency**

Run:

```bash
npm install @tanstack/react-router
```

Expected: `package.json` and `package-lock.json` include `@tanstack/react-router`.

**Step 4: Add minimal router**

Create `src/router.tsx`:

```tsx
import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';

function RootPlaceholder() {
  return <Outlet />;
}

function HomePlaceholder() {
  return <div>홈</div>;
}

function SinglePlaceholder() {
  return <div>단일 처리</div>;
}

function BatchPlaceholder() {
  return <div>일괄 처리</div>;
}

function BatchJobPlaceholder() {
  return <div>일괄 상세</div>;
}

const rootRoute = createRootRoute({
  component: RootPlaceholder,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePlaceholder,
});

const singleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/single',
  component: SinglePlaceholder,
});

const batchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/batch',
  component: BatchPlaceholder,
});

const batchJobRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/batch/$jobId',
  component: BatchJobPlaceholder,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  singleRoute,
  batchRoute,
  batchJobRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
```

**Step 5: Run test to verify it passes**

Run:

```bash
npx vitest run tests/unit/router.test.tsx
```

Expected: PASS.

**Step 6: Commit**

```bash
git add package.json package-lock.json src/router.tsx tests/unit/router.test.tsx
git commit -m "feat(router): TanStack Router 기본 라우트 추가"
```

## Task 2: RouterProvider 부트스트랩과 AppShell 추가

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/router.tsx`
- Create: `src/AppShell.tsx`
- Create: `src/state/helpDialogStore.ts`
- Create: `tests/unit/AppShell.test.tsx`

**Step 1: Write the failing test**

Create `tests/unit/AppShell.test.tsx`:

```tsx
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { router } from '@/router';

describe('AppShell', () => {
  let root: Root | null = null;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    root = null;
  });

  it('상단 내비게이션에서 홈, 단일 처리, 일괄 처리를 보여준다', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] });
    router.update({ history });

    const container = document.createElement('div');
    root = createRoot(container);

    await act(async () => {
      root?.render(<RouterProvider router={router} />);
    });

    expect(container.textContent).toContain('PDF 익명화 도구');
    expect(container.textContent).toContain('단일 처리');
    expect(container.textContent).toContain('일괄 처리');
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/unit/AppShell.test.tsx
```

Expected: FAIL because `AppShell` is not wired into the router.

**Step 3: Add help dialog store**

Create `src/state/helpDialogStore.ts`:

```ts
import { create } from 'zustand';

type State = {
  open: boolean;
  doNotShowAgain: boolean;
};

type Actions = {
  openHelp(): void;
  closeHelp(): void;
  setDoNotShowAgain(v: boolean): void;
};

export const useHelpDialogStore = create<State & Actions>((set, get) => ({
  open: false,
  doNotShowAgain: false,
  openHelp() {
    set({ open: true, doNotShowAgain: false });
  },
  closeHelp() {
    set({ open: false });
  },
  setDoNotShowAgain(v) {
    set({ doNotShowAgain: v });
  },
}));
```

**Step 4: Add AppShell**

Create `src/AppShell.tsx`:

```tsx
import { Link, Outlet } from '@tanstack/react-router';
import { HelpCircle } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { UsageGuideModal } from '@/components/UsageGuideModal';
import { useHelpDialogStore } from '@/state/helpDialogStore';
import { markUsageGuideSeen } from '@/utils/usageGuideStorage';

export function AppShell() {
  const open = useHelpDialogStore((s) => s.open);
  const doNotShowAgain = useHelpDialogStore((s) => s.doNotShowAgain);
  const openHelp = useHelpDialogStore((s) => s.openHelp);
  const closeHelp = useHelpDialogStore((s) => s.closeHelp);
  const setDoNotShowAgain = useHelpDialogStore((s) => s.setDoNotShowAgain);

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <header className="flex items-center gap-2 border-b bg-background px-4 py-2 shadow-sm">
        <Link to="/" className="mr-4 text-sm font-semibold">
          PDF 익명화 도구
        </Link>
        <Button asChild variant="ghost" size="sm">
          <Link to="/single">단일 처리</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/batch">일괄 처리</Link>
        </Button>
        <div className="flex-1" />
        <Button size="icon" variant="ghost" onClick={openHelp} aria-label="사용법">
          <HelpCircle />
        </Button>
      </header>
      <Outlet />
      <UsageGuideModal
        open={open}
        doNotShowAgain={doNotShowAgain}
        onDoNotShowAgainChange={setDoNotShowAgain}
        onClose={() => {
          if (doNotShowAgain) markUsageGuideSeen();
          closeHelp();
        }}
      />
      <Toaster position="bottom-center" />
    </div>
  );
}
```

**Step 5: Wire AppShell and RouterProvider**

Modify `src/router.tsx` so root route uses `AppShell`.

Modify `src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
```

**Step 6: Run test to verify it passes**

Run:

```bash
npx vitest run tests/unit/AppShell.test.tsx tests/unit/router.test.tsx
```

Expected: PASS.

**Step 7: Commit**

```bash
git add src/main.tsx src/router.tsx src/AppShell.tsx src/state/helpDialogStore.ts tests/unit/AppShell.test.tsx
git commit -m "feat(router): 공통 앱 셸과 라우터 부트스트랩"
```

## Task 3: 기존 App을 SinglePage로 이동

**Files:**
- Create: `src/pages/SinglePage.tsx`
- Modify: `src/router.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Toolbar.tsx`
- Test: `tests/unit/pages/SinglePage.test.tsx`

**Step 1: Write the failing test**

Create `tests/unit/pages/SinglePage.test.tsx`:

```tsx
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SinglePage } from '@/pages/SinglePage';
import { useAppStore } from '@/state/store';

vi.mock('@/components/NerRuntime', () => ({
  default: () => null,
}));

vi.mock('@/components/NerLoadButton', () => ({
  default: () => <button type="button">NER 모델 로드</button>,
}));

describe('SinglePage', () => {
  let root: Root | null = null;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useAppStore.getState().reset();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    root = null;
    useAppStore.getState().reset();
  });

  it('PDF가 없을 때 단일 처리 드롭존을 보여준다', async () => {
    const container = document.createElement('div');
    root = createRoot(container);

    await act(async () => {
      root?.render(<SinglePage />);
    });

    expect(container.textContent).toContain('아직 검사할 PDF가 없습니다');
    expect(container.textContent).toContain('PDF 파일을 여기에 드롭하세요');
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/unit/pages/SinglePage.test.tsx
```

Expected: FAIL because `src/pages/SinglePage.tsx` does not exist.

**Step 3: Move current App body**

Create `src/pages/SinglePage.tsx` from the current `src/App.tsx` body.

Adjust:

- Remove outer `<div className="flex min-h-screen...">` because `AppShell` owns page shell.
- Remove `Toaster` and `UsageGuideModal` from the page.
- Replace local usage guide state with `useHelpDialogStore((s) => s.openHelp)`.
- Keep `Toolbar`, `DropZone`, `PdfCanvas`, `CandidatePanel`, `PageNavigator`, `ApplyResultDialog`.

Modify `src/App.tsx` to either re-export `SinglePage` for compatibility or delete references after router migration:

```tsx
export { SinglePage as default } from '@/pages/SinglePage';
```

Modify `src/router.tsx` so `/single` route renders `SinglePage`.

**Step 4: Run test to verify it passes**

Run:

```bash
npx vitest run tests/unit/pages/SinglePage.test.tsx tests/unit/components/Toolbar.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/App.tsx src/pages/SinglePage.tsx src/router.tsx src/components/Toolbar.tsx tests/unit/pages/SinglePage.test.tsx
git commit -m "refactor(ui): 단일 처리 화면을 라우트 페이지로 분리"
```

## Task 4: 홈 작업 선택 화면과 pending file store

**Files:**
- Create: `src/state/pendingFileStore.ts`
- Create: `src/pages/HomePage.tsx`
- Modify: `src/pages/SinglePage.tsx`
- Modify: `src/router.tsx`
- Test: `tests/unit/state/pendingFileStore.test.ts`
- Test: `tests/unit/pages/HomePage.test.tsx`

**Step 1: Write pending store test**

Create `tests/unit/state/pendingFileStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { usePendingFileStore } from '@/state/pendingFileStore';

describe('pending file store', () => {
  beforeEach(() => usePendingFileStore.getState().reset());

  it('단일 처리용 파일을 한 번만 소비한다', () => {
    const file = new File(['pdf'], 'single.pdf', { type: 'application/pdf' });

    usePendingFileStore.getState().setSingleFile(file);

    expect(usePendingFileStore.getState().consumeSingleFile()).toBe(file);
    expect(usePendingFileStore.getState().consumeSingleFile()).toBeNull();
  });

  it('batch 처리용 파일 목록을 한 번만 소비한다', () => {
    const files = [
      new File(['a'], 'a.pdf', { type: 'application/pdf' }),
      new File(['b'], 'b.pdf', { type: 'application/pdf' }),
    ];

    usePendingFileStore.getState().setBatchFiles(files);

    expect(usePendingFileStore.getState().consumeBatchFiles()).toEqual(files);
    expect(usePendingFileStore.getState().consumeBatchFiles()).toEqual([]);
  });
});
```

**Step 2: Write HomePage render test**

Create `tests/unit/pages/HomePage.test.tsx`:

```tsx
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HomePage } from '@/pages/HomePage';

describe('HomePage', () => {
  let root: Root | null = null;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    root = null;
  });

  it('단일 처리와 여러 PDF 자동 처리 시작 영역을 보여준다', async () => {
    const container = document.createElement('div');
    root = createRoot(container);

    await act(async () => {
      root?.render(<HomePage />);
    });

    expect(container.textContent).toContain('단일 PDF 처리');
    expect(container.textContent).toContain('여러 PDF 자동 처리');
  });
});
```

**Step 3: Run tests to verify they fail**

Run:

```bash
npx vitest run tests/unit/state/pendingFileStore.test.ts tests/unit/pages/HomePage.test.tsx
```

Expected: FAIL because files do not exist.

**Step 4: Implement pending store**

Create `src/state/pendingFileStore.ts`:

```ts
import { create } from 'zustand';

type State = {
  singleFile: File | null;
  batchFiles: File[];
};

type Actions = {
  setSingleFile(file: File): void;
  consumeSingleFile(): File | null;
  setBatchFiles(files: File[]): void;
  consumeBatchFiles(): File[];
  reset(): void;
};

export const usePendingFileStore = create<State & Actions>((set, get) => ({
  singleFile: null,
  batchFiles: [],
  setSingleFile(file) {
    set({ singleFile: file });
  },
  consumeSingleFile() {
    const file = get().singleFile;
    set({ singleFile: null });
    return file;
  },
  setBatchFiles(files) {
    set({ batchFiles: files });
  },
  consumeBatchFiles() {
    const files = get().batchFiles;
    set({ batchFiles: [] });
    return files;
  },
  reset() {
    set({ singleFile: null, batchFiles: [] });
  },
}));
```

**Step 5: Implement HomePage**

Create `src/pages/HomePage.tsx`.

Requirements:

- Two equal start panels.
- Left accepts one PDF and navigates to `/single`.
- Right accepts multiple PDFs and navigates to `/batch`.
- No recent files or local history.
- Use existing shadcn `Button` and lucide icons.

**Step 6: Consume pending single file**

Modify `src/pages/SinglePage.tsx`:

- On mount, call `consumeSingleFile()`.
- If a file exists, call existing `load(file)`.
- Guard with a ref to avoid React StrictMode double-consume issues.

**Step 7: Wire route**

Modify `src/router.tsx` so index route renders `HomePage`.

**Step 8: Run tests**

Run:

```bash
npx vitest run tests/unit/state/pendingFileStore.test.ts tests/unit/pages/HomePage.test.tsx tests/unit/pages/SinglePage.test.tsx
```

Expected: PASS.

**Step 9: Commit**

```bash
git add src/state/pendingFileStore.ts src/pages/HomePage.tsx src/pages/SinglePage.tsx src/router.tsx tests/unit/state/pendingFileStore.test.ts tests/unit/pages/HomePage.test.tsx
git commit -m "feat(ui): 홈 작업 선택 화면 추가"
```

## Task 5: Batch store와 상태 전이

**Files:**
- Create: `src/state/batchStore.ts`
- Test: `tests/unit/state/batchStore.test.ts`

**Step 1: Write failing tests**

Create `tests/unit/state/batchStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useBatchStore } from '@/state/batchStore';

describe('BatchStore', () => {
  beforeEach(() => useBatchStore.getState().reset());

  it('PDF 파일 여러 개를 queued job 으로 추가한다', () => {
    const files = [
      new File(['a'], 'a.pdf', { type: 'application/pdf' }),
      new File(['b'], 'b.pdf', { type: 'application/pdf' }),
    ];

    useBatchStore.getState().addFiles(files);

    const jobs = useBatchStore.getState().jobs;
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ fileName: 'a.pdf', status: 'queued' });
    expect(jobs[1]).toMatchObject({ fileName: 'b.pdf', status: 'queued' });
  });

  it('상태별 요약 카운트를 계산한다', () => {
    const files = [
      new File(['a'], 'a.pdf', { type: 'application/pdf' }),
      new File(['b'], 'b.pdf', { type: 'application/pdf' }),
      new File(['c'], 'c.pdf', { type: 'application/pdf' }),
    ];
    const store = useBatchStore.getState();
    store.addFiles(files);

    const ids = useBatchStore.getState().jobs.map((job) => job.id);
    store.updateJob(ids[0]!, { status: 'done' });
    store.updateJob(ids[1]!, { status: 'warning' });
    store.updateJob(ids[2]!, { status: 'failed' });

    expect(useBatchStore.getState().getSummary()).toEqual({
      total: 3,
      queued: 0,
      running: 0,
      done: 1,
      warning: 1,
      failed: 1,
      cancelled: 0,
    });
  });

  it('batch 설정 기본값은 OCR 사용, NER 자동 적용 OFF 다', () => {
    expect(useBatchStore.getState().settings).toEqual({
      useOcr: true,
      autoApplyNer: false,
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run tests/unit/state/batchStore.test.ts
```

Expected: FAIL because `batchStore` does not exist.

**Step 3: Implement store**

Create `src/state/batchStore.ts`.

Core types:

```ts
import { create } from 'zustand';
import type { ApplyReport } from '@/types/domain';
import { createId } from '@/utils/id';

export type BatchJobStatus =
  | 'queued'
  | 'opening'
  | 'detecting'
  | 'ocr'
  | 'applying'
  | 'done'
  | 'warning'
  | 'failed'
  | 'cancelled';

export type BatchJob = {
  id: string;
  file: File;
  fileName: string;
  status: BatchJobStatus;
  candidateCount: number;
  enabledBoxCount: number;
  report: ApplyReport | null;
  outputBlob: Blob | null;
  errorMessage: string | null;
  needsReview: boolean;
};

export type BatchSettings = {
  useOcr: boolean;
  autoApplyNer: boolean;
};
```

Actions:

- `addFiles(files: File[]): void`
- `updateJob(id: string, patch: Partial<BatchJob>): void`
- `removeJob(id: string): void`
- `clearCompleted(): void`
- `setSettings(patch: Partial<BatchSettings>): void`
- `getSummary(): BatchSummary`
- `reset(): void`

**Step 4: Run tests**

Run:

```bash
npx vitest run tests/unit/state/batchStore.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/state/batchStore.ts tests/unit/state/batchStore.test.ts
git commit -m "feat(batch): 일괄 처리 큐 상태 추가"
```

## Task 6: Batch 자동 적용 후보 필터

**Files:**
- Create: `src/core/batch/buildAutoApplyBoxes.ts`
- Test: `tests/unit/batch/buildAutoApplyBoxes.test.ts`

**Step 1: Write failing tests**

Create `tests/unit/batch/buildAutoApplyBoxes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildAutoApplyBoxes } from '@/core/batch/buildAutoApplyBoxes';
import type { Candidate } from '@/types/domain';

const base = {
  pageIndex: 0,
  bbox: [0, 0, 10, 10] as const,
  text: 'x',
  category: 'email' as const,
  confidence: 1,
};

describe('buildAutoApplyBoxes', () => {
  it('기본 설정에서는 정규식과 OCR 후보만 자동 적용 박스로 만든다', () => {
    const candidates: Candidate[] = [
      { ...base, id: 'auto-1', source: 'auto' },
      { ...base, id: 'ocr-1', source: 'ocr' },
      { ...base, id: 'ner-1', source: 'ner', category: 'private_person' },
      { ...base, id: 'ocr-ner-1', source: 'ocr-ner', category: 'private_person' },
    ];

    const boxes = buildAutoApplyBoxes(candidates, { autoApplyNer: false });

    expect(boxes.map((box) => box.id).sort()).toEqual(['auto-1', 'ocr-1']);
  });

  it('NER 자동 적용 설정이 켜지면 NER 후보도 포함한다', () => {
    const candidates: Candidate[] = [
      { ...base, id: 'ner-1', source: 'ner', category: 'private_person', confidence: 0.95 },
    ];

    const boxes = buildAutoApplyBoxes(candidates, {
      autoApplyNer: true,
      nerThreshold: 0.7,
    });

    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({ id: 'ner-1', enabled: true });
  });
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run tests/unit/batch/buildAutoApplyBoxes.test.ts
```

Expected: FAIL because helper does not exist.

**Step 3: Implement helper**

Create `src/core/batch/buildAutoApplyBoxes.ts`:

```ts
import type { Candidate, RedactionBox } from '@/types/domain';

type Options = {
  autoApplyNer: boolean;
  nerThreshold?: number;
};

export function buildAutoApplyBoxes(
  candidates: Candidate[],
  options: Options,
): RedactionBox[] {
  return candidates
    .filter((candidate) => {
      if (candidate.source === 'auto' || candidate.source === 'ocr') return true;
      if (!options.autoApplyNer) return false;
      const threshold = options.nerThreshold ?? 0.7;
      return (
        (candidate.source === 'ner' || candidate.source === 'ocr-ner') &&
        candidate.confidence >= threshold
      );
    })
    .map((candidate) => ({
      id: candidate.id,
      pageIndex: candidate.pageIndex,
      bbox: candidate.bbox,
      source: candidate.source,
      category: candidate.category,
      enabled: true,
    }));
}
```

**Step 4: Run tests**

Run:

```bash
npx vitest run tests/unit/batch/buildAutoApplyBoxes.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/batch/buildAutoApplyBoxes.ts tests/unit/batch/buildAutoApplyBoxes.test.ts
git commit -m "feat(batch): 자동 적용 후보 필터 추가"
```

## Task 7: Batch runner 순차 처리

**Files:**
- Create: `src/core/batch/runBatchJob.ts`
- Create: `src/hooks/useBatchRunner.ts`
- Test: `tests/unit/batch/runBatchJob.test.ts`
- Test: `tests/unit/useBatchRunner.test.tsx`

**Step 1: Write runBatchJob tests**

Create `tests/unit/batch/runBatchJob.test.ts`.

Test cases:

- `detectAll` 결과만으로 apply를 호출한다.
- `postCheckLeaks > 0`이면 result status를 `warning`으로 반환한다.
- 한 job의 실패는 Error result로 반환하고 throw를 바깥으로 새지 않게 한다.

Use a fake API object matching `PdfWorkerApi` subset:

```ts
const fakePdf = {
  open: vi.fn(),
  detectAll: vi.fn(),
  apply: vi.fn(),
  close: vi.fn(),
};
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/unit/batch/runBatchJob.test.ts
```

Expected: FAIL because runner does not exist.

**Step 3: Implement minimal non-OCR runner first**

Create `src/core/batch/runBatchJob.ts`.

Inputs:

```ts
import type { PdfWorkerApi } from '@/workers/pdf.worker.types';
import type { BatchSettings } from '@/state/batchStore';

export type BatchJobRunInput = {
  file: File;
  settings: BatchSettings;
  pdf: Pick<PdfWorkerApi, 'open' | 'detectAll' | 'apply' | 'close'>;
};
```

Implementation rules:

- Convert `File` to `ArrayBuffer` using `fileToArrayBuffer`.
- `await pdf.open(buffer)`.
- Loop all `pages` and call `detectAll(page.index)`.
- Build boxes with `buildAutoApplyBoxes`.
- If no boxes, return `warning` with a readable message.
- Call `pdf.apply(boxes)`.
- Convert returned `Uint8Array` to `Blob`.
- If `report.postCheckLeaks > 0`, return status `warning`; else `done`.
- Always call `pdf.close()` in `finally`.

**Step 4: Add OCR path in a second test**

Add test:

- when `settings.useOcr` is true and page profile says OCR is needed, runner calls injected OCR page detector and merges OCR candidates.

Keep OCR dependency injectable to avoid worker-heavy tests:

```ts
ocrDetectPage?: (pageIndex: number) => Promise<Candidate[]>;
```

**Step 5: Implement OCR injection**

Update `runBatchJob` to accept optional `ocrDetectPage`. This task should not duplicate the full `useOcrDetect` hook. Production wiring can provide an OCR detector function; unit tests use a fake.

**Step 6: Write useBatchRunner test**

Create `tests/unit/useBatchRunner.test.tsx`.

Test:

- Given two queued jobs and fake `runBatchJob`, the hook processes jobs in order.
- First failure marks failed, second still runs.

Mock `runBatchJob` and `getPdfWorker`.

**Step 7: Implement hook**

Create `src/hooks/useBatchRunner.ts`.

API:

```ts
export function useBatchRunner(): {
  running: boolean;
  start(): void;
  pause(): void;
}
```

Rules:

- Use a ref for cancellation.
- Pick first `queued` job.
- Update status: `opening` → `detecting` → `applying` can be coarse in v1 if runner returns final result only.
- Process sequentially.
- Do not prompt for passwords in batch. Password errors become failed jobs.

**Step 8: Run tests**

Run:

```bash
npx vitest run tests/unit/batch/runBatchJob.test.ts tests/unit/useBatchRunner.test.tsx
```

Expected: PASS.

**Step 9: Commit**

```bash
git add src/core/batch/runBatchJob.ts src/hooks/useBatchRunner.ts tests/unit/batch/runBatchJob.test.ts tests/unit/useBatchRunner.test.tsx
git commit -m "feat(batch): 일괄 자동 처리 runner 추가"
```

## Task 8: BatchPage UI

**Files:**
- Create: `src/pages/BatchPage.tsx`
- Create: `src/components/batch/BatchDropZone.tsx`
- Create: `src/components/batch/BatchToolbar.tsx`
- Create: `src/components/batch/BatchSettings.tsx`
- Create: `src/components/batch/BatchSummary.tsx`
- Create: `src/components/batch/BatchJobTable.tsx`
- Modify: `src/router.tsx`
- Test: `tests/unit/pages/BatchPage.test.tsx`

**Step 1: Write failing render test**

Create `tests/unit/pages/BatchPage.test.tsx`:

```tsx
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchPage } from '@/pages/BatchPage';
import { useBatchStore } from '@/state/batchStore';

vi.mock('@/hooks/useBatchRunner', () => ({
  useBatchRunner: () => ({
    running: false,
    start: vi.fn(),
    pause: vi.fn(),
  }),
}));

describe('BatchPage', () => {
  let root: Root | null = null;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useBatchStore.getState().reset();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    root = null;
    useBatchStore.getState().reset();
  });

  it('일괄 처리 액션과 설정을 보여준다', async () => {
    const container = document.createElement('div');
    root = createRoot(container);

    await act(async () => {
      root?.render(<BatchPage />);
    });

    expect(container.textContent).toContain('PDF 추가');
    expect(container.textContent).toContain('처리 시작');
    expect(container.textContent).toContain('OCR 사용');
    expect(container.textContent).toContain('NER 후보도 자동 적용');
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/unit/pages/BatchPage.test.tsx
```

Expected: FAIL because `BatchPage` does not exist.

**Step 3: Implement UI components**

Implement:

- `BatchDropZone`: `multiple` PDF input and drag/drop.
- `BatchToolbar`: PDF 추가, 처리 시작, 일시정지, 성공 파일 저장, 목록 비우기.
- `BatchSettings`: OCR checkbox default ON, NER auto-apply checkbox default OFF.
- `BatchSummary`: total/done/warning/failed/running counts.
- `BatchJobTable`: file name, status, candidate count, apply result, verification, actions.

Do not implement ZIP in v1. For `성공 파일 저장`, download successful output blobs one by one with existing `downloadBlob`.

**Step 4: Consume pending batch files**

Modify `BatchPage`:

- On mount, consume `usePendingFileStore.getState().consumeBatchFiles()`.
- Add them to `useBatchStore`.
- Use a ref to avoid StrictMode double consumption.

**Step 5: Wire route**

Modify `src/router.tsx` so `/batch` renders `BatchPage`.

**Step 6: Run test**

Run:

```bash
npx vitest run tests/unit/pages/BatchPage.test.tsx tests/unit/state/batchStore.test.ts
```

Expected: PASS.

**Step 7: Commit**

```bash
git add src/pages/BatchPage.tsx src/components/batch src/router.tsx tests/unit/pages/BatchPage.test.tsx
git commit -m "feat(batch): 일괄 처리 큐 화면 추가"
```

## Task 9: Batch 상세 검수 화면

**Files:**
- Create: `src/pages/BatchJobPage.tsx`
- Modify: `src/router.tsx`
- Modify: `src/hooks/useApply.ts`
- Test: `tests/unit/pages/BatchJobPage.test.tsx`

**Step 1: Write failing route/detail test**

Create `tests/unit/pages/BatchJobPage.test.tsx`.

Test:

- If job exists, page shows file name and `일괄 목록`.
- If job does not exist, page shows a not-found message.

**Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/unit/pages/BatchJobPage.test.tsx
```

Expected: FAIL because page does not exist.

**Step 3: Refactor apply hook for reuse**

Current `useApply` immediately downloads and resets. Batch detail needs “apply and write result back to job”.

Modify `src/hooks/useApply.ts`:

- Extract a pure async helper:

```ts
export async function applyCurrentDocument(): Promise<{
  blob: Blob;
  report: ApplyReport;
  sourceFileName: string;
}> {
  // Existing getState, enabled boxes, getPdfWorker().apply, Blob conversion.
  // Do not download and do not reset here.
}
```

- Keep `useApply().apply()` as the single-page behavior:
  - call `applyCurrentDocument`
  - download
  - reset
  - set apply result

Add tests if current `useApply` has no coverage. At minimum run existing integration tests after this task.

**Step 4: Implement BatchJobPage**

Behavior:

- Read `jobId` from route params.
- Load job file into existing single document store on first mount.
- Render the same editor layout as `SinglePage`, but with a compact job header:
  - `일괄 목록`
  - file name
  - warning/error summary
  - `다시 적용`
- On `다시 적용`, call `applyCurrentDocument`, update the batch job with blob/report/status.

**Step 5: Wire route**

Modify `src/router.tsx` so `/batch/$jobId` renders `BatchJobPage`.

**Step 6: Run tests**

Run:

```bash
npx vitest run tests/unit/pages/BatchJobPage.test.tsx tests/unit/pages/SinglePage.test.tsx
```

Expected: PASS.

**Step 7: Commit**

```bash
git add src/pages/BatchJobPage.tsx src/router.tsx src/hooks/useApply.ts tests/unit/pages/BatchJobPage.test.tsx
git commit -m "feat(batch): 파일별 검수 상세 화면 추가"
```

## Task 10: 통합 검증과 문서 업데이트

**Files:**
- Modify: `README.md`
- Modify: `docs/release-checklist.md`
- Optional Test: `tests/integration/router-flow.test.tsx`

**Step 1: Update README**

Update:

- 사용 방법에 홈, 단일 처리, 일괄 처리 설명 추가.
- 프로젝트 구조에 `router.tsx`, `pages/`, `components/batch/`, `batchStore.ts` 추가.
- batch 자동 적용 기본 정책을 명시한다.

**Step 2: Update release checklist**

Add manual checks:

- `/` 홈에서 단일 PDF 선택 후 `/single` 처리.
- `/` 홈에서 여러 PDF 선택 후 `/batch` 큐 추가.
- batch 성공 파일 저장.
- post-check warning 파일에서 `/batch/$jobId` 상세 검수 진입.

**Step 3: Run full verification**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all pass, and `postbuild` external URL verification passes.

**Step 4: Commit**

```bash
git add README.md docs/release-checklist.md
git commit -m "docs: 라우팅과 일괄 처리 사용법 업데이트"
```

## Execution Notes

- 구현 중 새 UI는 기존 라이트 테마와 shadcn token을 따른다.
- 큰 의존성은 TanStack Router 외에 추가하지 않는다. ZIP 저장은 후속 과제로 둔다.
- batch password prompt는 자동 처리 큐를 막지 않도록 v1에서 띄우지 않는다.
- batch OCR 실패는 전체 실패가 아니라 warning으로 남긴다.
- final verification 전에는 성공 주장을 하지 않는다.

