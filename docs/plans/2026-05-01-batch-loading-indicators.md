# Batch Loading Indicators Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show clear loading feedback for running batch rows without adding detailed progress calculation.

**Architecture:** Keep the change in `BatchJobTable` because the existing `BatchJobStatus` values already describe the active processing stage. Add small pure helpers for running-state detection and loading copy, then render a spinner and secondary row text only for active statuses.

**Tech Stack:** React 19, TypeScript, Zustand batch state, lucide-react icons, Vitest with jsdom.

---

### Task 1: Add Batch Table Loading UI

**Files:**
- Modify: `src/components/batch/BatchJobTable.tsx`

**Step 1: Write the failing test**

Create `tests/unit/components/BatchJobTable.test.tsx` with a test that renders a detecting job and expects `개인정보 후보 탐지 중...` plus an accessible loading indicator.

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/BatchJobTable.test.tsx`

Expected: FAIL because `BatchJobTable.test.tsx` does not exist or the loading text is not rendered.

**Step 3: Implement minimal UI**

In `BatchJobTable.tsx`:

```tsx
import { Download, Loader2, Search } from 'lucide-react';
```

Add helpers:

```tsx
const RUNNING_STATUS_MESSAGES: Partial<Record<BatchJobStatus, string>> = {
  opening: 'PDF 여는 중...',
  detecting: '개인정보 후보 탐지 중...',
  ocr: 'OCR 처리 중...',
  applying: '비식별 적용 중...',
};

function getRunningMessage(status: BatchJobStatus): string | undefined {
  return RUNNING_STATUS_MESSAGES[status];
}
```

Render the filename cell as a column with the optional message:

```tsx
<span className="min-w-0 pr-3">
  <span className="block truncate">{job.fileName}</span>
  {runningMessage && (
    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
      {runningMessage}
    </span>
  )}
</span>
```

Render a spinner next to active status labels:

```tsx
<Badge variant={job.status === 'failed' ? 'destructive' : 'outline'} className="gap-1.5">
  {runningMessage && (
    <Loader2
      className="h-3 w-3 animate-spin"
      aria-label="처리 중"
      role="img"
    />
  )}
  {STATUS_LABELS[job.status]}
</Badge>
```

**Step 4: Run focused test**

Run: `npx vitest run tests/unit/components/BatchJobTable.test.tsx`

Expected: PASS.

### Task 2: Verify Existing Batch Behavior

**Files:**
- Test: `tests/unit/components/BatchJobTable.test.tsx`
- Test: `tests/unit/useBatchRunner.test.tsx`

**Step 1: Run related tests**

Run: `npx vitest run tests/unit/components/BatchJobTable.test.tsx tests/unit/useBatchRunner.test.tsx`

Expected: PASS.

**Step 2: Run type/build verification**

Run: `npm run lint`

Expected: PASS with no TypeScript errors.

**Step 3: Review diff**

Run: `git diff -- src/components/batch/BatchJobTable.tsx tests/unit/components/BatchJobTable.test.tsx`

Expected: Diff only contains the loading indicator UI and focused component tests.
