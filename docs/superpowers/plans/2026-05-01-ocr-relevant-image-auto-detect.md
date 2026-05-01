# OCR Relevant Image Auto-Detect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically run the existing page-level OCR pipeline when a PDF page has a meaningful embedded image, even if the text layer is otherwise sufficient.

**Architecture:** Keep the OCR pipeline unchanged and centralize the broader auto-target policy in `buildPageContentProfile`. Add `hasOcrRelevantImage` to the profile so single-page and batch flows continue to consume one `shouldAutoOcr` decision.

**Tech Stack:** TypeScript, React hooks, Zustand, Vitest, MuPDF page inspection, PaddleOCR worker.

---

## File Structure

- Modify `src/core/pageContentProfile.ts`
  - Add constants for OCR-relevant image thresholds.
  - Add `hasOcrRelevantImage` to `PageContentProfile`.
  - Calculate `shouldAutoOcr` from text emptiness, existing large-image policy, and the new OCR-relevant-image policy.
- Modify `tests/unit/pageContentProfile.test.ts`
  - Add pure policy tests for area ratio and pixel-area thresholds.
  - Assert the new field in existing cases.
- Modify `tests/integration/ocr-flow.test.tsx`
  - Add a hook regression proving text-rich pages with OCR-relevant images call `renderPagePng`.
  - Add `hasOcrRelevantImage` to page profile fixtures touched by the test file.
- Modify `tests/unit/batch/runBatchJob.test.ts`
  - Add a batch regression proving batch OCR uses the same profile decision for text-rich pages with OCR-relevant images.
  - Add `hasOcrRelevantImage` to page profile fixtures touched by the test file.

---

### Task 1: Add Pure Policy Tests

**Files:**
- Modify: `tests/unit/pageContentProfile.test.ts`

- [ ] **Step 1: Add assertions for the new field in existing tests**

In `tests/unit/pageContentProfile.test.ts`, update the three existing tests:

```ts
expect(profile.hasLargeImage).toBe(true);
expect(profile.hasOcrRelevantImage).toBe(true);
expect(profile.shouldAutoOcr).toBe(true);
```

```ts
expect(profile.hasLargeImage).toBe(false);
expect(profile.hasOcrRelevantImage).toBe(false);
expect(profile.shouldAutoOcr).toBe(false);
```

```ts
expect(profile.hasLargeImage).toBe(false);
expect(profile.hasOcrRelevantImage).toBe(false);
expect(profile.shouldAutoOcr).toBe(true);
```

- [ ] **Step 2: Add area-ratio threshold test**

Append this test inside the existing `describe('buildPageContentProfile', ...)` block:

```ts
it('marks a text-rich page as OCR target when an image covers at least 5 percent of the page', () => {
  const profile = buildPageContentProfile({
    pageIndex: 0,
    pageWidthPt: 200,
    pageHeightPt: 100,
    textCharCount: 500,
    textLineCount: 20,
    textBboxes: [[10, 10, 190, 90]],
    imageBlocks: [{ bbox: [0, 0, 50, 20], widthPx: 120, heightPx: 80 }],
  });

  expect(profile.hasLargeImage).toBe(false);
  expect(profile.hasOcrRelevantImage).toBe(true);
  expect(profile.shouldAutoOcr).toBe(true);
  expect(profile.imageBlocks[0]?.areaRatio).toBeCloseTo(0.05);
});
```

- [ ] **Step 3: Add pixel-area threshold test**

Append this test inside the same `describe` block:

```ts
it('marks a text-rich page as OCR target when an image has at least 80000 pixels', () => {
  const profile = buildPageContentProfile({
    pageIndex: 0,
    pageWidthPt: 200,
    pageHeightPt: 100,
    textCharCount: 500,
    textLineCount: 20,
    textBboxes: [[10, 10, 190, 90]],
    imageBlocks: [{ bbox: [5, 5, 25, 25], widthPx: 400, heightPx: 200 }],
  });

  expect(profile.hasLargeImage).toBe(false);
  expect(profile.hasOcrRelevantImage).toBe(true);
  expect(profile.shouldAutoOcr).toBe(true);
  expect(profile.imageBlocks[0]?.areaRatio).toBeCloseTo(0.02);
});
```

- [ ] **Step 4: Run the focused test and verify it fails**

Run:

