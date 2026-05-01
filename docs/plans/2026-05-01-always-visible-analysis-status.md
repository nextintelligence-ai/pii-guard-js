# Always Visible Analysis Status Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Always show NER analysis status and OCR status in the single-page sidebar, including idle states before analysis starts.

**Architecture:** Keep `SinglePage` mounting `NerRuntime` and `OcrStatus` in the existing location. Change `NerProgress` and `OcrStatus` so they render idle/model states instead of returning `null` when no work has started.

**Tech Stack:** React 19, TypeScript, Zustand, existing UI badges/icons, Vitest with jsdom.

---

### Task 1: Make OCR Status Visible Before OCR Starts

**Files:**
- Modify: `tests/unit/components/OcrStatus.test.tsx`
- Modify: `src/components/OcrStatus.tsx`

**Step 1: Write the failing test**

Change the idle OCR test to expect `OCR 대기` instead of an empty render.

**Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/components/OcrStatus.test.tsx`

Expected: FAIL because `OcrStatus` currently returns `null` when `total === 0`.

**Step 3: Implement idle OCR rendering**

Render the same compact status box for idle OCR and show `OCR 대기`.

**Step 4: Run focused test**

Run: `npx vitest run tests/unit/components/OcrStatus.test.tsx`

Expected: PASS.

### Task 2: Make NER Status Always Visible

**Files:**
- Create: `tests/unit/components/NerProgress.test.tsx`
- Modify: `src/components/NerProgress.tsx`

**Step 1: Write failing tests**

Cover:
- `idle` model state renders `NER 모델 미로드`.
- `ready` model state with `total === 0` renders `NER 분석 대기`.
- active progress still renders `NER 분석 중`.
- completed progress still renders `NER 분석 완료`.

**Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/components/NerProgress.test.tsx`

Expected: FAIL because `NerProgress` returns `null` for `total === 0`.

**Step 3: Implement NER status rendering**

Read `useNerModel().state` in `NerProgress` and render a compact status line for model idle/loading/error/unsupported states. Preserve existing active and complete progress labels.

**Step 4: Run related tests and typecheck**

Run:
- `npx vitest run tests/unit/components/NerProgress.test.tsx tests/unit/components/OcrStatus.test.tsx`
- `npm run lint`

Expected: PASS.
