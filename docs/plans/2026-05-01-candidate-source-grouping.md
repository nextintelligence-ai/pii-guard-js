# Candidate Source Grouping Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show each detected privacy category once and nest detection sources below it, while moving the NER confidence control next to the loaded NER model button.

**Architecture:** `CandidatePanel` groups detected boxes by privacy category and renders source sections inside each category. `NerLoadButton` owns the inline NER confidence slider because the threshold is a model setting, not a candidate-list section. Existing Zustand store state and actions remain unchanged.

**Tech Stack:** React 19, TypeScript, Zustand, existing shadcn-style UI primitives, Vitest with jsdom.

---

### Task 1: Cover Category-Level Source Grouping

**Files:**
- Modify: `tests/unit/components/CandidatePanel.test.tsx`
- Modify: `src/components/CandidatePanel.tsx`

**Step 1: Write the failing test**

Add a test with one `auto` phone box and one `ocr` phone box. Assert that `전화번호` appears once, while `정규식` and `OCR` appear as source sections beneath that single category.

**Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/components/CandidatePanel.test.tsx`

Expected: FAIL because the current panel renders separate `전화번호` category rows for regex and OCR.

**Step 3: Implement the grouping**

Change `CandidatePanel` so each privacy category renders once. Pass grouped source sections into the category component, and move page/box rows into a nested source section renderer.

**Step 4: Run the focused test**

Run: `npx vitest run tests/unit/components/CandidatePanel.test.tsx`

Expected: PASS.

### Task 2: Move NER Threshold to the NER Load Control

**Files:**
- Modify: `tests/unit/components/CandidatePanel.test.tsx`
- Create: `tests/unit/components/NerLoadButton.test.tsx`
- Modify: `src/components/CandidatePanel.tsx`
- Modify: `src/components/NerLoadButton.tsx`

**Step 1: Write failing tests**

Add a candidate panel assertion that `NER 신뢰도` is not rendered in the candidate list. Add a `NerLoadButton` test that puts `useNerModelStore` in `ready` state and asserts the button shows `NER 로드됨`, the threshold text, and the slider.

**Step 2: Run the tests to verify failure**

Run: `npx vitest run tests/unit/components/CandidatePanel.test.tsx tests/unit/components/NerLoadButton.test.tsx`

Expected: FAIL because the threshold currently lives in `CandidatePanel` and `NerLoadButton` only renders the load button.

**Step 3: Implement the move**

Remove the threshold slider from `CandidatePanel`. In `NerLoadButton`, read `nerThreshold` and `setNerThreshold` from `useAppStore`; when the NER model state is `ready`, render a compact inline slider next to `NER 로드됨`.

**Step 4: Run focused tests**

Run: `npx vitest run tests/unit/components/CandidatePanel.test.tsx tests/unit/components/NerLoadButton.test.tsx`

Expected: PASS.

### Task 3: Verify Toolbar and Types

**Files:**
- Check: `src/components/Toolbar.tsx`
- Check: `tests/unit/components/Toolbar.test.tsx`

**Step 1: Run related component tests**

Run: `npx vitest run tests/unit/components/CandidatePanel.test.tsx tests/unit/components/NerLoadButton.test.tsx tests/unit/components/Toolbar.test.tsx`

Expected: PASS.

**Step 2: Run type checking**

Run: `npm run lint`

Expected: PASS.
