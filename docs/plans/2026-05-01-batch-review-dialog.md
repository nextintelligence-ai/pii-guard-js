# Batch Review Dialog Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Open batch job review in a large dialog from `/batch` instead of navigating away to `/batch/$jobId`.

**Architecture:** `BatchPage` owns selected review state and renders a new `BatchReviewDialog`. `BatchJobTable` becomes presentation-only by receiving an `onReview(jobId)` callback. The dialog loads the selected job into the existing single-document editing store and reuses `SinglePage` in an embedded mode that hides single-file open/apply actions while keeping OCR, undo/redo, NER, canvas, and candidate review behavior.

**Tech Stack:** React 19, TypeScript, TanStack Router fallback route, Radix Dialog wrapper, Zustand stores, Vitest with jsdom.

---

### Task 1: Make BatchJobTable Open Review via Callback

**Files:**
- Modify: `src/components/batch/BatchJobTable.tsx`
- Test: `tests/unit/components/BatchJobTable.test.tsx`

**Step 1: Write the failing test**

Add a test that renders one reviewable job and asserts clicking `검수` calls `onReview` with the job id.

```tsx
it('calls onReview when the review button is clicked', async () => {
  const onReview = vi.fn();
  const container = document.createElement('div');
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <BatchJobTable jobs={[createJob({ id: 'job-review', status: 'warning' })]} onReview={onReview} />,
    );
  });

  const button = Array.from(container.querySelectorAll('button')).find(
    (item) => item.textContent?.includes('검수') === true,
  );
  expect(button).toBeDefined();

  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(onReview).toHaveBeenCalledWith('job-review');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/BatchJobTable.test.tsx`

Expected: FAIL because `BatchJobTable` does not accept `onReview` yet.

**Step 3: Update BatchJobTable props**

Change props:

```tsx
type Props = {
  jobs: BatchJob[];
  onReview(jobId: string): void;
};
```

Remove the local `openJob()` router function. Change the review button:

```tsx
onClick={() => onReview(job.id)}
```

**Step 4: Run focused test**

Run: `npx vitest run tests/unit/components/BatchJobTable.test.tsx`

Expected: PASS.

### Task 2: Add Embedded SinglePage Mode

**Files:**
- Modify: `src/components/Toolbar.tsx`
- Modify: `src/pages/SinglePage.tsx`
- Test: `tests/unit/pages/SinglePage.test.tsx`
- Test: `tests/unit/components/Toolbar.test.tsx`

**Step 1: Write failing tests**

Add a `SinglePage` test that renders `<SinglePage embedded />` and asserts:

- `PDF 열기` is not visible.
- `익명화 적용` is not visible.
- OCR controls can still exist by accessible label.

Add a `Toolbar` test for the same behavior if direct prop coverage is clearer.

**Step 2: Run tests to verify failure**

Run: `npx vitest run tests/unit/pages/SinglePage.test.tsx tests/unit/components/Toolbar.test.tsx`

Expected: FAIL because `embedded` and toolbar visibility props do not exist.

**Step 3: Add toolbar visibility props**

Change `Toolbar` props:

```tsx
type Props = {
  onLoad(f: File): void;
  onApply(): void;
  onHelp(): void;
  showFileOpen?: boolean;
  showApply?: boolean;
};
```

Default both optional props to `true`. Render the file input and `PDF 열기` button only when `showFileOpen` is true. Render the destructive apply button only when `showApply` is true.

**Step 4: Add SinglePage embedded prop**

Change `SinglePage`:

```tsx
type Props = {
  embedded?: boolean;
};

export function SinglePage({ embedded = false }: Props) {
```

Pass toolbar options:

```tsx
<Toolbar
  onLoad={load}
  onApply={apply}
  onHelp={openHelp}
  showFileOpen={!embedded}
  showApply={!embedded}
/>
```

Keep the rest of `SinglePage` behavior unchanged.

**Step 5: Run focused tests**

Run: `npx vitest run tests/unit/pages/SinglePage.test.tsx tests/unit/components/Toolbar.test.tsx`

Expected: PASS.

### Task 3: Create BatchReviewDialog

**Files:**
- Create: `src/components/batch/BatchReviewDialog.tsx`
- Test: `tests/unit/components/BatchReviewDialog.test.tsx`

**Step 1: Write failing test**

Mock `usePdfDocument`, `SinglePage`, and `applyCurrentDocument`. Render `BatchReviewDialog` with an existing job and assert:

- The selected file name appears.
- The mocked embedded editor appears.
- `load(job.file)` is called when the dialog opens.

**Step 2: Run test to verify failure**

Run: `npx vitest run tests/unit/components/BatchReviewDialog.test.tsx`

