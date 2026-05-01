# OCR Page-Level NER Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the existing OCR page-level NER flow so OCR-NER candidates are category-safe, bbox-safe, deduplicated against regex candidates, and consistently used in single-page and batch processing.

**Architecture:** Keep the current page-level OCR-NER pipeline: OCR lines become one page-level `pageText`, NER runs on that whole page text, and entity offsets map back to OCR char boxes. Add a small pure module for OCR-NER candidate policy, then wire both `useOcrDetect` and `useBatchRunner` through it so single and batch behavior match.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, MuPDF worker, PaddleOCR worker, local NER worker.

---

## File Structure

- Create `src/core/ocr/nerCandidates.ts`
  - Owns OCR-NER candidate post-processing.
  - Filters unsupported NER categories before they become `DetectionCategory`.
  - Drops unusable boxes.
  - Removes OCR-NER boxes that duplicate stronger regex/OCR candidates.
  - Converts `NerBox[]` into `Candidate[]` for batch code.
- Create `tests/unit/ocr/nerCandidates.test.ts`
  - Unit tests for the pure OCR-NER policy module.
- Modify `src/hooks/useOcrDetect.ts`
  - Keep the existing page-level OCR-NER classification.
  - Filter OCR-NER boxes against existing text-layer candidates and current OCR regex candidates before storing.
- Modify `src/hooks/useBatchRunner.ts`
  - Use the same OCR-NER filtering and candidate conversion module as single-page processing.
  - Remove the local OCR-NER candidate conversion helper.
- Modify `tests/integration/ocr-flow.test.tsx`
  - Add a regression test proving unsupported structured NER categories from OCR are not stored as `ocr-ner`.
- Modify `tests/unit/useBatchRunner.test.tsx`
  - Add a regression test proving batch OCR-NER uses the same dedupe policy as single-page processing.

---

### Task 1: Add OCR-NER Candidate Policy Module

**Files:**
- Create: `src/core/ocr/nerCandidates.ts`
- Create: `tests/unit/ocr/nerCandidates.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/ocr/nerCandidates.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { NerBox } from '@/core/spanMap';
import type { Candidate } from '@/types/domain';
import {
  filterOcrNerBoxes,
  nerBoxesToCandidates,
} from '@/core/ocr/nerCandidates';

vi.mock('@/utils/id', () => ({
  createId: vi
    .fn()
    .mockReturnValueOnce('candidate-1')
    .mockReturnValueOnce('candidate-2')
    .mockReturnValueOnce('candidate-3'),
}));

const baseBox: NerBox = {
  category: 'private_person',
  bbox: { x: 10, y: 20, w: 30, h: 10 },
  score: 0.91,
};

function primaryCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: 'primary-1',
    pageIndex: 0,
    bbox: [10, 20, 40, 30],
    text: '서울특별시',
    category: 'address',
    confidence: 1,
    source: 'ocr',
    ...overrides,
  };
}

describe('filterOcrNerBoxes', () => {
  it('keeps supported OCR-NER categories with usable boxes', () => {
    expect(
      filterOcrNerBoxes({
        pageIndex: 0,
        boxes: [baseBox],
        primaryCandidates: [],
      }),
    ).toEqual([baseBox]);
  });

  it('drops structured categories that regex/OCR detectors own', () => {
    const boxes: NerBox[] = [
      { ...baseBox, category: 'private_email' },
      { ...baseBox, category: 'private_phone' },
      { ...baseBox, category: 'account_number' },
      { ...baseBox, category: 'private_person' },
    ];

    expect(
      filterOcrNerBoxes({
        pageIndex: 0,
        boxes,
        primaryCandidates: [],
      }),
    ).toEqual([{ ...baseBox, category: 'private_person' }]);
  });

  it('drops boxes with non-finite or zero-area coordinates', () => {
    const boxes: NerBox[] = [
      { ...baseBox, bbox: { x: Number.NaN, y: 0, w: 10, h: 10 } },
      { ...baseBox, bbox: { x: 0, y: 0, w: 0, h: 10 } },
      { ...baseBox, bbox: { x: 0, y: 0, w: 10, h: 0 } },
      baseBox,
    ];

    expect(
      filterOcrNerBoxes({
        pageIndex: 0,
        boxes,
        primaryCandidates: [],
      }),
    ).toEqual([baseBox]);
  });

  it('drops OCR-NER address boxes that overlap regex address candidates', () => {
    const boxes: NerBox[] = [
      { ...baseBox, category: 'private_address', bbox: { x: 10, y: 20, w: 30, h: 10 } },
      { ...baseBox, category: 'private_address', bbox: { x: 100, y: 20, w: 30, h: 10 } },
    ];

    expect(
      filterOcrNerBoxes({
        pageIndex: 0,
        boxes,
        primaryCandidates: [primaryCandidate()],
      }),
    ).toEqual([
      { ...baseBox, category: 'private_address', bbox: { x: 100, y: 20, w: 30, h: 10 } },
    ]);
  });

  it('keeps the highest-scored duplicate OCR-NER box for the same rounded geometry', () => {
    const boxes: NerBox[] = [
      { ...baseBox, score: 0.71 },
      { ...baseBox, score: 0.93 },
    ];

    expect(
      filterOcrNerBoxes({
        pageIndex: 0,
        boxes,
        primaryCandidates: [],
      }),
    ).toEqual([{ ...baseBox, score: 0.93 }]);
  });
});

describe('nerBoxesToCandidates', () => {
  it('converts filtered OCR-NER boxes to candidates', () => {
    expect(nerBoxesToCandidates(0, [baseBox], 'ocr-ner')).toEqual([
      {
        id: 'candidate-1',
        pageIndex: 0,
        bbox: [10, 20, 40, 30],
        text: '',
        category: 'private_person',
        confidence: 0.91,
        source: 'ocr-ner',
      },
    ]);
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
npm test -- tests/unit/ocr/nerCandidates.test.ts
```