```bash
npm test -- tests/unit/pageContentProfile.test.ts
```

Expected: FAIL because `hasOcrRelevantImage` is not part of `PageContentProfile` yet.

---

### Task 2: Implement OCR-Relevant Image Policy

**Files:**
- Modify: `src/core/pageContentProfile.ts`
- Test: `tests/unit/pageContentProfile.test.ts`

- [ ] **Step 1: Add constants and type field**

In `src/core/pageContentProfile.ts`, add the constants next to the existing OCR thresholds:

```ts
const LARGE_IMAGE_AREA_RATIO = 0.25;
const LARGE_IMAGE_MIN_PIXELS = 250_000;
const OCR_RELEVANT_IMAGE_AREA_RATIO = 0.05;
const OCR_RELEVANT_IMAGE_MIN_PIXELS = 80_000;
const LOW_TEXT_CHAR_COUNT = 40;
```

Then add the field to `PageContentProfile`:

```ts
export type PageContentProfile = {
  pageIndex: number;
  pageAreaPt: number;
  textCharCount: number;
  textLineCount: number;
  textAreaRatio: number;
  imageAreaRatio: number;
  imageBlocks: Array<PageImageBlock & { areaRatio: number }>;
  hasLargeImage: boolean;
  hasOcrRelevantImage: boolean;
  shouldAutoOcr: boolean;
};
```

- [ ] **Step 2: Calculate the new policy field**

In `buildPageContentProfile`, replace the `hasLargeImage` and `shouldAutoOcr` calculation with:

```ts
const hasLargeImage = imageBlocks.some(
  (block) =>
    block.areaRatio >= LARGE_IMAGE_AREA_RATIO ||
    block.widthPx * block.heightPx >= LARGE_IMAGE_MIN_PIXELS,
);
const hasOcrRelevantImage = imageBlocks.some(
  (block) =>
    block.areaRatio >= OCR_RELEVANT_IMAGE_AREA_RATIO ||
    block.widthPx * block.heightPx >= OCR_RELEVANT_IMAGE_MIN_PIXELS,
);
const shouldAutoOcr =
  input.textCharCount === 0 ||
  (input.textCharCount < LOW_TEXT_CHAR_COUNT && hasLargeImage) ||
  hasLargeImage ||
  hasOcrRelevantImage;
```

Return the new field:

```ts
return {
  pageIndex: input.pageIndex,
  pageAreaPt,
  textCharCount: input.textCharCount,
  textLineCount: input.textLineCount,
  textAreaRatio,
  imageAreaRatio,
  imageBlocks,
  hasLargeImage,
  hasOcrRelevantImage,
  shouldAutoOcr,
};
```

- [ ] **Step 3: Run the focused test and verify it passes**

Run:

```bash
npm test -- tests/unit/pageContentProfile.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit the pure policy change**

Run:

```bash
git add src/core/pageContentProfile.ts tests/unit/pageContentProfile.test.ts
git commit -m "feat(ocr): 이미지 포함 페이지 자동 OCR 기준 확대"
```

Expected: commit succeeds with only the policy module and its unit test staged.

---

### Task 3: Add Single-Page OCR Regression

**Files:**
- Modify: `tests/integration/ocr-flow.test.tsx`

- [ ] **Step 1: Update existing profile fixtures with the new field**

In `tests/integration/ocr-flow.test.tsx`, add `hasOcrRelevantImage` next to every `hasLargeImage` field:

```ts
hasLargeImage: true,
hasOcrRelevantImage: true,
shouldAutoOcr: true,
```

For fixtures where OCR should not run, use:

```ts
hasLargeImage: false,
hasOcrRelevantImage: false,
shouldAutoOcr: false,
```

- [ ] **Step 2: Add text-rich image regression test**

Append this test before `it('자동 OCR 대상이 없으면 OCR 워커를 생성하지 않는다', ...)`:

```tsx
it('텍스트가 충분해도 OCR 관련 이미지가 있으면 자동 OCR 을 실행한다', async () => {
  fakePdfWorker.inspectPageContent.mockResolvedValue({
    pageIndex: 0,
    pageAreaPt: 10000,
    textCharCount: 500,
    textLineCount: 20,
    textAreaRatio: 0.8,
    imageAreaRatio: 0.05,
    imageBlocks: [{ bbox: [0, 0, 50, 10], widthPx: 120, heightPx: 80, areaRatio: 0.05 }],
    hasLargeImage: false,
    hasOcrRelevantImage: true,
    shouldAutoOcr: true,
  });

  function Probe() {
    useOcrDetect();
    return null;
  }

  useAppStore.getState().setDoc({
    kind: 'ready',
    fileName: 'mixed.pdf',
    pages: [{ index: 0, widthPt: 100, heightPt: 100, rotation: 0 }],
  });

  root = createRoot(document.createElement('div'));
  await act(async () => {
    root?.render(<Probe />);
  });

  await waitForStore(() => useAppStore.getState().candidates.some((c) => c.source === 'ocr'));

  expect(fakePdfWorker.inspectPageContent).toHaveBeenCalledWith(0);
  expect(fakePdfWorker.renderPagePng).toHaveBeenCalledWith(0, 2);
  expect(fakeOcrWorker.recognizePng).toHaveBeenCalledWith({
    pageIndex: 0,
    png: new Uint8Array([1, 2, 3]),
  });
});
```

- [ ] **Step 3: Run the focused integration test**

Run:

```bash
npm test -- tests/integration/ocr-flow.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit the single-page regression**

