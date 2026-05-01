# PaddleOCR Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add browser-only PaddleOCR detection for image-based PDF content and switch the app from single-HTML packaging to same-origin server deployment.

**Architecture:** Keep MuPDF as the only PDF engine. MuPDF opens, inspects, renders, and redacts PDFs; a separate OCR worker receives MuPDF-rendered page images and returns OCR lines that are converted into existing `Candidate` and `RedactionBox` records. The default build becomes a multi-asset static site where OCR models, ONNX Runtime files, JS chunks, and WASM assets are served from the same origin.

**Tech Stack:** React 19, Vite 5, TypeScript, Zustand, Comlink, MuPDF.js WASM, `@paddleocr/paddleocr-js`, Vitest, Playwright, AWS S3 + CloudFront.

---

## Starting Conditions

- Base design spec: `docs/superpowers/specs/2026-04-30-ocr-integration-design.md`
- Current spec commit: `a5b1f02 docs(ocr): add paddleocr integration design`
- The workspace may contain unrelated local changes. At every commit step, stage only the files listed in that task.
- Run `git status --short` before every commit and confirm unrelated files remain unstaged.

## File Structure

Create:

- `src/core/ocr/types.ts`: OCR domain types shared by worker, hook, tests, and pure conversion code.
- `src/core/ocr/normalize.ts`: Normalize PaddleOCR SDK output into stable `OcrLine` values.
- `src/core/ocr/geometry.ts`: Convert OCR line polygons to char boxes and PDF point boxes.
- `src/core/ocr/detect.ts`: Run existing regex detectors against OCR lines and emit OCR candidates.
- `src/core/ocr/dedupe.ts`: Drop OCR candidates that duplicate existing text-layer candidates.
- `src/core/pageContentProfile.ts`: Pure page profile and OCR auto-targeting logic.
- `src/workers/ocr.worker.types.ts`: Comlink API contract for OCR worker.
- `src/workers/ocr.worker.ts`: PaddleOCR engine lifecycle and recognition implementation.
- `src/workers/ocrWorkerClient.ts`: Main-thread singleton wrapper around `ocr.worker`.
- `src/hooks/useOcrDetect.ts`: OCR queue orchestration tied to document epoch and current page.
- `src/components/OcrStatus.tsx`: Compact OCR progress, retry, and manual run controls.
- `scripts/copy-ort-assets.mjs`: Copy ONNX Runtime assets into `public/ort`.
- `tests/unit/ocr/normalize.test.ts`
- `tests/unit/ocr/geometry.test.ts`
- `tests/unit/ocr/detect.test.ts`
- `tests/unit/ocr/dedupe.test.ts`
- `tests/unit/pageContentProfile.test.ts`
- `tests/integration/ocr-flow.test.tsx`
- `tests/unit/scripts/verify-no-external.test.mjs`

Modify:

- `package.json`: dependencies, scripts, and server-build verification.
- `vite.config.ts`: remove default single-file build path and keep workers as normal assets.
- `src/workers/pdfWorkerClient.ts`: emit the PDF worker as a normal build asset instead of inlining it.
- `scripts/verify-no-external.mjs`: scan a directory instead of one HTML file.
- `src/types/domain.ts`: add OCR source and OCR progress types.
- `src/state/store.ts`: add OCR state/actions and OCR candidate insertion.
- `src/core/detectors/index.ts`: allow detector caller to override candidate source.
- `src/core/mupdfBridge.ts`: add page inspection and PNG render API for OCR.
- `src/workers/pdf.worker.types.ts`: expose `inspectPageContent` and `renderPagePng`.
- `src/workers/pdf.worker.ts`: wire new MuPDF APIs.
- `src/App.tsx`: mount OCR hook and OCR status component.
- `src/components/CandidatePanel.tsx`: include OCR detected boxes and source badge.
- `src/components/Toolbar.tsx`: add current-page and document OCR commands.
- `.github/workflows/deploy.yml`: upload all `dist/**` files with cache policies.
- `infra/pulumi/components/s3-site-bucket.ts`: upload all dist files in Pulumi.
- `infra/pulumi/README.md`: document multi-asset deploy.
- `README.md`: document OCR, server deployment, and same-origin assets.

---

### Task 1: Server Multi-Asset Build Baseline

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `src/workers/pdfWorkerClient.ts`
- Modify: `scripts/verify-no-external.mjs`
- Create: `tests/unit/scripts/verify-no-external.test.mjs`

- [ ] **Step 1: Write failing tests for directory-wide external URL scanning**

Create `tests/unit/scripts/verify-no-external.test.mjs`:

```js
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it, afterEach } from 'vitest';

const created = [];

async function makeDir() {
  const dir = await mkdtemp(path.join(tmpdir(), 'pii-guard-no-external-'));
  created.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('verify-no-external', () => {
  it('passes when nested build assets only contain same-origin paths and allowed namespaces', async () => {
    const dir = await makeDir();
    await mkdir(path.join(dir, 'assets'));
    await writeFile(path.join(dir, 'index.html'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await writeFile(path.join(dir, 'assets', 'app.js'), 'fetch("/models/paddleocr/model.tar")');

    const result = spawnSync('node', ['scripts/verify-no-external.mjs', `--target=${dir}`], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('외부 URL 0개');
  });

  it('fails when any nested build asset contains an unallowed external URL', async () => {
    const dir = await makeDir();
    await mkdir(path.join(dir, 'assets'));
    await writeFile(path.join(dir, 'index.html'), '<main></main>');
    await writeFile(path.join(dir, 'assets', 'app.js'), 'fetch("https://cdn.jsdelivr.net/npm/x")');

    const result = spawnSync('node', ['scripts/verify-no-external.mjs', `--target=${dir}`], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('https://cdn.jsdelivr.net/npm/x');
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npx vitest run tests/unit/scripts/verify-no-external.test.mjs
```

Expected: FAIL because `scripts/verify-no-external.mjs` reads the target as a single file.

- [ ] **Step 3: Replace `scripts/verify-no-external.mjs` with directory scanning**

Replace the file with:

```js
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

function parseArg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const targetRel = parseArg('target') ?? 'dist';
const targetPath = path.resolve(targetRel);
const textExtensions = new Set(['.html', '.js', '.css', '.json', '.mjs', '.map']);

const allowList = [
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/XML/1998/namespace',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/1998/Math/MathML',
  'https://react.dev/errors/',
  'https://radix-ui.com/primitives/',
  'https://huggingface.co/',
  'https://web.dev/cross-origin-isolation-guide/',
  'https://developer.mozilla.org/',
  'https://github.com/huggingface/transformers.js/',
  'https://gist.github.com/hollance/',
];

async function collectFiles(filePath) {
  const info = await stat(filePath);
  if (info.isFile()) {
    return textExtensions.has(path.extname(filePath)) ? [filePath] : [];
  }

  if (!info.isDirectory()) {
    return [];
  }

  const entries = await readdir(filePath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => collectFiles(path.join(filePath, entry.name))),
  );
  return nested.flat();
}

const files = await collectFiles(targetPath);
const matches = [];
let totalBytes = 0;

for (const filePath of files) {
  const content = await readFile(filePath, 'utf8');
  totalBytes += Buffer.byteLength(content);
  for (const match of content.matchAll(/https?:\/\/[^"'\s)>]+/g)) {
    const url = match[0];
    if (!allowList.some((allowed) => url.startsWith(allowed))) {
      matches.push({ filePath, url });
    }
  }
}

if (matches.length > 0) {
  console.error('외부 URL 발견:');
  for (const match of matches) {
    console.error(`  ${path.relative(process.cwd(), match.filePath)}: ${match.url}`);
  }
  process.exit(1);
}

console.log(
  `OK — ${targetRel} 외부 URL 0개 (검사 ${files.length} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB text)`,
);
```

- [ ] **Step 4: Update `package.json` scripts for server build**