Expected: FAIL because `src/core/ocr/nerCandidates.ts` does not exist.

- [ ] **Step 3: Implement the policy module**

Create `src/core/ocr/nerCandidates.ts`:

```ts
import type { NerBox } from '@/core/spanMap';
import type { Bbox, Candidate, DetectionCategory } from '@/types/domain';
import { createId } from '@/utils/id';

type NerCandidateSource = Extract<Candidate['source'], 'ner' | 'ocr-ner'>;

const OCR_NER_CATEGORIES = new Set<DetectionCategory>([
  'private_person',
  'private_address',
  'private_url',
  'private_date',
  'secret',
]);

const MIN_BOX_EDGE_PT = 0.25;
const DUPLICATE_IOU = 0.5;

export function filterOcrNerBoxes(input: {
  pageIndex: number;
  boxes: NerBox[];
  primaryCandidates: Candidate[];
}): NerBox[] {
  return dedupeNerBoxes(
    input.boxes
      .filter((box) => isSupportedOcrNerCategory(box.category))
      .filter(hasUsableBox)
      .filter((box) => !hasPrimaryDuplicate(input.pageIndex, box, input.primaryCandidates)),
  );
}

export function nerBoxesToCandidates(
  pageIndex: number,
  boxes: NerBox[],
  source: NerCandidateSource,
): Candidate[] {
  const candidates: Candidate[] = [];
  for (const box of boxes) {
    const category = toDetectionCategory(box.category);
    if (category === null) continue;
    candidates.push({
      id: createId(),
      pageIndex,
      bbox: nerBoxToBbox(box),
      text: '',
      category,
      confidence: box.score,
      source,
    });
  }
  return candidates;
}

function isSupportedOcrNerCategory(category: string): category is DetectionCategory {
  return isDetectionCategory(category) && OCR_NER_CATEGORIES.has(category);
}

function isDetectionCategory(category: string): category is DetectionCategory {
  return (
    category === 'rrn' ||
    category === 'phone' ||
    category === 'email' ||
    category === 'account' ||
    category === 'businessNo' ||
    category === 'card' ||
    category === 'address' ||
    category === 'private_person' ||
    category === 'private_address' ||
    category === 'private_url' ||
    category === 'private_date' ||
    category === 'secret'
  );
}

function toDetectionCategory(category: string): DetectionCategory | null {
  return isDetectionCategory(category) ? category : null;
}

function hasUsableBox(box: NerBox): boolean {
  const values = [box.bbox.x, box.bbox.y, box.bbox.w, box.bbox.h];
  return (
    values.every(Number.isFinite) &&
    box.bbox.w >= MIN_BOX_EDGE_PT &&
    box.bbox.h >= MIN_BOX_EDGE_PT
  );
}

function hasPrimaryDuplicate(
  pageIndex: number,
  box: NerBox,
  primaryCandidates: Candidate[],
): boolean {
  const bbox = nerBoxToBbox(box);
  return primaryCandidates.some(
    (candidate) =>
      candidate.pageIndex === pageIndex &&
      candidate.source !== 'ner' &&
      candidate.source !== 'ocr-ner' &&
      isEquivalentCategory(box.category, candidate.category) &&
      bboxIou(bbox, candidate.bbox) >= DUPLICATE_IOU,
  );
}

function isEquivalentCategory(nerCategory: string, primaryCategory: DetectionCategory): boolean {
  return (
    nerCategory === primaryCategory ||
    (nerCategory === 'private_address' && primaryCategory === 'address')
  );
}

function dedupeNerBoxes(boxes: NerBox[]): NerBox[] {
  const byKey = new Map<string, NerBox>();
  for (const box of boxes) {
    const key = [
      box.category,
      Math.round(box.bbox.x * 10),
      Math.round(box.bbox.y * 10),
      Math.round(box.bbox.w * 10),
      Math.round(box.bbox.h * 10),
    ].join(':');
    const prev = byKey.get(key);
    if (!prev || box.score > prev.score) byKey.set(key, box);
  }
  return [...byKey.values()];
}

function nerBoxToBbox(box: NerBox): Bbox {
  return [
    box.bbox.x,
    box.bbox.y,
    box.bbox.x + box.bbox.w,
    box.bbox.y + box.bbox.h,
  ];
}

function bboxIou(a: Bbox, b: Bbox): number {
  const x0 = Math.max(a[0], b[0]);
  const y0 = Math.max(a[1], b[1]);
  const x1 = Math.min(a[2], b[2]);
  const y1 = Math.min(a[3], b[3]);
  const intersection = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const union = areaA + areaB - intersection;
  return union <= 0 ? 0 : intersection / union;
}
```