Expected: FAIL because `BatchReviewDialog` does not exist.

**Step 3: Implement dialog skeleton**

Use the existing dialog components:

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="flex h-[calc(100vh-32px)] max-w-[calc(100vw-32px)] flex-col gap-0 p-0">
    ...
  </DialogContent>
</Dialog>
```

Props:

```tsx
type Props = {
  jobId: string | null;
  open: boolean;
  onOpenChange(open: boolean): void;
};
```

Find the job from `useBatchStore`. If missing, render the not-found message in the dialog.

**Step 4: Load selected job**

Use `usePdfDocument().load`. Load only when `open` is true and the selected `job.id` changes. Reset the loaded id when the dialog closes so reopening reloads the file.

**Step 5: Add reapply action**

Move the `다시 적용` logic from `BatchJobPage` into a local handler:

```tsx
const doc = useAppStore.getState().doc;
const { blob, report } = await applyCurrentDocument();
updateJob(job.id, {
  status: report.postCheckLeaks > 0 ? 'warning' : 'done',
  candidateCount: useAppStore.getState().candidates.length,
  enabledBoxCount: Object.values(useAppStore.getState().boxes).filter((box) => box.enabled).length,
  report,
  outputBlob: blob,
  errorMessage: report.postCheckLeaks > 0 ? `검증 누수 ${report.postCheckLeaks}건` : null,
  needsReview: report.postCheckLeaks > 0,
});
if (doc.kind === 'ready') useAppStore.getState().setDoc(doc);
```

On error, update the job to `failed` and restore the ready document as the current `BatchJobPage` does.

**Step 6: Render embedded editor**

Render:

```tsx
<SinglePage embedded />
```

inside a `min-h-0 flex-1 overflow-hidden` container.

**Step 7: Run focused test**

Run: `npx vitest run tests/unit/components/BatchReviewDialog.test.tsx`

Expected: PASS.

### Task 4: Wire Dialog into BatchPage

**Files:**
- Modify: `src/pages/BatchPage.tsx`
- Test: `tests/unit/pages/BatchPage.test.tsx`

**Step 1: Write failing test**

In `BatchPage.test.tsx`, add a job to `useBatchStore`, render `BatchPage`, click `검수`, and assert the dialog content includes the job file name or mocked dialog marker.

**Step 2: Run test to verify failure**

Run: `npx vitest run tests/unit/pages/BatchPage.test.tsx`

Expected: FAIL because `BatchPage` does not pass `onReview` or render the dialog.

**Step 3: Add review state**

In `BatchPage`:

```tsx
const [reviewJobId, setReviewJobId] = useState<string | null>(null);
```

Pass:

```tsx
<BatchJobTable jobs={jobs} onReview={setReviewJobId} />
```

Render:

```tsx
<BatchReviewDialog
  jobId={reviewJobId}
  open={reviewJobId !== null}
  onOpenChange={(open) => {
    if (!open) setReviewJobId(null);
  }}
/>
```

**Step 4: Run focused test**

Run: `npx vitest run tests/unit/pages/BatchPage.test.tsx`

Expected: PASS.

### Task 5: Keep Fallback Route Passing

**Files:**
- Test: `tests/unit/pages/BatchJobPage.test.tsx`
- Test: `tests/unit/router.test.tsx`

**Step 1: Run fallback route tests**

Run: `npx vitest run tests/unit/pages/BatchJobPage.test.tsx tests/unit/router.test.tsx`

Expected: PASS. The `/batch/$jobId` route remains available.

**Step 2: Fix only if broken**

If route tests fail due to shared prop changes, update mocks or component props without removing the route.

### Task 6: Final Verification

**Files:**
- All modified files above.

**Step 1: Run related tests**

Run:

```bash
npx vitest run \
  tests/unit/components/BatchJobTable.test.tsx \
  tests/unit/components/BatchReviewDialog.test.tsx \
  tests/unit/pages/BatchPage.test.tsx \
  tests/unit/pages/BatchJobPage.test.tsx \
  tests/unit/pages/SinglePage.test.tsx \
  tests/unit/components/Toolbar.test.tsx \
  tests/unit/useBatchRunner.test.tsx
```

Expected: PASS.

**Step 2: Run type check**

Run: `npm run lint`

Expected: PASS with no TypeScript errors.

**Step 3: Run full tests before completion**

Run: `npm run test`

Expected: PASS with the existing skipped real-model test unchanged.

**Step 4: Review diff**

Run: `git diff -- src tests docs/plans/2026-05-01-batch-review-dialog.md`

Expected: Changes are limited to dialog review wiring, embedded toolbar support, tests, and this plan.
