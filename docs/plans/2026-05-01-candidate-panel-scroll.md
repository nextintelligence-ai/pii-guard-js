# Candidate Panel Scroll Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the `자동으로 찾은 개인정보` list scroll inside the single-page sidebar without pushing `직접 마스크한 영역` out of view.

**Architecture:** `SinglePage` gives the left sidebar content a constrained flex column. `CandidatePanel` fills the remaining sidebar height, keeps the automatic-candidate header fixed, and wraps only the automatic candidate list in the existing `ScrollArea` primitive. Manual masks remain outside that scroll area.

**Tech Stack:** React 19, TypeScript, Radix ScrollArea wrapper, Tailwind CSS, Zustand, Vitest with jsdom.

---

### Task 1: Add CandidatePanel Scroll Structure Test

**Files:**
- Modify: `tests/unit/components/CandidatePanel.test.tsx`
- Modify: `src/components/CandidatePanel.tsx`

**Step 1: Write the failing test**

Assert that `CandidatePanel` renders an element labeled `자동 개인정보 목록`, that this element has scroll/flex sizing classes, and that `직접 마스크한 영역` is outside this scroll element.

**Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/components/CandidatePanel.test.tsx`

Expected: FAIL because the panel does not currently render a dedicated automatic-candidate scroll area.

**Step 3: Implement the scroll container**

Import `ScrollArea`. Change the root to a constrained flex column. Make the automatic section `flex-1 min-h-0`, move category groups into `ScrollArea aria-label="자동 개인정보 목록"`, and keep the manual section as `shrink-0`.

**Step 4: Run the focused test**

Run: `npx vitest run tests/unit/components/CandidatePanel.test.tsx`

Expected: PASS.

### Task 2: Constrain SinglePage Sidebar Content

**Files:**
- Modify: `tests/unit/pages/SinglePage.test.tsx`
- Modify: `src/pages/SinglePage.tsx`

**Step 1: Write the failing test**

Render a ready document and assert the sidebar body uses a full-height flex column that can give `CandidatePanel` a real height constraint.

**Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/pages/SinglePage.test.tsx`

Expected: FAIL because the current sidebar content wrapper is a plain padded block.

**Step 3: Implement the layout constraint**

Change the ready-state sidebar content wrapper from a normal block to `flex h-full min-h-0 flex-col p-3`. Wrap `CandidatePanel` in `div className="min-h-0 flex-1"`.

**Step 4: Run focused tests and typecheck**

Run:
- `npx vitest run tests/unit/components/CandidatePanel.test.tsx tests/unit/pages/SinglePage.test.tsx`
- `npm run lint`

Expected: PASS.