- [ ] **Step 4: Run the unit test and verify it passes**

Run:

```bash
npm test -- tests/unit/ocr/nerCandidates.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/core/ocr/nerCandidates.ts tests/unit/ocr/nerCandidates.test.ts
git commit -m "feat(ocr): add OCR NER candidate policy"
```

Expected: commit succeeds.

---

### Task 2: Wire Policy Into Single-Page OCR Detection

**Files:**
- Modify: `src/hooks/useOcrDetect.ts`
- Modify: `tests/integration/ocr-flow.test.tsx`

- [ ] **Step 1: Write the failing integration test**

Add this test inside `describe('OCR 탐지 플로우', () => { ... })` in `tests/integration/ocr-flow.test.tsx` after the existing OCR-NER storage test:

```ts
  it('OCR-NER 는 정규식 탐지 영역의 structured NER category 를 저장하지 않는다', async () => {
    fakeOcrWorker.recognizePng.mockResolvedValue({
      lines: [
        {
          id: 'line-email',
          pageIndex: 0,
          text: '이메일 alice@example.com',
          score: 0.96,
          poly: [
            { x: 0, y: 0 },
            { x: 220, y: 0 },
            { x: 220, y: 20 },
            { x: 0, y: 20 },
          ],
        },
      ],
    });
    fakeNerWorker.classify.mockResolvedValue([
      {
        entity_group: 'private_email',
        start: 4,
        end: 21,
        score: 0.99,
        word: 'alice@example.com',
      },
    ]);

    function Probe() {
      useOcrDetect();
      return null;
    }

    useAppStore.getState().setDoc({
      kind: 'ready',
      fileName: 'scan.pdf',
      pages: [{ index: 0, widthPt: 100, heightPt: 100, rotation: 0 }],
    });

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });

    await waitForStore(() => useAppStore.getState().ocrProgress.byPage[0]?.status === 'done');

    const state = useAppStore.getState();
    expect(state.candidates.some((candidate) => candidate.source === 'ocr')).toBe(true);
    expect(state.candidates.some((candidate) => candidate.source === 'ocr-ner')).toBe(false);
    expect(
      Object.values(state.boxes).some((box) => box.source === 'ocr-ner'),
    ).toBe(false);
  });
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm test -- tests/integration/ocr-flow.test.tsx -t "structured NER category"
```

Expected: FAIL because `private_email` currently becomes an `ocr-ner` candidate through an unchecked category cast.

- [ ] **Step 3: Import the policy module in `useOcrDetect.ts`**

Add this import near the other OCR imports:

```ts
import { filterOcrNerBoxes } from '@/core/ocr/nerCandidates';
```

- [ ] **Step 4: Filter OCR-NER boxes before storing them**

In `src/hooks/useOcrDetect.ts`, replace this block:

```ts
          const ocrNerBoxes = ocrNer.boxes;
          if (isStaleJob()) return;
          const state = useAppStore.getState();
          const existingCandidates = state.candidates.filter(
            (candidate) => candidate.source !== 'ocr' && candidate.source !== 'ocr-ner',
          );
          const candidates = removeDuplicateOcrCandidates(ocrCandidates, existingCandidates);
          state.addOcrCandidates(candidates, [pageIndex]);
          state.addOcrNerCandidates(pageIndex, ocrNerBoxes);
```

with:

```ts
          if (isStaleJob()) return;
          const state = useAppStore.getState();
          const existingCandidates = state.candidates.filter(
            (candidate) => candidate.source !== 'ocr' && candidate.source !== 'ocr-ner',
          );
          const candidates = removeDuplicateOcrCandidates(ocrCandidates, existingCandidates);
          const ocrNerBoxes = filterOcrNerBoxes({
            pageIndex,
            boxes: ocrNer.boxes,
            primaryCandidates: [...existingCandidates, ...candidates],
          });
          state.addOcrCandidates(candidates, [pageIndex]);
          state.addOcrNerCandidates(pageIndex, ocrNerBoxes);
```

- [ ] **Step 5: Run targeted OCR tests**

Run:

```bash
npm test -- tests/unit/ocr/nerCandidates.test.ts tests/integration/ocr-flow.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/hooks/useOcrDetect.ts tests/integration/ocr-flow.test.tsx
git commit -m "fix(ocr): filter OCR NER candidates before storing"
```

Expected: commit succeeds.

---

### Task 3: Wire Policy Into Batch OCR Detection

**Files:**
- Modify: `src/hooks/useBatchRunner.ts`
- Modify: `tests/unit/useBatchRunner.test.tsx`

- [ ] **Step 1: Write the failing batch regression test**

Modify the hoisted fake block at the top of `tests/unit/useBatchRunner.test.tsx` from:

```ts
const { fakeNerWorker } = vi.hoisted(() => ({
  fakeNerWorker: {
    classify: vi.fn(),
    load: vi.fn(),
    unload: vi.fn(),
  },
}));
```

to:

```ts
const { fakeNerWorker, fakeOcrWorker } = vi.hoisted(() => ({
  fakeNerWorker: {
    classify: vi.fn(),
    load: vi.fn(),
    unload: vi.fn(),
  },
  fakeOcrWorker: {
    recognizePng: vi.fn(),
  },
}));
```

Add this mock after the existing `@/workers/pdfWorkerClient` mock:

```ts
vi.mock('@/workers/ocrWorkerClient', () => ({
  getOcrWorker: vi.fn(() => fakeOcrWorker),
}));
```

Add this test inside `describe('useBatchRunner', () => { ... })`:

```ts
  it('batch OCR-NER 후보도 OCR 정규식 후보와 중복되면 제외한다', async () => {
    const file = new File(['a'], 'batch-scan.pdf', { type: 'application/pdf' });
    vi.mocked(getPdfWorker).mockResolvedValue({
      renderPagePng: vi.fn().mockResolvedValue({
        png: new Uint8Array([1, 2, 3]),
        widthPx: 220,
        heightPx: 20,
        scale: 2,
      }),
    } as unknown as Awaited<ReturnType<typeof getPdfWorker>>);
    fakeOcrWorker.recognizePng.mockResolvedValue({
      lines: [
        {
          id: 'line-address',
          pageIndex: 0,
          text: '주소 서울특별시 중구 세종대로 110',
          score: 0.97,
          poly: [
            { x: 0, y: 0 },
            { x: 220, y: 0 },
            { x: 220, y: 20 },
            { x: 0, y: 20 },
          ],
        },
      ],
    });
    fakeNerWorker.classify.mockResolvedValue([
      {
        entity_group: 'private_address',
        start: 3,
        end: 20,
        score: 0.96,
        word: '서울특별시 중구 세종대로',
      },
    ]);
    vi.mocked(runBatchJob).mockImplementation(async (input) => {
      const candidates = await input.ocrDetectPage!(0);
      return {
        status: 'done',
        candidates,
        candidateCount: candidates.length,
        enabledBoxCount: candidates.length,
        report: null,
        outputBlob: new Blob(['ok'], { type: 'application/pdf' }),
        errorMessage: null,
        needsReview: false,
      };
    });
    useBatchStore.getState().addFiles([file]);

    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root?.render(<Harness />);
    });

    await act(async () => {
      controls?.start();
    });

    await waitFor(() => useBatchStore.getState().jobs[0]?.status === 'done');

    const candidates = useBatchStore.getState().jobs[0]?.candidates ?? [];
    expect(candidates.some((candidate) => candidate.source === 'ocr')).toBe(true);
    expect(candidates.some((candidate) => candidate.source === 'ocr-ner')).toBe(false);
  });
```