In `package.json`, set these scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "dev:nlp": "vite --mode nlp",
    "build": "tsc -b && vite build",
    "build:nlp": "npm run build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc -b",
    "release": "node scripts/release.mjs",
    "prebuild": "node scripts/embed-wasm.mjs",
    "predev": "node scripts/embed-wasm.mjs",
    "pretest": "node scripts/embed-wasm.mjs",
    "postbuild": "node scripts/verify-no-external.mjs --target=dist"
  }
}
```

Keep existing dependencies and devDependencies unchanged in this step.

- [ ] **Step 5: Change default Vite build to multi-asset**

In `vite.config.ts`, keep helper plugins available for NER mode only where they are still used, but make the default build skip `viteSingleFile()`.

Replace the `export default defineConfig` mode booleans and plugin section with:

```ts
export default defineConfig(({ mode }) => {
  const isNlp = mode === 'nlp';
  const useSingleFile = mode === 'singlefile';
  const inputEntry: Record<string, string> = { index: path.resolve(__dirname, 'index.html') };
  return {
    plugins: [
      react(),
      stripMupdfWasmAsset(),
      ...(isNlp
        ? [pocModelServer(), ortRuntimeServer(), stripOnnxJsdelivrDefault(), stripOnnxProxyWasmDataUrl()]
        : []),
      ...(useSingleFile ? [deferredWasmModuleWorker(), viteSingleFile()] : []),
    ],
```

Replace the `build` block with:

```ts
    build: {
      outDir: 'dist',
      target: 'es2022',
      cssCodeSplit: true,
      assetsInlineLimit: 4096,
      rollupOptions: {
        input: inputEntry,
        output: { inlineDynamicImports: useSingleFile },
      },
    },
```

- [ ] **Step 6: Emit the PDF worker as a server asset**

In `src/workers/pdfWorkerClient.ts`, replace:

```ts
import PdfWorker from './pdf.worker.ts?worker&inline';
```

with:

```ts
import PdfWorker from './pdf.worker.ts?worker';
```

- [ ] **Step 7: Run verification**

Run:

```bash
npx vitest run tests/unit/scripts/verify-no-external.test.mjs
npm run lint
```

Expected: both commands pass.

- [ ] **Step 8: Commit**

Run:

```bash
git status --short
git add package.json vite.config.ts src/workers/pdfWorkerClient.ts scripts/verify-no-external.mjs tests/unit/scripts/verify-no-external.test.mjs
git commit -m "build: switch default output to server assets"
```

---

### Task 2: Static OCR Runtime Assets

**Files:**
- Modify: `package.json`
- Create: `scripts/copy-ort-assets.mjs`
- Add asset: `public/models/paddleocr/korean_PP-OCRv5_mobile_rec_onnx.tar`

- [ ] **Step 1: Install OCR dependency**

Run:

```bash
npm install @paddleocr/paddleocr-js@^0.3.2
```

Expected: `package.json` and `package-lock.json` change.

- [ ] **Step 2: Create ORT asset copy script**

Create `scripts/copy-ort-assets.mjs`:

```js
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ortPackage = require.resolve('onnxruntime-web/package.json');
const ortDist = path.join(path.dirname(ortPackage), 'dist');
const targetDir = path.resolve('public/ort');

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });

const entries = await readdir(ortDist);
const copied = [];

for (const entry of entries) {
  if (!/\.(wasm|mjs|js)$/.test(entry)) {
    continue;
  }
  await cp(path.join(ortDist, entry), path.join(targetDir, entry));
  copied.push(entry);
}

if (copied.length === 0) {
  console.error(`copy-ort-assets: no runtime files copied from ${ortDist}`);
  process.exit(1);
}

console.log(`copy-ort-assets: copied ${copied.length} files to ${targetDir}`);
```

- [ ] **Step 3: Update asset preparation scripts**

In `package.json`, add `prepare:assets` and change the pre-hooks:

```json
{
  "scripts": {
    "prepare:assets": "node scripts/embed-wasm.mjs && node scripts/copy-ort-assets.mjs",
    "prebuild": "npm run prepare:assets",
    "predev": "npm run prepare:assets",
    "pretest": "npm run prepare:assets"
  }
}
```

Keep the other scripts from Task 1 unchanged.

- [ ] **Step 4: Copy the verified Korean OCR model asset**

Run:

```bash
mkdir -p public/models/paddleocr
cp /Users/taesoonpark/workspace/paddle/public/models/korean_PP-OCRv5_mobile_rec_onnx.tar public/models/paddleocr/korean_PP-OCRv5_mobile_rec_onnx.tar
test -s public/models/paddleocr/korean_PP-OCRv5_mobile_rec_onnx.tar
```

Expected: the `test -s` command exits with status 0.

- [ ] **Step 5: Run asset preparation**

Run:

```bash
npm run prepare:assets
test -d public/ort
find public/ort -maxdepth 1 -type f | wc -l
```

Expected: `public/ort` exists and the file count is greater than 0.

- [ ] **Step 6: Commit**

Run:

```bash
git status --short
git add package.json package-lock.json scripts/copy-ort-assets.mjs public/ort public/models/paddleocr/korean_PP-OCRv5_mobile_rec_onnx.tar
git commit -m "build: add same-origin OCR runtime assets"
```

---

### Task 3: Domain Types and Store OCR State

**Files:**
- Modify: `src/types/domain.ts`
- Modify: `src/state/store.ts`
- Modify: `tests/unit/state/store.test.ts`

- [ ] **Step 1: Add failing store tests**

Append to `tests/unit/state/store.test.ts`:

```ts
  it('OCR 후보는 기존 candidates 와 boxes 에 source ocr 로 추가된다', () => {
    const s = useAppStore.getState();
    s.addOcrCandidates([
      {
        id: 'ocr-rrn-1',
        pageIndex: 0,
        bbox: [10, 20, 80, 34],
        text: '000000-0000001',
        category: 'rrn',
        confidence: 0.91,
        source: 'ocr',
      },
    ]);

    const state = useAppStore.getState();
    expect(state.candidates).toHaveLength(1);
    expect(state.candidates[0]).toMatchObject({ source: 'ocr', category: 'rrn' });
    expect(state.boxes['ocr-rrn-1']).toMatchObject({
      source: 'ocr',
      category: 'rrn',
      enabled: true,
    });
  });

  it('OCR 진행 상태를 페이지 단위로 갱신하고 reset 시 초기화한다', () => {
    const s = useAppStore.getState();
    s.setOcrProgress({
      done: 1,
      total: 3,
      currentPage: 1,
      byPage: {
        0: { status: 'done' },
        1: { status: 'running' },
        2: { status: 'queued' },
      },
    });

    expect(useAppStore.getState().ocrProgress.currentPage).toBe(1);
    expect(useAppStore.getState().ocrProgress.byPage[2]?.status).toBe('queued');

    s.reset();

    expect(useAppStore.getState().ocrProgress).toEqual({
      done: 0,
      total: 0,
      currentPage: null,
      byPage: {},
    });
  });

  it('새 OCR 후보를 추가할 때 다른 페이지의 기존 OCR 후보는 유지한다', () => {
    const s = useAppStore.getState();
    s.addOcrCandidates([
      {
        id: 'ocr-page-0',
        pageIndex: 0,
        bbox: [0, 0, 10, 10],
        text: 'first@example.com',
        category: 'email',
        confidence: 0.9,
        source: 'ocr',
      },
    ]);

    s.addOcrCandidates([
      {
        id: 'ocr-page-1',
        pageIndex: 1,
        bbox: [20, 0, 30, 10],
        text: 'second@example.com',
        category: 'email',
        confidence: 0.9,
        source: 'ocr',
      },
    ]);

    expect(useAppStore.getState().candidates.map((c) => c.id).sort()).toEqual([
      'ocr-page-0',
      'ocr-page-1',
    ]);
    expect(Object.keys(useAppStore.getState().boxes).sort()).toEqual([
      'ocr-page-0',
      'ocr-page-1',
    ]);
  });

  it('카테고리 토글은 OCR 박스도 함께 갱신한다', () => {
    const s = useAppStore.getState();
    s.addOcrCandidates([
      {
        id: 'ocr-phone-1',
        pageIndex: 0,
        bbox: [0, 0, 10, 10],
        text: '010-1234-5678',
        category: 'phone',
        confidence: 0.9,
        source: 'ocr',
      },
    ]);

    s.toggleCategory('phone');

    expect(useAppStore.getState().boxes['ocr-phone-1']?.enabled).toBe(false);
  });
```

- [ ] **Step 2: Run failing store tests**

Run:

```bash
npx vitest run tests/unit/state/store.test.ts
```

Expected: FAIL because OCR types and store actions do not exist.

- [ ] **Step 3: Extend domain types**

In `src/types/domain.ts`, replace source definitions and add OCR progress:

```ts
export type CandidateSource = 'auto' | 'ner' | 'ocr';

export type RedactionBoxSource = 'auto' | 'ner' | 'ocr' | 'text-select' | 'manual-rect';

export type OcrPageStatus = 'idle' | 'queued' | 'running' | 'done' | 'failed';

export type OcrProgress = {
  done: number;
  total: number;
  currentPage: number | null;
  byPage: Record<number, { status: OcrPageStatus; message?: string }>;
};

export type OcrRequest =
  | { kind: 'idle' }
  | { kind: 'page'; pageIndex: number; nonce: number }
  | { kind: 'all'; nonce: number };
```

- [ ] **Step 4: Extend store state and actions**

In `src/state/store.ts`, import `OcrProgress`, add it to `State`, add two actions, and add initial state:

```ts
import type {
  ApplyReport,
  Bbox,
  Candidate,
  DetectionCategory,
  OcrRequest,
  OcrProgress,
  PageMeta,
  RedactionBox,
} from '@/types/domain';
```

Add to `State`:

```ts
  ocrProgress: OcrProgress;
  ocrRequest: OcrRequest;
```

Add to `Actions`:

```ts
  addOcrCandidates(list: Candidate[]): void;
  setOcrProgress(p: OcrProgress): void;
  requestOcrPage(pageIndex: number): void;
  requestOcrAll(): void;
  clearOcrRequest(nonce: number): void;
```

Add to `initial`:

```ts
  ocrProgress: { done: 0, total: 0, currentPage: null, byPage: {} },
  ocrRequest: { kind: 'idle' },
```

Add action implementations before `toggleBox`:

```ts
  addOcrCandidates(list) {
    if (list.length === 0) return;
    set((s) => ({
      ...mergeOcrCandidates(s, list),
    }));
  },
  setOcrProgress(p) {
    set({ ocrProgress: p });
  },
  requestOcrPage(pageIndex) {
    set((s) => ({ ocrRequest: { kind: 'page', pageIndex, nonce: getRequestNonce(s.ocrRequest) + 1 } }));
  },
  requestOcrAll() {
    set((s) => ({ ocrRequest: { kind: 'all', nonce: getRequestNonce(s.ocrRequest) + 1 } }));
  },
  clearOcrRequest(nonce) {
    set((s) => (getRequestNonce(s.ocrRequest) === nonce ? { ocrRequest: { kind: 'idle' } } : s));
  },
```

Add helper functions near `buildNerConfidenceMap`:

```ts
function mergeOcrCandidates(
  s: State,
  list: Candidate[],
): Pick<State, 'candidates' | 'boxes'> {
  const pages = new Set(list.map((candidate) => candidate.pageIndex));
  const boxes: Record<string, RedactionBox> = { ...s.boxes };

  for (const id in boxes) {
    const box = boxes[id]!;
    if (box.source === 'ocr' && pages.has(box.pageIndex)) {
      delete boxes[id];
    }
  }

  for (const candidate of list) {
    boxes[candidate.id] = {
      id: candidate.id,
      pageIndex: candidate.pageIndex,
      bbox: candidate.bbox,
      source: 'ocr',
      category: candidate.category,
      enabled: s.categoryEnabled[candidate.category] ?? true,
    };
  }

  return {
    candidates: [
      ...s.candidates.filter(
        (candidate) => !(candidate.source === 'ocr' && pages.has(candidate.pageIndex)),
      ),
      ...list,
    ],
    boxes,
  };
}

function getRequestNonce(request: State['ocrRequest']): number {
  return request.kind === 'idle' ? 0 : request.nonce;
}
```

In `toggleCategory`, change the auto branch:

```ts
        if ((box.source === 'auto' || box.source === 'ocr') && box.category === cat) {
          updated[id] = { ...box, enabled: next };
        } else if (box.source === 'ner' && box.category === cat) {
```

- [ ] **Step 5: Run store tests**

Run:

```bash
npx vitest run tests/unit/state/store.test.ts
npm run lint
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

Run:

```bash
git status --short
git add src/types/domain.ts src/state/store.ts tests/unit/state/store.test.ts
git commit -m "feat(ocr): add OCR candidates to app state"
```

---

### Task 4: OCR Pure Conversion Logic

**Files:**
- Create: `src/core/ocr/types.ts`
- Create: `src/core/ocr/normalize.ts`
- Create: `src/core/ocr/geometry.ts`
- Create: `src/core/ocr/detect.ts`
- Create: `src/core/ocr/dedupe.ts`
- Create: `tests/unit/ocr/normalize.test.ts`
- Create: `tests/unit/ocr/geometry.test.ts`
- Create: `tests/unit/ocr/detect.test.ts`
- Create: `tests/unit/ocr/dedupe.test.ts`
- Modify: `src/core/detectors/index.ts`

- [ ] **Step 1: Write OCR normalize test**

Create `tests/unit/ocr/normalize.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeOcrResult } from '@/core/ocr/normalize';

describe('normalizeOcrResult', () => {
  it('trims empty OCR items and normalizes text to NFC', () => {
    const result = normalizeOcrResult({
      items: [
        { text: '  000000-0000001  ', score: 0.92, poly: [[0, 0], [100, 0], [100, 20], [0, 20]] },
        { text: '   ', score: 0.7, poly: [[0, 30], [10, 30], [10, 40], [0, 40]] },
      ],
      metrics: { totalMs: 10, detectedBoxes: 1, recognizedCount: 1 },
      runtime: { requestedBackend: 'auto', detProvider: 'wasm', recProvider: 'wasm', webgpuAvailable: false },
    });

    expect(result.lines).toEqual([
      {
        id: 'line-1',
        pageIndex: 0,
        text: '000000-0000001',
        score: 0.92,
        poly: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 20 },
          { x: 0, y: 20 },
        ],
      },
    ]);
  });
});
```

- [ ] **Step 2: Write OCR geometry test**

Create `tests/unit/ocr/geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lineToDetectorLine, ocrPixelBboxToPdfBbox } from '@/core/ocr/geometry';

describe('OCR geometry', () => {
  it('creates proportional char boxes from one OCR line', () => {
    const line = {
      id: 'line-1',
      pageIndex: 0,
      text: 'ABCDEF',
      score: 0.8,
      poly: [
        { x: 10, y: 20 },
        { x: 70, y: 20 },
        { x: 70, y: 40 },
        { x: 10, y: 40 },
      ],
    };

    expect(lineToDetectorLine(line).charBboxes).toEqual([
      [10, 20, 20, 40],
      [20, 20, 30, 40],
      [30, 20, 40, 40],
      [40, 20, 50, 40],
      [50, 20, 60, 40],
      [60, 20, 70, 40],
    ]);
  });

  it('converts OCR pixel bbox to PDF point bbox using render scale', () => {
    expect(ocrPixelBboxToPdfBbox([20, 40, 100, 80], 2)).toEqual([10, 20, 50, 40]);
  });
});
```

- [ ] **Step 3: Write OCR detect test**

Create `tests/unit/ocr/detect.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { detectOcrCandidates } from '@/core/ocr/detect';

describe('detectOcrCandidates', () => {
  it('runs regex detectors on OCR lines and emits OCR candidates in PDF points', () => {
    const candidates = detectOcrCandidates({
      pageIndex: 0,
      renderScale: 2,
      lines: [
        {
          id: 'line-1',
          pageIndex: 0,
          text: '주민번호 000000-0000001',
          score: 0.95,
          poly: [
            { x: 0, y: 0 },
            { x: 220, y: 0 },
            { x: 220, y: 20 },
            { x: 0, y: 20 },
          ],
        },
      ],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      pageIndex: 0,
      text: '000000-0000001',
      category: 'rrn',
      source: 'ocr',
    });
    expect(candidates[0]?.bbox[2]).toBeGreaterThan(candidates[0]?.bbox[0] ?? 0);
  });
});
```

- [ ] **Step 4: Write OCR dedupe test**

Create `tests/unit/ocr/dedupe.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Candidate } from '@/types/domain';
import { removeDuplicateOcrCandidates } from '@/core/ocr/dedupe';

describe('removeDuplicateOcrCandidates', () => {
  it('keeps existing text-layer candidate when OCR candidate overlaps and normalizes to same text', () => {
    const existing: Candidate[] = [
      {
        id: 'auto-1',
        pageIndex: 0,
        bbox: [10, 10, 80, 30],
        text: '000000-0000001',
        category: 'rrn',
        confidence: 1,
        source: 'auto',
      },
    ];
    const ocr: Candidate[] = [
      {
        id: 'ocr-1',
        pageIndex: 0,
        bbox: [12, 11, 82, 31],
        text: '000000 0000001',
        category: 'rrn',
        confidence: 0.93,
        source: 'ocr',
      },
      {
        id: 'ocr-2',
        pageIndex: 0,
        bbox: [120, 10, 190, 30],
        text: '000000-0000001',
        category: 'rrn',
        confidence: 0.91,
        source: 'ocr',
      },
    ];

    expect(removeDuplicateOcrCandidates(ocr, existing).map((c) => c.id)).toEqual(['ocr-2']);
  });
});
```

- [ ] **Step 5: Run failing OCR tests**

Run:

```bash
npx vitest run tests/unit/ocr
```

Expected: FAIL because OCR modules do not exist.

- [ ] **Step 6: Add OCR shared types**

Create `src/core/ocr/types.ts`:

```ts
import type { Bbox } from '@/types/domain';

export type OcrBackend = 'auto' | 'webgpu' | 'wasm';

export type OcrPoint = {
  x: number;
  y: number;
};

export type OcrLine = {
  id: string;
  pageIndex: number;
  text: string;
  score: number | undefined;
  poly: OcrPoint[];
};

export type NormalizedOcrResult = {
  lines: OcrLine[];
  metrics?: unknown;
  runtime?: unknown;
};

export type OcrDetectionInput = {
  pageIndex: number;
  renderScale: number;
  lines: OcrLine[];
};

export type OcrPixelBbox = Bbox;
```

- [ ] **Step 7: Add normalize implementation**

Create `src/core/ocr/normalize.ts`:

```ts
import type { NormalizedOcrResult, OcrLine } from './types';

type PaddleItem = {
  text: string;
  score?: number;
  poly: Array<[number, number]>;
};

type PaddleResult = {
  items: PaddleItem[];
  metrics?: unknown;
  runtime?: unknown;
};

export function normalizeOcrResult(result: PaddleResult, pageIndex = 0): NormalizedOcrResult {
  const lines: OcrLine[] = result.items
    .map((item) => ({
      text: item.text.trim().normalize('NFC'),
      score: item.score,
      poly: item.poly.map(([x, y]) => ({ x, y })),
    }))
    .filter((item) => item.text.length > 0)
    .map((item, index) => ({
      id: `line-${index + 1}`,
      pageIndex,
      text: item.text,
      score: item.score,
      poly: item.poly,
    }));

  return {
    lines,
    metrics: result.metrics,
    runtime: result.runtime,
  };
}
```

- [ ] **Step 8: Add geometry implementation**

Create `src/core/ocr/geometry.ts`:

```ts
import type { Bbox } from '@/types/domain';
import type { LineForScan } from '@/core/detectors/types';
import type { OcrLine, OcrPoint } from './types';

export function lineToDetectorLine(line: OcrLine, paddingPx = 0): LineForScan {
  const bounds = getPolyBounds(line.poly);
  const chars = Array.from(line.text);
  const charCount = chars.length;

  if (charCount === 0 || bounds[2] <= bounds[0] || bounds[3] <= bounds[1]) {
    return { pageIndex: line.pageIndex, text: line.text, charBboxes: [] };
  }

  const width = bounds[2] - bounds[0];
  const charBboxes = chars.map((_, index): Bbox => {
    const x0 = bounds[0] + width * (index / charCount);
    const x1 = bounds[0] + width * ((index + 1) / charCount);
    return [
      Math.max(0, x0 - paddingPx),
      Math.max(0, bounds[1] - paddingPx),
      x1 + paddingPx,
      bounds[3] + paddingPx,
    ];
  });

  return {
    pageIndex: line.pageIndex,
    text: line.text,
    charBboxes,
  };
}

export function ocrPixelBboxToPdfBbox(bbox: Bbox, renderScale: number): Bbox {
  return [
    bbox[0] / renderScale,
    bbox[1] / renderScale,
    bbox[2] / renderScale,
    bbox[3] / renderScale,
  ];
}

function getPolyBounds(poly: OcrPoint[]): Bbox {
  const xs = poly.map((point) => point.x);
  const ys = poly.map((point) => point.y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
```

- [ ] **Step 9: Allow detector source override**

In `src/core/detectors/index.ts`, change the signature and source assignment:

```ts
export function runDetectors(
  lines: LineForScan[],
  rules: DetectorRule[] = ALL_RULES,
  source: Candidate['source'] = 'auto',
): Candidate[] {
```

Replace `source: 'auto',` with:

```ts
          source,
```

- [ ] **Step 10: Add OCR detection implementation**

Create `src/core/ocr/detect.ts`:

```ts
import { runDetectors } from '@/core/detectors';
import type { Candidate } from '@/types/domain';
import { lineToDetectorLine, ocrPixelBboxToPdfBbox } from './geometry';
import type { OcrDetectionInput } from './types';

export function detectOcrCandidates(input: OcrDetectionInput): Candidate[] {
  const detectorLines = input.lines.map((line) => lineToDetectorLine(line, 4));
  return runDetectors(detectorLines, undefined, 'ocr').map((candidate) => ({
    ...candidate,
    bbox: ocrPixelBboxToPdfBbox(candidate.bbox, input.renderScale),
    confidence: findLineConfidence(input.lines, candidate.pageIndex, candidate.text),
  }));
}

function findLineConfidence(lines: OcrDetectionInput['lines'], pageIndex: number, text: string): number {
  const line = lines.find((item) => item.pageIndex === pageIndex && item.text.includes(text));
  return typeof line?.score === 'number' ? line.score : 1;
}
```

- [ ] **Step 11: Add dedupe implementation**

Create `src/core/ocr/dedupe.ts`:

```ts
import type { Bbox, Candidate } from '@/types/domain';

export function removeDuplicateOcrCandidates(
  ocrCandidates: Candidate[],
  existingCandidates: Candidate[],
): Candidate[] {
  return ocrCandidates.filter(
    (ocr) => !existingCandidates.some((existing) => isDuplicate(ocr, existing)),
  );
}

function isDuplicate(ocr: Candidate, existing: Candidate): boolean {
  if (ocr.pageIndex !== existing.pageIndex) return false;
  if (ocr.category !== existing.category) return false;
  if (bboxIou(ocr.bbox, existing.bbox) < 0.5 && centerDistance(ocr.bbox, existing.bbox) > 12) {
    return false;
  }
  return normalizeText(ocr.text) === normalizeText(existing.text);
}

function normalizeText(value: string): string {
  return value.normalize('NFC').replace(/[^\p{Letter}\p{Number}]/gu, '').toLowerCase();
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

function centerDistance(a: Bbox, b: Bbox): number {
  const ax = (a[0] + a[2]) / 2;
  const ay = (a[1] + a[3]) / 2;
  const bx = (b[0] + b[2]) / 2;
  const by = (b[1] + b[3]) / 2;
  return Math.hypot(ax - bx, ay - by);
}
```

- [ ] **Step 12: Run OCR tests**

Run:

```bash
npx vitest run tests/unit/ocr tests/unit/detectors/index.test.ts
npm run lint
```

Expected: all commands pass.

- [ ] **Step 13: Commit**

Run:

```bash
git status --short
git add src/core/detectors/index.ts src/core/ocr tests/unit/ocr
git commit -m "feat(ocr): add OCR candidate conversion"
```

---

### Task 5: Page Content Profile and MuPDF Inspection

**Files:**
- Create: `src/core/pageContentProfile.ts`
- Create: `tests/unit/pageContentProfile.test.ts`
- Modify: `src/core/mupdfBridge.ts`
- Modify: `src/workers/pdf.worker.types.ts`
- Modify: `src/workers/pdf.worker.ts`

- [ ] **Step 1: Write page profile tests**

Create `tests/unit/pageContentProfile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildPageContentProfile } from '@/core/pageContentProfile';

describe('buildPageContentProfile', () => {
  it('marks a page with no text and a large image as OCR target', () => {
    const profile = buildPageContentProfile({
      pageIndex: 0,
      pageWidthPt: 200,
      pageHeightPt: 100,
      textCharCount: 0,
      textLineCount: 0,
      textBboxes: [],
      imageBlocks: [{ bbox: [0, 0, 200, 100], widthPx: 1200, heightPx: 600 }],
    });

    expect(profile.hasLargeImage).toBe(true);
    expect(profile.shouldAutoOcr).toBe(true);
  });

  it('does not mark a text page with a small logo as OCR target', () => {
    const profile = buildPageContentProfile({
      pageIndex: 0,
      pageWidthPt: 200,
      pageHeightPt: 100,
      textCharCount: 500,
      textLineCount: 20,
      textBboxes: [[10, 10, 190, 90]],
      imageBlocks: [{ bbox: [5, 5, 25, 25], widthPx: 80, heightPx: 80 }],
    });

    expect(profile.hasLargeImage).toBe(false);
    expect(profile.shouldAutoOcr).toBe(false);
  });
});
```

- [ ] **Step 2: Run failing page profile tests**

Run:

```bash
npx vitest run tests/unit/pageContentProfile.test.ts
```

Expected: FAIL because `src/core/pageContentProfile.ts` does not exist.

- [ ] **Step 3: Add page profile implementation**

Create `src/core/pageContentProfile.ts`:

```ts
import type { Bbox } from '@/types/domain';

export type PageImageBlock = {
  bbox: Bbox;
  widthPx: number;
  heightPx: number;
};

export type PageContentProfileInput = {
  pageIndex: number;
  pageWidthPt: number;
  pageHeightPt: number;
  textCharCount: number;
  textLineCount: number;
  textBboxes: Bbox[];
  imageBlocks: PageImageBlock[];
};

export type PageContentProfile = {
  pageIndex: number;
  pageAreaPt: number;
  textCharCount: number;
  textLineCount: number;
  textAreaRatio: number;
  imageBlocks: Array<PageImageBlock & { areaRatio: number }>;
  hasLargeImage: boolean;
  shouldAutoOcr: boolean;
};

const LARGE_IMAGE_AREA_RATIO = 0.25;
const LARGE_IMAGE_MIN_PIXELS = 250_000;
const LOW_TEXT_CHAR_COUNT = 40;

export function buildPageContentProfile(input: PageContentProfileInput): PageContentProfile {
  const pageAreaPt = Math.max(1, input.pageWidthPt * input.pageHeightPt);
  const textAreaRatio = unionArea(input.textBboxes) / pageAreaPt;
  const imageBlocks = input.imageBlocks.map((block) => ({
    ...block,
    areaRatio: bboxArea(block.bbox) / pageAreaPt,
  }));
  const hasLargeImage = imageBlocks.some(
    (block) =>
      block.areaRatio >= LARGE_IMAGE_AREA_RATIO ||
      block.widthPx * block.heightPx >= LARGE_IMAGE_MIN_PIXELS,
  );
  const shouldAutoOcr =
    (input.textCharCount === 0 && imageBlocks.length > 0) ||
    (input.textCharCount < LOW_TEXT_CHAR_COUNT && hasLargeImage) ||
    imageBlocks.some((block) => block.areaRatio >= LARGE_IMAGE_AREA_RATIO);

  return {
    pageIndex: input.pageIndex,
    pageAreaPt,
    textCharCount: input.textCharCount,
    textLineCount: input.textLineCount,
    textAreaRatio,
    imageBlocks,
    hasLargeImage,
    shouldAutoOcr,
  };
}

function bboxArea(bbox: Bbox): number {
  return Math.max(0, bbox[2] - bbox[0]) * Math.max(0, bbox[3] - bbox[1]);
}

function unionArea(boxes: Bbox[]): number {
  return boxes.reduce((sum, bbox) => sum + bboxArea(bbox), 0);
}
```

- [ ] **Step 4: Add MuPDF inspection API**

In `src/core/mupdfBridge.ts`, import the profile builder:

```ts
import { buildPageContentProfile, type PageContentProfile } from '@/core/pageContentProfile';
```

Add this exported function after `extractSpans`:

```ts
export async function inspectPageContent(pageIndex: number): Promise<PageContentProfile> {
  await ensureMupdfReady();
  const doc = requireDoc();
  const page = doc.loadPage(pageIndex);
  let stext: MupdfNS.StructuredText | null = null;
  try {
    const bounds = page.getBounds();
    const pageWidthPt = bounds[2] - bounds[0];
    const pageHeightPt = bounds[3] - bounds[1];
    let textCharCount = 0;
    let textLineCount = 0;
    const textBboxes: Bbox[] = [];
    const imageBlocks: Array<{ bbox: Bbox; widthPx: number; heightPx: number }> = [];
    let currentLineText = '';

    stext = page.toStructuredText();
    stext.walk({
      beginLine: (bbox) => {
        currentLineText = '';
        textBboxes.push([bbox[0], bbox[1], bbox[2], bbox[3]]);
      },
      onChar: (c) => {
        currentLineText += c;
        textCharCount += c.length;
      },
      endLine: () => {
        if (currentLineText.length > 0) textLineCount += 1;
        currentLineText = '';
      },
      onImageBlock: (bbox, _transform, image) => {
        imageBlocks.push({
          bbox: [bbox[0], bbox[1], bbox[2], bbox[3]],
          widthPx: image.getWidth(),
          heightPx: image.getHeight(),
        });
      },
    });

    return buildPageContentProfile({
      pageIndex,
      pageWidthPt,
      pageHeightPt,
      textCharCount,
      textLineCount,
      textBboxes,
      imageBlocks,
    });
  } finally {
    stext?.destroy();
    page.destroy();
  }
}
```

- [ ] **Step 5: Add PNG render API for OCR**

In `src/core/mupdfBridge.ts`, add this exported function after `renderPage`:

```ts
export async function renderPagePng(
  pageIndex: number,
  scale: number,
): Promise<{ png: Uint8Array; widthPx: number; heightPx: number; scale: number }> {
  const mupdf = await ensureMupdfReady();
  const doc = requireDoc();
  const page = doc.loadPage(pageIndex);
  let pixmap: MupdfNS.Pixmap | null = null;
  try {
    const matrix = mupdf.Matrix.scale(scale, scale);
    pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);
    const widthPx = pixmap.getWidth();
    const heightPx = pixmap.getHeight();
    const png = new Uint8Array(pixmap.asPNG());
    return { png, widthPx, heightPx, scale };
  } finally {
    pixmap?.destroy();
    page.destroy();
  }
}
```

- [ ] **Step 6: Expose new PDF worker methods**

In `src/workers/pdf.worker.types.ts`, import `PageContentProfile`:

```ts
import type { PageContentProfile } from '@/core/pageContentProfile';
```

Add methods to `PdfWorkerApi`:

```ts
  inspectPageContent(pageIndex: number): Promise<PageContentProfile>;
  renderPagePng(
    pageIndex: number,
    scale: number,
  ): Promise<{ png: Uint8Array; widthPx: number; heightPx: number; scale: number }>;
```

In `src/workers/pdf.worker.ts`, import and expose:

```ts
  inspectPageContent,
  renderPagePng,
```

Add API methods:

```ts
  async inspectPageContent(pageIndex) {
    return inspectPageContent(pageIndex);
  },
  async renderPagePng(pageIndex, scale) {
    const result = await renderPagePng(pageIndex, scale);
    return transfer(result, [result.png.buffer]);
  },
```

- [ ] **Step 7: Run tests**

Run:

```bash
npx vitest run tests/unit/pageContentProfile.test.ts tests/unit/mupdfBridge-init.test.ts
npm run lint
```

Expected: all commands pass.

- [ ] **Step 8: Commit**

Run:

```bash
git status --short
git add src/core/pageContentProfile.ts tests/unit/pageContentProfile.test.ts src/core/mupdfBridge.ts src/workers/pdf.worker.types.ts src/workers/pdf.worker.ts
git commit -m "feat(ocr): inspect PDF pages for OCR targeting"
```

---

### Task 6: OCR Worker and Client

**Files:**
- Create: `src/workers/ocr.worker.types.ts`
- Create: `src/workers/ocr.worker.ts`
- Create: `src/workers/ocrWorkerClient.ts`
- Create: `tests/unit/ocrWorkerClient.test.ts`

- [ ] **Step 1: Write OCR client singleton test**

Create `tests/unit/ocrWorkerClient.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const wrap = vi.fn((worker: unknown) => ({ worker }));
const WorkerCtor = vi.fn(function MockWorker(this: unknown) {});

vi.mock('comlink', () => ({ wrap }));
vi.mock('@/workers/ocr.worker.ts?worker', () => ({ default: WorkerCtor }));

describe('getOcrWorker', () => {
  beforeEach(() => {
    vi.resetModules();
    wrap.mockClear();
    WorkerCtor.mockClear();
  });

  it('creates and caches a single OCR worker remote', async () => {
    const { getOcrWorker } = await import('@/workers/ocrWorkerClient');
    const first = getOcrWorker();
    const second = getOcrWorker();

    expect(first).toBe(second);
    expect(WorkerCtor).toHaveBeenCalledTimes(1);
    expect(wrap).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run failing client test**

Run:

```bash
npx vitest run tests/unit/ocrWorkerClient.test.ts
```

Expected: FAIL because OCR worker client does not exist.

- [ ] **Step 3: Add OCR worker types**

Create `src/workers/ocr.worker.types.ts`:

```ts
import type { OcrBackend, NormalizedOcrResult } from '@/core/ocr/types';

export type RecognizeImageRequest = {
  pageIndex: number;
  png: Uint8Array;
  backend?: OcrBackend;
};

export interface OcrWorkerApi {
  warmup(backend?: OcrBackend): Promise<{ backend: OcrBackend }>;
  recognizePng(request: RecognizeImageRequest): Promise<NormalizedOcrResult>;
  dispose(backend?: OcrBackend): Promise<void>;
}
```

- [ ] **Step 4: Add OCR worker implementation**

Create `src/workers/ocr.worker.ts`:

```ts
import { expose } from 'comlink';
import type { OcrResult } from '@paddleocr/paddleocr-js';
import { normalizeOcrResult } from '@/core/ocr/normalize';
import type { OcrBackend } from '@/core/ocr/types';
import type { OcrWorkerApi } from './ocr.worker.types';

const KOREAN_REC_MODEL_NAME = 'korean_PP-OCRv5_mobile_rec';
const KOREAN_REC_MODEL_ASSET = '/models/paddleocr/korean_PP-OCRv5_mobile_rec_onnx.tar';
const ORT_WASM_PATHS = '/ort/';
const DEFAULT_BACKEND: OcrBackend = 'auto';

type OcrEngine = {
  predict(input: Blob): Promise<OcrResult[]>;
  dispose?: () => Promise<void>;
};

const engines = new Map<OcrBackend, Promise<OcrEngine>>();

const api: OcrWorkerApi = {
  async warmup(backend = DEFAULT_BACKEND) {
    await getOcrEngine(backend);
    return { backend };
  },
  async recognizePng({ pageIndex, png, backend = DEFAULT_BACKEND }) {
    const engine = await getOcrEngine(backend);
    const blob = new Blob([png.buffer as ArrayBuffer], { type: 'image/png' });
    const [result] = await engine.predict(blob);
    if (!result) {
      throw new Error('OCR 결과를 받지 못했습니다.');
    }
    return normalizeOcrResult(result, pageIndex);
  },
  async dispose(backend) {
    if (backend) {
      const engine = engines.get(backend);
      if (!engine) return;
      await (await engine).dispose?.();
      engines.delete(backend);
      return;
    }
    await Promise.all(
      Array.from(engines.values()).map(async (engine) => {
        await (await engine).dispose?.();
      }),
    );
    engines.clear();
  },
};

async function getOcrEngine(backend: OcrBackend): Promise<OcrEngine> {
  let engine = engines.get(backend);
  if (!engine) {
    engine = createOcrEngine(backend);
    engines.set(backend, engine);
  }
  return engine;
}

async function createOcrEngine(backend: OcrBackend): Promise<OcrEngine> {
  const { PaddleOCR } = await import('@paddleocr/paddleocr-js');
  return PaddleOCR.create({
    textRecognitionModelName: KOREAN_REC_MODEL_NAME,
    textRecognitionModelAsset: { url: KOREAN_REC_MODEL_ASSET },
    ortOptions: {
      backend,
      wasmPaths: ORT_WASM_PATHS,
      numThreads: 1,
      simd: true,
    },
  });
}

expose(api);
```

- [ ] **Step 5: Add OCR worker client**

Create `src/workers/ocrWorkerClient.ts`:

```ts
import { wrap, type Remote } from 'comlink';
import OcrWorker from './ocr.worker.ts?worker';
import type { OcrWorkerApi } from './ocr.worker.types';

let cached: Remote<OcrWorkerApi> | null = null;

export function getOcrWorker(): Remote<OcrWorkerApi> {
  if (!cached) {
    cached = wrap<OcrWorkerApi>(new OcrWorker());
  }
  return cached;
}
```

- [ ] **Step 6: Run worker tests**

Run:

```bash
npx vitest run tests/unit/ocrWorkerClient.test.ts
npm run lint
```

Expected: both commands pass.

- [ ] **Step 7: Commit**

Run:

```bash
git status --short
git add src/workers/ocr.worker.types.ts src/workers/ocr.worker.ts src/workers/ocrWorkerClient.ts tests/unit/ocrWorkerClient.test.ts
git commit -m "feat(ocr): add PaddleOCR worker"
```

---

### Task 7: OCR Detection Hook and Queue

**Files:**
- Create: `src/hooks/useOcrDetect.ts`
- Create: `tests/integration/ocr-flow.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write OCR flow integration test**

Create `tests/integration/ocr-flow.test.tsx`:

```tsx
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOcrDetect } from '@/hooks/useOcrDetect';
import { useAppStore } from '@/state/store';

const { fakePdfWorker, fakeOcrWorker } = vi.hoisted(() => ({
  fakePdfWorker: {
    inspectPageContent: vi.fn(),
    renderPagePng: vi.fn(),
  },
  fakeOcrWorker: {
    recognizePng: vi.fn(),
  },
}));

vi.mock('@/workers/pdfWorkerClient', () => ({
  getPdfWorker: vi.fn().mockResolvedValue(fakePdfWorker),
}));

vi.mock('@/workers/ocrWorkerClient', () => ({
  getOcrWorker: vi.fn(() => fakeOcrWorker),
}));

async function waitForStore(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('store condition was not met');
}

describe('OCR detection flow', () => {
  let root: Root | null = null;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useAppStore.getState().reset();
    vi.clearAllMocks();
    fakePdfWorker.inspectPageContent.mockResolvedValue({
      pageIndex: 0,
      pageAreaPt: 10000,
      textCharCount: 0,
      textLineCount: 0,
      textAreaRatio: 0,
      imageBlocks: [{ bbox: [0, 0, 100, 100], widthPx: 1000, heightPx: 1000, areaRatio: 1 }],
      hasLargeImage: true,
      shouldAutoOcr: true,
    });
    fakePdfWorker.renderPagePng.mockResolvedValue({
      png: new Uint8Array([1, 2, 3]),
      widthPx: 200,
      heightPx: 100,
      scale: 2,
    });
    fakeOcrWorker.recognizePng.mockResolvedValue({
      lines: [
        {
          id: 'line-1',
          pageIndex: 0,
          text: '000000-0000001',
          score: 0.93,
          poly: [
            { x: 0, y: 0 },
            { x: 140, y: 0 },
            { x: 140, y: 20 },
            { x: 0, y: 20 },
          ],
        },
      ],
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    root = null;
    useAppStore.getState().reset();
  });

  it('auto-runs OCR for image pages and stores OCR candidates', async () => {
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
    await act(async () => root?.render(<Probe />));

    await waitForStore(() => useAppStore.getState().candidates.some((c) => c.source === 'ocr'));

    expect(fakePdfWorker.inspectPageContent).toHaveBeenCalledWith(0);
    expect(fakePdfWorker.renderPagePng).toHaveBeenCalledWith(0, 2);
    expect(useAppStore.getState().boxes[useAppStore.getState().candidates[0]!.id]).toMatchObject({
      source: 'ocr',
      category: 'rrn',
      enabled: true,
    });
  });

  it('runs manual page OCR even when the page is not an automatic OCR target', async () => {
    fakePdfWorker.inspectPageContent.mockResolvedValue({
      pageIndex: 0,
      pageAreaPt: 10000,
      textCharCount: 500,
      textLineCount: 20,
      textAreaRatio: 0.8,
      imageBlocks: [],
      hasLargeImage: false,
      shouldAutoOcr: false,
    });

    function Probe() {
      useOcrDetect();
      return null;
    }

    useAppStore.getState().setDoc({
      kind: 'ready',
      fileName: 'text.pdf',
      pages: [{ index: 0, widthPt: 100, heightPt: 100, rotation: 0 }],
    });

    root = createRoot(document.createElement('div'));
    await act(async () => root?.render(<Probe />));
    await act(async () => useAppStore.getState().requestOcrPage(0));

    await waitForStore(() => useAppStore.getState().candidates.some((c) => c.source === 'ocr'));

    expect(fakePdfWorker.renderPagePng).toHaveBeenCalledWith(0, 2);
    expect(useAppStore.getState().ocrRequest).toEqual({ kind: 'idle' });
  });
});
```

- [ ] **Step 2: Run failing integration test**

Run:

```bash
npx vitest run tests/integration/ocr-flow.test.tsx
```

Expected: FAIL because `useOcrDetect` does not exist.

- [ ] **Step 3: Add OCR hook**

Create `src/hooks/useOcrDetect.ts`:

```ts
import { useEffect } from 'react';
import { detectOcrCandidates } from '@/core/ocr/detect';
import { removeDuplicateOcrCandidates } from '@/core/ocr/dedupe';
import { useAppStore } from '@/state/store';
import { getOcrWorker } from '@/workers/ocrWorkerClient';
import { getPdfWorker } from '@/workers/pdfWorkerClient';

const OCR_SCALE = 2;

export function useOcrDetect() {
  const doc = useAppStore((s) => s.doc);
  const docEpoch = useAppStore((s) => s.docEpoch);
  const currentPage = useAppStore((s) => s.currentPage);
  const ocrRequest = useAppStore((s) => s.ocrRequest);

  useEffect(() => {
    if (doc.kind !== 'ready') return;

    let cancelled = false;
    const request = ocrRequest;
    const requestNonce = request.kind === 'idle' ? null : request.nonce;
    const forcedPages =
      request.kind === 'page'
        ? new Set([request.pageIndex])
        : request.kind === 'all'
          ? new Set(doc.pages.map((page) => page.index))
          : new Set<number>();
    const pages = [...doc.pages].sort((a, b) => {
      if (a.index === currentPage) return -1;
      if (b.index === currentPage) return 1;
      return a.index - b.index;
    });

    const isStale = () =>
      cancelled ||
      useAppStore.getState().docEpoch !== docEpoch ||
      useAppStore.getState().doc.kind !== 'ready';

    void (async () => {
      const pdf = await getPdfWorker();
      const ocr = getOcrWorker();
      const targets: number[] = [];

      for (const page of pages) {
        if (isStale()) return;
        const force = forcedPages.has(page.index);
        const alreadyHasOcr = useAppStore
          .getState()
          .candidates.some((candidate) => candidate.source === 'ocr' && candidate.pageIndex === page.index);
        if (!force && alreadyHasOcr) {
          continue;
        }
        if (force) {
          targets.push(page.index);
          continue;
        }
        const profile = await pdf.inspectPageContent(page.index);
        if (profile.shouldAutoOcr) targets.push(profile.pageIndex);
      }

      if (targets.length === 0 || isStale()) {
        if (requestNonce !== null) useAppStore.getState().clearOcrRequest(requestNonce);
        return;
      }

      useAppStore.getState().setOcrProgress({
        done: 0,
        total: targets.length,
        currentPage: null,
        byPage: Object.fromEntries(targets.map((pageIndex) => [pageIndex, { status: 'queued' as const }])),
      });

      let done = 0;
      for (const pageIndex of targets) {
        if (isStale()) return;
        useAppStore.getState().setOcrProgress({
          done,
          total: targets.length,
          currentPage: pageIndex,
          byPage: {
            ...useAppStore.getState().ocrProgress.byPage,
            [pageIndex]: { status: 'running' },
          },
        });

        try {
          const rendered = await pdf.renderPagePng(pageIndex, OCR_SCALE);
          const result = await ocr.recognizePng({
            pageIndex,
            png: rendered.png,
          });
          const ocrCandidates = detectOcrCandidates({
            pageIndex,
            renderScale: rendered.scale,
            lines: result.lines,
          });
          const state = useAppStore.getState();
          const existing = state.candidates.filter((candidate) => candidate.source !== 'ocr');
          state.addOcrCandidates(removeDuplicateOcrCandidates(ocrCandidates, existing));
          done += 1;
          state.setOcrProgress({
            done,
            total: targets.length,
            currentPage: null,
            byPage: {
              ...state.ocrProgress.byPage,
              [pageIndex]: { status: 'done' },
            },
          });
        } catch (error) {
          const state = useAppStore.getState();
          state.setOcrProgress({
            done,
            total: targets.length,
            currentPage: null,
            byPage: {
              ...state.ocrProgress.byPage,
              [pageIndex]: {
                status: 'failed',
                message: error instanceof Error ? error.message : String(error),
              },
            },
          });
        }
      }

      if (requestNonce !== null) useAppStore.getState().clearOcrRequest(requestNonce);
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, docEpoch, currentPage, ocrRequest]);
}
```

- [ ] **Step 4: Mount OCR hook in App**

In `src/App.tsx`, import and call the hook:

```ts
import { useOcrDetect } from '@/hooks/useOcrDetect';
```

Inside `App()` after `useAutoDetect();`:

```ts
  useOcrDetect();
```

- [ ] **Step 5: Run integration test**

Run:

```bash
npx vitest run tests/integration/ocr-flow.test.tsx
npm run lint
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

Run:

```bash
git status --short
git add src/hooks/useOcrDetect.ts src/App.tsx tests/integration/ocr-flow.test.tsx
git commit -m "feat(ocr): run OCR for image-based pages"
```

---

### Task 8: OCR UI Integration

**Files:**
- Create: `src/components/OcrStatus.tsx`
- Modify: `src/components/CandidatePanel.tsx`
- Modify: `src/components/Toolbar.tsx`
- Modify: `src/App.tsx`
- Create: `tests/unit/components/OcrStatus.test.tsx`

- [ ] **Step 1: Write OcrStatus component test**

Create `tests/unit/components/OcrStatus.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { OcrStatus } from '@/components/OcrStatus';
import { useAppStore } from '@/state/store';

describe('OcrStatus', () => {
  beforeEach(() => useAppStore.getState().reset());

  it('renders compact progress when OCR is active', () => {
    useAppStore.getState().setOcrProgress({
      done: 1,
      total: 3,
      currentPage: 1,
      byPage: {
        0: { status: 'done' },
        1: { status: 'running' },
        2: { status: 'queued' },
      },
    });

    render(<OcrStatus />);

    expect(screen.getByText('OCR 1/3 페이지')).toBeInTheDocument();
    expect(screen.getByText('p2 처리 중')).toBeInTheDocument();
  });

  it('renders nothing before OCR starts', () => {
    const { container } = render(<OcrStatus />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run failing UI test**

Run:

```bash
npx vitest run tests/unit/components/OcrStatus.test.tsx
```

Expected: FAIL because `OcrStatus` does not exist.

- [ ] **Step 3: Add OCR status component**

Create `src/components/OcrStatus.tsx`:

```tsx
import { Loader2, ScanText, AlertTriangle } from 'lucide-react';
import { useAppStore } from '@/state/store';
import { Badge } from '@/components/ui/badge';

export function OcrStatus() {
  const progress = useAppStore((s) => s.ocrProgress);

  if (progress.total === 0) return null;

  const failedCount = Object.values(progress.byPage).filter((page) => page.status === 'failed').length;

  return (
    <div className="mb-3 rounded-md border bg-muted/30 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        {progress.currentPage === null ? (
          <ScanText className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
        <span className="font-medium">OCR {progress.done}/{progress.total} 페이지</span>
        {failedCount > 0 && (
          <Badge variant="destructive" className="ml-auto gap-1">
            <AlertTriangle className="h-3 w-3" />
            실패 {failedCount}
          </Badge>
        )}
      </div>
      {progress.currentPage !== null && (
        <p className="mt-1 text-muted-foreground">p{progress.currentPage + 1} 처리 중</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Show OCR status in App sidebar**

In `src/App.tsx`, import:

```ts
import { OcrStatus } from '@/components/OcrStatus';
```

Inside the ready sidebar before `<CandidatePanel />`, add:

```tsx
                <OcrStatus />
```

- [ ] **Step 5: Include OCR boxes in CandidatePanel**

In `src/components/CandidatePanel.tsx`, update `DetectedBox`:

```ts
type DetectedBox = RedactionBox & {
  category: DetectionCategory;
  source: 'auto' | 'ner' | 'ocr';
};
```

Update the detected box filter:

```ts
          (b.source === 'auto' || b.source === 'ner' || b.source === 'ocr') && b.category !== undefined,
```

Add OCR boxes:

```ts
  const ocrBoxes = useMemo(
    () => detectedBoxes.filter((b) => b.source === 'ocr'),
    [detectedBoxes],
  );
```

Update `totalAuto`:

```ts
  const totalAuto = regexBoxes.length + ocrBoxes.length + (showNerUi ? nerBoxes.length : 0);
```

After `REGEX_CATEGORIES.map(...)`, render OCR groups:

```tsx
        {REGEX_CATEGORIES.map((cat) => {
          const items = ocrBoxes.filter((b) => b.category === cat);
          return (
            <CategoryGroup
              key={`ocr-${cat}`}
              cat={cat}
              source="ocr"
              items={items}
              enabled={cats[cat]}
              selectedBoxId={selectedBoxId}
              candidateById={candidateById}
              onToggleCategory={() => toggleCat(cat)}
              onToggleBox={toggle}
              onGoTo={goToPage}
              onFocusBox={(id, page) => {
                goToPage(page);
                focusBox(id);
              }}
            />
          );
        })}
```

Update `GroupProps` source:

```ts
  source: 'regex' | 'ner' | 'ocr';
```

Update `SourceBadge`:

```tsx
function SourceBadge({ source }: { source: 'regex' | 'ner' | 'ocr' }) {
  if (source === 'regex') return <Badge variant="secondary">정규식</Badge>;
  if (source === 'ocr') return <Badge variant="outline">OCR</Badge>;
  return <Badge variant="warning">NER · 검수 필요</Badge>;
}
```

In row confidence display, show OCR confidence too:

```tsx
                          {(b.source === 'ner' || b.source === 'ocr') && typeof confidence === 'number' && (
                            <span className="ml-auto text-[11px] text-muted-foreground">
                              {confidence.toFixed(2)}
                            </span>
                          )}
```

- [ ] **Step 6: Add manual OCR toolbar buttons**

In `src/components/Toolbar.tsx`, update the icon import:

```ts
import { FolderOpen, Undo2, Redo2, HelpCircle, Shield, ScanText, Files } from 'lucide-react';
```

Inside `Toolbar`, add selectors after `docKind`:

```ts
  const currentPage = useAppStore((s) => s.currentPage);
  const requestOcrPage = useAppStore((s) => s.requestOcrPage);
  const requestOcrAll = useAppStore((s) => s.requestOcrAll);
```

After the help button separator block and before the optional NER button, add:

```tsx
        <Separator orientation="vertical" className="h-6" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              onClick={() => requestOcrPage(currentPage)}
              disabled={docKind !== 'ready'}
              aria-label="현재 페이지 OCR"
            >
              <ScanText />
            </Button>
          </TooltipTrigger>
          <TooltipContent>현재 페이지 OCR</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              onClick={requestOcrAll}
              disabled={docKind !== 'ready'}
              aria-label="전체 문서 OCR"
            >
              <Files />
            </Button>
          </TooltipTrigger>
          <TooltipContent>전체 문서 OCR</TooltipContent>
        </Tooltip>
```

- [ ] **Step 7: Run UI tests**

Run:

```bash
npx vitest run tests/unit/components/OcrStatus.test.tsx tests/unit/components/BoxOverlay.test.tsx
npm run lint
```

Expected: all commands pass.

- [ ] **Step 8: Commit**

Run:

```bash
git status --short
git add src/components/OcrStatus.tsx src/components/CandidatePanel.tsx src/components/Toolbar.tsx src/App.tsx tests/unit/components/OcrStatus.test.tsx
git commit -m "feat(ocr): surface OCR progress and candidates"
```

---

### Task 9: Deployment Updates

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `infra/pulumi/components/s3-site-bucket.ts`
- Modify: `infra/pulumi/README.md`
- Modify: `README.md`

- [ ] **Step 1: Update GitHub Actions to upload all dist assets**

Replace the `Upload to S3` step in `.github/workflows/deploy.yml` with:

```yaml
      - name: Upload HTML to S3
        run: |
          aws s3 cp dist/index.html s3://${{ env.S3_BUCKET }}/index.html \
            --content-type "text/html; charset=utf-8" \
            --cache-control "public, max-age=0, must-revalidate"

      - name: Upload static assets to S3
        run: |
          aws s3 sync dist/ s3://${{ env.S3_BUCKET }}/ \
            --delete \
            --exclude "index.html" \
            --cache-control "public, max-age=31536000, immutable"
```

- [ ] **Step 2: Replace Pulumi single-file upload with recursive dist upload**

In `infra/pulumi/components/s3-site-bucket.ts`, add this helper above the class:

```ts
type DistFile = {
    absolutePath: string;
    relativePath: string;
};

function listDistFiles(rootDir: string): DistFile[] {
    if (!fs.existsSync(rootDir)) return [];
    const out: DistFile[] = [];
    for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
        const absolutePath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listDistFiles(absolutePath).map((file) => ({
                absolutePath: file.absolutePath,
                relativePath: path.join(entry.name, file.relativePath),
            })));
        } else if (entry.isFile()) {
            out.push({ absolutePath, relativePath: entry.name });
        }
    }
    return out;
}

function contentTypeFor(filePath: string): string | undefined {
    if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
    if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) return "application/javascript";
    if (filePath.endsWith(".css")) return "text/css";
    if (filePath.endsWith(".wasm")) return "application/wasm";
    if (filePath.endsWith(".json")) return "application/json";
    if (filePath.endsWith(".tar")) return "application/x-tar";
    return undefined;
}

function cacheControlFor(relativePath: string): string {
    return relativePath === "index.html"
        ? "public, max-age=0, must-revalidate"
        : "public, max-age=31536000, immutable";
}
```

Replace the existing `dist/index.html 단일 파일 업로드` block with:

```ts
        const distFiles = listDistFiles(args.distPath);

        for (const file of distFiles) {
            const key = file.relativePath.split(path.sep).join("/");
            const etag = crypto.createHash("md5").update(fs.readFileSync(file.absolutePath)).digest("hex");
            new aws.s3.BucketObjectv2(`${name}-${key.replace(/[^a-zA-Z0-9-]/g, "-")}`, {
                bucket: this.bucket.id,
                key,
                source: new pulumi.asset.FileAsset(file.absolutePath),
                contentType: contentTypeFor(file.absolutePath),
                cacheControl: cacheControlFor(key),
                etag,
            }, { parent: this });
        }
```

- [ ] **Step 3: Update infra README deploy wording**

In `infra/pulumi/README.md`, replace references to uploading `dist/index.html` with:

```md
On redeploy, `pulumi up` scans `dist/**` and uploads every emitted asset. `index.html` uses a short cache policy; hashed JS/CSS/WASM/model assets use a long immutable cache policy.
```

- [ ] **Step 4: Update root README build section**

In `README.md`, replace the single HTML constraint and build output text with:

```md
- **서버 배포형 정적 사이트.** `npm run build` 는 `dist/` 아래에 HTML, JS chunks, WASM, OCR/ONNX runtime 자산을 생성합니다.
- **PDF 는 외부로 나가지 않습니다.** 서버는 앱과 모델 파일만 제공합니다. PDF 원본, 렌더링 이미지, OCR 결과는 브라우저 메모리 안에서 처리됩니다.
```

Update build commands:

```md
npm run dev      # 개발 서버 (http://localhost:5173)
npm run build    # 서버 배포용 multi-asset dist/ 산출
npm run preview  # 빌드 결과 로컬 확인
npm test         # 단위 + 통합 테스트 (vitest)
npm run lint     # tsc -b 타입 체크
```

- [ ] **Step 5: Run docs/build checks**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands pass, and `npm run build` ends with `외부 URL 0개`.

- [ ] **Step 6: Commit**

Run:

```bash
git status --short
git add .github/workflows/deploy.yml infra/pulumi/components/s3-site-bucket.ts infra/pulumi/README.md README.md
git commit -m "chore(deploy): publish multi-asset static site"
```

---

### Task 10: End-to-End Smoke and Final Verification

**Files:**
- Modify: `tests/e2e/pdf-ocr.spec.ts`
- Modify: `docs/release-checklist.md`

- [ ] **Step 1: Update Playwright OCR smoke expectations**

In `tests/e2e/pdf-ocr.spec.ts`, make the smoke test assert that OCR status appears and at least one OCR candidate is shown for the sample scanned PDF:

```ts
await expect(page.getByText(/OCR \d+\/\d+ 페이지/)).toBeVisible({ timeout: 60_000 });
await expect(page.getByText('OCR')).toBeVisible({ timeout: 60_000 });
```

Keep the existing PDF upload and apply assertions in the file.

- [ ] **Step 2: Update release checklist**

In `docs/release-checklist.md`, add these verification items under the build/test checklist:

```md
- [ ] `npm run build` creates multi-asset `dist/` output and `verify-no-external` reports external URL 0.
- [ ] `public/models/paddleocr/korean_PP-OCRv5_mobile_rec_onnx.tar` exists before build.
- [ ] `public/ort/` exists before build and contains ONNX Runtime `.wasm` files.
- [ ] OCR smoke: scanned PDF opens, OCR status appears, OCR candidates render in the candidate panel, and selected OCR boxes are redacted in the saved PDF.
```

- [ ] **Step 3: Run full verification**

Run:

```bash
npm test
npm run lint
npm run build
npm run preview
```

Expected:

- `npm test` passes.
- `npm run lint` passes.
- `npm run build` passes and reports external URL 0.
- `npm run preview` starts a local preview server. Stop it with Ctrl+C after manual smoke.

- [ ] **Step 4: Run browser smoke**

Run:

```bash
npm run preview -- --host 127.0.0.1
```

Open the preview URL and verify:

- Upload `tests/fixtures/korean-sample.pdf`.
- OCR status appears when the PDF has image content.
- OCR candidates show `OCR` badges in the candidate panel.
- Applying anonymization downloads a PDF.
- DevTools console has no OCR asset 404 errors for `/models/paddleocr/` or `/ort/`.

- [ ] **Step 5: Commit**

Run:

```bash
git status --short
git add tests/e2e/pdf-ocr.spec.ts docs/release-checklist.md
git commit -m "test(ocr): cover OCR smoke verification"
```

---

## Self-Review Checklist

- Spec requirement 1: browser-only PDF/OCR handling is covered by Tasks 5, 6, 7, and 9.
- Spec requirement 2: MuPDF remains the only PDF engine; no `pdfjs-dist` dependency is introduced.
- Spec requirement 3: OCR worker receives MuPDF-rendered PNG bytes in Tasks 5 and 6.
- Spec requirement 4: OCR candidates join existing store and CandidatePanel in Tasks 3, 7, and 8.
- Spec requirement 5: OCR uses regex detectors only in Task 4.
- Spec requirement 6: partial bbox estimation is implemented in Task 4.
- Spec requirement 7: default build becomes multi-asset in Task 1.
- Spec requirement 8: same-origin assets and directory-wide external URL checks are covered by Tasks 1, 2, and 9.
- Verification commands are listed per task and in Task 10.
- Commit boundaries are task-sized and stage explicit paths only.