Run:

```bash
git add tests/integration/ocr-flow.test.tsx
git commit -m "test(ocr): 텍스트 포함 이미지 페이지 자동 OCR 회귀 추가"
```

Expected: commit succeeds with only the OCR flow test staged.

---

### Task 4: Add Batch OCR Regression

**Files:**
- Modify: `tests/unit/batch/runBatchJob.test.ts`

- [ ] **Step 1: Update existing batch profile fixture**

In the existing `OCR이 필요한 페이지에 주입된 OCR 후보를 병합한다` test, add the new field:

```ts
hasLargeImage: true,
hasOcrRelevantImage: true,
shouldAutoOcr: true,
```

- [ ] **Step 2: Add text-rich image batch test**

Append this test inside `describe('runBatchJob', ...)`, after the existing OCR merge test:

```ts
it('텍스트가 충분해도 OCR 관련 이미지가 있으면 batch OCR 후보를 병합한다', async () => {
  const ocrCandidate: Candidate = {
    ...candidate,
    id: 'ocr-image-1',
    source: 'ocr',
    text: '010-1234-5678',
    category: 'phone',
  };
  const pdf = createPdfFake({
    inspectPageContent: vi.fn().mockResolvedValue({
      pageIndex: 0,
      pageAreaPt: 10000,
      textCharCount: 500,
      textLineCount: 20,
      textAreaRatio: 0.8,
      imageAreaRatio: 0.05,
      imageBlocks: [{ bbox: [0, 0, 50, 10], widthPx: 120, heightPx: 80, areaRatio: 0.05 }],
      hasLargeImage: false,
      hasOcrRelevantImage: true,
      shouldAutoOcr: true,
    }),
  });
  const ocrDetectPage = vi.fn().mockResolvedValue([ocrCandidate]);

  const result = await runBatchJob({
    file: new File(['pdf'], 'mixed.pdf', { type: 'application/pdf' }),
    settings: { useOcr: true, autoApplyNer: false },
    pdf,
    ocrDetectPage,
  });

  expect(ocrDetectPage).toHaveBeenCalledWith(0);
  expect(pdf.apply).toHaveBeenCalledWith([
    expect.objectContaining({ id: 'auto-1' }),
    expect.objectContaining({ id: 'ocr-image-1' }),
  ]);
  expect(result.candidates).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: 'ocr-image-1', source: 'ocr' })]),
  );
});
```

- [ ] **Step 3: Run the focused batch test**

Run:

```bash
npm test -- tests/unit/batch/runBatchJob.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit the batch regression**

Run:

```bash
git add tests/unit/batch/runBatchJob.test.ts
git commit -m "test(batch): 이미지 포함 페이지 OCR 정책 회귀 추가"
```

Expected: commit succeeds with only the batch test staged.

---

### Task 5: Final Verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Run all tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript check**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: PASS, including `scripts/verify-no-external.mjs --target=dist`.

- [ ] **Step 4: Confirm working tree state**

Run:

```bash
git status --short
```

Expected: no unstaged or untracked implementation files. Generated build artifacts may appear only if the repository already tracks them or local build output is intentionally ignored.