- [ ] **Step 2: Run the batch test and verify it fails**

Run:

```bash
npm test -- tests/unit/useBatchRunner.test.tsx -t "batch OCR-NER"
```

Expected: FAIL because batch OCR currently appends raw OCR-NER candidates without the shared policy filter.

- [ ] **Step 3: Import the shared policy helpers**

In `src/hooks/useBatchRunner.ts`, add:

```ts
import {
  filterOcrNerBoxes,
  nerBoxesToCandidates,
} from '@/core/ocr/nerCandidates';
```

Remove this import because the local helper will disappear:

```ts
import { createId } from '@/utils/id';
```

- [ ] **Step 4: Filter OCR-NER boxes in `createOcrDetector`**

In `src/hooks/useBatchRunner.ts`, replace the return at the end of `createOcrDetector`:

```ts
    return [...candidates, ...nerBoxesToCandidates(pageIndex, nerBoxes, 'ocr-ner')];
```

with:

```ts
    const ocrNerBoxes = filterOcrNerBoxes({
      pageIndex,
      boxes: nerBoxes,
      primaryCandidates: candidates,
    });
    return [...candidates, ...nerBoxesToCandidates(pageIndex, ocrNerBoxes, 'ocr-ner')];
```

- [ ] **Step 5: Remove the local `nerBoxesToCandidates` helper**

In `src/hooks/useBatchRunner.ts`, delete this import because it is only used by the removed helper:

```ts
import type { Candidate, DetectionCategory } from '@/types/domain';
```

Replace it with:

```ts
import type { Candidate } from '@/types/domain';
```

Delete the local helper function:

```ts
function nerBoxesToCandidates(
  pageIndex: number,
  boxes: NerBox[],
  source: Extract<Candidate['source'], 'ner' | 'ocr-ner'>,
): Candidate[] {
  return boxes.map((box) => ({
    id: createId(),
    pageIndex,
    bbox: [
      box.bbox.x,
      box.bbox.y,
      box.bbox.x + box.bbox.w,
      box.bbox.y + box.bbox.h,
    ],
    text: '',
    category: box.category as DetectionCategory,
    confidence: box.score,
    source,
  }));
}
```

Keep the local `dedupeNerBoxes` function because text-layer batch NER still uses it before conversion to `source: 'ner'`.

- [ ] **Step 6: Run targeted batch and OCR tests**

Run:

```bash
npm test -- tests/unit/useBatchRunner.test.tsx tests/unit/ocr/nerCandidates.test.ts tests/integration/ocr-flow.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/hooks/useBatchRunner.ts tests/unit/useBatchRunner.test.tsx
git commit -m "fix(batch): reuse OCR NER candidate policy"
```

Expected: commit succeeds.

---

### Task 4: Final Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run type checking**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Check the git diff**

Run:

```bash
git status --short
git log --oneline -5
```

Expected:

```text
```

for `git status --short`, meaning no uncommitted changes. `git log --oneline -5` should include the three task commits:

```text
fix(batch): reuse OCR NER candidate policy
fix(ocr): filter OCR NER candidates before storing
feat(ocr): add OCR NER candidate policy
```

---

## Self-Review

Spec coverage:

- Page-level OCR text to NER is already the baseline and remains unchanged.
- Unsupported structured categories are filtered before OCR-NER storage.
- OCR-NER boxes are deduplicated internally and against regex/OCR primary candidates.
- Single-page and batch OCR-NER paths share the same policy.
- Existing debug logging remains in `useOcrDetect.ts` and `useBatchRunner.ts`.
- Runtime failure behavior remains in `useOcrDetect.ts` and batch error collection remains in `runBatchJob.ts`.

Risk notes:

- Page-bound clipping is not implemented in this plan because the current OCR detector interfaces do not pass page dimensions into the OCR-NER post-processing point. The implemented finite/positive-size guard catches broken boxes without widening function signatures.
- The duplicate policy only removes OCR-NER boxes that overlap equivalent primary categories. It does not remove a `private_person` OCR-NER box merely because it is near an unrelated phone or RRN regex box.
