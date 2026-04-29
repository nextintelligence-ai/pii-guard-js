# NER 통합 PoC (M0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OpenAI privacy-filter NER 모델을 `pii-guard-js` 단일 HTML 환경에 끼워넣을 수 있는지 검증한다 — 영문/한국어 char offset 정확도, NLP 빌드 사이즈(예산 35MB), file:// 환경의 WebGPU/WASM 동작 가능 여부를 측정해 후속 본구현 plan 의 가정을 확정한다.

**Architecture:** 임시 진입점(`src/poc/ner-poc.ts`)과 vite 의 `mode === 'nlp'` 분기로 PoC 빌드를 만든다. transformers.js 를 메인 스레드에서 직접 호출(워커는 본구현 단계에서)해 측정에만 집중. 모든 측정 결과는 `docs/poc-ner-report.md` 에 기록한다.

**Tech Stack:** Vite 5 / `@huggingface/transformers` / onnxruntime-web (transformers.js 의존) / Vitest 2 / 기존 React 19 + MuPDF.js 그대로

---

## 핵심 질문 (PoC 가 답해야 할 것)

| Q | 검증 방법 | 결정에 미치는 영향 |
|---|---|---|
| Q1. transformers.js 가 file:// 단일 HTML 에서 동작하는가? | NLP 모드로 빌드한 `dist-nlp/index.html` 을 더블클릭 → PoC 진입점에서 로드 | 안 되면 spec N7/N8 변경 (서버 모드 또는 별도 백엔드 검토) |
| Q2. char offset 이 영문에서 정확한가? | 알려진 입력에서 entity.start/end 가 글자 단위로 일치 | 부정확하면 spanMap 알고리즘에 char-level 재정렬 layer 추가 필요 |
| Q3. char offset 이 한국어에서 정확한가? | 한국 이름/주소 픽스처에 대해 동일 측정 | 부정확하면 한국어 별도 처리 (또는 영문만 지원으로 spec 축소) |
| Q4. 한국어 검출 baseline 은 어느 정도인가? | 한국어 픽스처에서 검출되는 카테고리·score 기록 | 너무 낮으면 spec 1.2 (비범위) 에 "한국어 NER 은 보조 도구" 명시 강화 |
| Q5. NLP 빌드 사이즈가 35MB 예산 안에 들어가는가? | `vite build --mode nlp` 결과 측정 | 초과 시 spec N7 예산 상향 또는 wasm 분리(BYO 백엔드) 등 옵션 |
| Q6. WebGPU 가 file:// 에서 활성되는가? Chrome/Edge/Safari? | 각 브라우저로 산출 HTML 더블클릭 → device 확인 | 안 되면 WASM 단독, 추론 시간 목표 재설정 |

---

## File Structure

| 파일 | 역할 | 변경 |
|---|---|---|
| `package.json` | scripts + transformers.js 의존성 | `build:nlp`, `dev:nlp` 추가, `@huggingface/transformers` 추가 |
| `vite.config.ts` | NLP 모드 진입점 분기 | `mode === 'nlp'` 분기, allowRemoteModels=false 환경변수 주입 |
| `scripts/verify-build-size.mjs` | 사이즈 가드 | `--budget=<MB>` argument 지원 |
| `src/vite-env.d.ts` | Vite env 타입 | `MODE: 'production' \| 'nlp'` 타입 narrow |
| `src/poc/ner-poc.ts` | PoC 진입점 (임시) | **신규** — pipeline 로드, 측정 함수 |
| `src/poc/poc-fixtures.ts` | 영문/한국어 텍스트 픽스처 | **신규** |
| `index-nlp.html` | NLP 모드 진입 HTML | **신규** — `<script type="module" src="/src/poc/ner-poc.ts">` |
| `tests/unit/charOffset-baseline.test.ts` | 영문 char offset 정확도 회귀 테스트 | **신규** (모킹된 entity 출력으로 알고리즘만 검증) |
| `docs/poc-ner-report.md` | PoC 측정 결과 보고서 | **신규** |

PoC 종료 시점에 `src/poc/`, `index-nlp.html` 은 본구현 plan 에서 정식 파일로 대체되거나 폐기된다. PoC plan 은 학습이 목적이므로, 산출 코드의 영구화 여부는 마지막 task 에서 결정한다.

---

## Task 1: NLP 모드 빌드 골격

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `scripts/verify-build-size.mjs`
- Modify: `src/vite-env.d.ts`
- Create: `index-nlp.html`

- [ ] **Step 1: `@huggingface/transformers` 설치**

```bash
npm install --save @huggingface/transformers
```

Expected: `package.json` 의 `dependencies` 에 `@huggingface/transformers` 가 추가된다. 사이즈는 즉시 측정하지 않고 Task 5 에서.

- [ ] **Step 2: `package.json` 에 NLP 모드 스크립트 추가**

```jsonc
// package.json scripts 섹션에 추가 (기존 항목 유지)
"dev:nlp": "vite --mode nlp",
"build:nlp": "tsc -b && vite build --mode nlp",
"prebuild:nlp": "node scripts/embed-wasm.mjs",
"postbuild:nlp": "node scripts/verify-no-external.mjs && node scripts/verify-build-size.mjs --budget=35"
```

`prebuild:nlp` 는 기존 `embed-wasm.mjs` 만 재사용 (mupdf wasm 임베드). PoC 단계에서는 onnxruntime-web wasm 임베드는 transformers.js 가 어떻게 노출하는지 본 뒤 결정 — Task 5 에서 사이즈 결과 보고 처리 방향 결정.

- [ ] **Step 3: `scripts/verify-build-size.mjs` 가 `--budget=<MB>` 인자를 받도록 수정**

기존 스크립트를 열어 하드코딩된 18MB 자리에 인자 파싱을 끼운다. 인자 없으면 기존 18MB.

```js
// scripts/verify-build-size.mjs (구조 예시 — 실제 파일의 export 형태 유지)
const argBudget = process.argv.find((a) => a.startsWith('--budget='));
const BUDGET_MB = argBudget ? Number(argBudget.split('=')[1]) : 18;
const BUDGET_BYTES = BUDGET_MB * 1024 * 1024;
```

기존 메시지 (`예산: 18MB`) 도 동적으로 `${BUDGET_MB}MB` 로 바꾼다.

- [ ] **Step 4: `vite.config.ts` 의 `mode === 'nlp'` 분기**

```ts
// vite.config.ts (defineConfig 콜백 내부)
const isNlp = mode === 'nlp';
const inputHtml = isNlp ? 'index-nlp.html' : 'index.html';

return {
  // 기존 설정 유지
  build: {
    // 기존 옵션 유지
    rollupOptions: { input: inputHtml },
    outDir: isNlp ? 'dist-nlp' : 'dist',
  },
  define: {
    // transformers.js 가 hub 호출 시도하지 않도록 컴파일 타임 가드
    'globalThis.__NER_ALLOW_REMOTE__': JSON.stringify(false),
  },
};
```

기존 export 가 함수형이 아니면 함수형 (`defineConfig(({ mode }) => { ... })`) 으로 변환한다. 기존 plugin 배열 (`stripMupdfWasmAsset`, `viteSingleFile` 등) 은 그대로 유지하되 NLP 모드에서도 동일하게 적용.

- [ ] **Step 5: `src/vite-env.d.ts` 에 모드 타입 추가**

```ts
// src/vite-env.d.ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly MODE: 'production' | 'development' | 'nlp';
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 6: `index-nlp.html` 생성 (PoC 진입점)**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1.0" />
    <title>pdf-anony NLP PoC</title>
  </head>
  <body>
    <div id="poc-root">
      <h1>NLP PoC</h1>
      <p>콘솔을 열어 PoC 결과를 확인하세요.</p>
    </div>
    <script type="module" src="/src/poc/ner-poc.ts"></script>
  </body>
</html>
```

- [ ] **Step 7: 기본 빌드 회귀 0 확인**

Run: `npm run build`
Expected: PASS (기존 18MB 산출). 이 task 가 정규식 빌드를 깨뜨리지 않았음을 보장.

- [ ] **Step 8: NLP 모드 빈 진입점이 빌드되는지 확인**

`src/poc/ner-poc.ts` 를 빈 파일로 먼저 만든다 (Task 2 에서 채움):

```ts
// src/poc/ner-poc.ts
console.log('[ner-poc] entry');
```

Run: `npm run build:nlp`
Expected: PASS, `dist-nlp/index.html` 생성, postbuild 가 35MB 예산 안에 통과 (현재는 transformers.js import 가 없으므로 통과해야 함). 이 시점의 산출 사이즈를 보고서에 기록할 baseline 으로 메모.

- [ ] **Step 9: 커밋**

```bash
git add package.json package-lock.json vite.config.ts scripts/verify-build-size.mjs src/vite-env.d.ts index-nlp.html src/poc/ner-poc.ts
git commit -m "chore(nlp): NLP 모드 빌드 골격 추가 (PoC 진입점, build:nlp, --budget 인자)"
```

---

## Task 2: 영문 추론 PoC (Q1, Q2 의 정성 검증)

**Files:**
- Modify: `src/poc/ner-poc.ts`
- Create: `src/poc/poc-fixtures.ts`

**전제:** PoC 실행자(작업자)가 OpenAI privacy-filter 모델 디렉토리(`config.json`, `tokenizer.json`, `model.onnx` 등)를 로컬에 받아두고 실행 직전에 파일 입력으로 선택한다. 사이즈 부담을 피하려면 작은 quantized 변형(예: q4) 을 우선 받는다.

- [ ] **Step 1: 픽스처 파일 작성**

```ts
// src/poc/poc-fixtures.ts
export interface FixtureCase {
  id: string;
  text: string;
  /** 사람이 직접 검수한 기대 entity 들. start/end 는 text 의 char offset (UTF-16). */
  expected: Array<{ entity: string; start: number; end: number; word: string }>;
}

export const EN_FIXTURES: FixtureCase[] = [
  {
    id: 'en-basic',
    text: 'My name is Alice Smith and my email is alice@example.com.',
    expected: [
      { entity: 'private_person', start: 11, end: 22, word: 'Alice Smith' },
      { entity: 'private_email', start: 39, end: 56, word: 'alice@example.com' },
    ],
  },
  {
    id: 'en-multientity',
    text: 'Contact Bob at +1-212-555-0100 or visit https://acme.com on 2024-03-15.',
    expected: [
      { entity: 'private_person', start: 8, end: 11, word: 'Bob' },
      { entity: 'private_phone', start: 15, end: 30, word: '+1-212-555-0100' },
      { entity: 'private_url', start: 40, end: 56, word: 'https://acme.com' },
      { entity: 'private_date', start: 60, end: 70, word: '2024-03-15' },
    ],
  },
];

export const KO_FIXTURES: FixtureCase[] = [
  {
    id: 'ko-name-address',
    // expected 는 사람이 직접 측정해서 채운다. PoC 단계에서는 "검출되면 좋다" 정도.
    text: '김철수 (서울특별시 강남구 테헤란로 123) 010-1234-5678 alice@example.com',
    expected: [
      // 모델 한국어 성능 미지수 — Task 4 에서 실제 출력으로 baseline JSON 채움
    ],
  },
  {
    id: 'ko-mixed',
    text: '담당자 이영희 부장은 서울시 마포구에 거주하며 사번 1001 입니다.',
    expected: [],
  },
];
```

- [ ] **Step 2: PoC 진입점 — 모델 디렉토리 선택 → pipeline 로드**

```ts
// src/poc/ner-poc.ts
import { pipeline, env } from '@huggingface/transformers';
import { EN_FIXTURES, KO_FIXTURES } from './poc-fixtures';

env.allowRemoteModels = false;
env.allowLocalModels = true;

let classifier: Awaited<ReturnType<typeof pipeline>> | null = null;

async function loadModelFromUserDir(): Promise<void> {
  const root = document.getElementById('poc-root')!;
  const button = document.createElement('button');
  button.textContent = '모델 폴더 선택';
  root.appendChild(button);

  await new Promise<void>((resolve) => {
    button.onclick = async () => {
      // showDirectoryPicker 는 Chromium 계열 file:// 동작 확인용
      const dirHandle = await (window as unknown as {
        showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
      }).showDirectoryPicker();
      // transformers.js 가 디렉토리 핸들을 직접 받지 않으므로 in-memory blob URL 로 등록
      env.localModelPath = await registerModelFromHandle(dirHandle);
      resolve();
    };
  });

  const t0 = performance.now();
  classifier = await pipeline('token-classification', 'privacy-filter', {
    device: 'webgpu',
    dtype: 'q4',
  } as never).catch(async (e) => {
    console.warn('[ner-poc] WebGPU 실패, WASM 폴백:', e);
    return pipeline('token-classification', 'privacy-filter', {
      device: 'wasm',
    } as never);
  });
  console.log(`[ner-poc] 모델 로드 ${(performance.now() - t0).toFixed(0)}ms`);
}

async function registerModelFromHandle(
  handle: FileSystemDirectoryHandle
): Promise<string> {
  // 임시: 모든 파일을 메모리에 읽어 in-memory map 으로 등록.
  // transformers.js 의 fetchLocalFile 훅을 모킹하는 형태가 가장 간단하다.
  const files: Record<string, Uint8Array> = {};
  // @ts-expect-error - FileSystemDirectoryHandle.values()
  for await (const entry of handle.values()) {
    if (entry.kind === 'file') {
      const f = await (entry as FileSystemFileHandle).getFile();
      files[entry.name] = new Uint8Array(await f.arrayBuffer());
    }
  }
  // transformers.js 의 fetch 훅을 덮어쓰는 식으로 등록 — env.fetch 또는 self.caches
  // 이 단계는 PoC 의 가장 까다로운 부분이라 실제 구현은 작업자가 transformers.js 의
  // 현재 버전 문서를 보고 결정한다. 잘 안 되면 file://input[type=file] 단일 파일 로딩으로 폴백.
  (env as unknown as { __pocFiles__?: Record<string, Uint8Array> }).__pocFiles__ = files;
  return 'privacy-filter';
}

async function runEnglishCases(): Promise<void> {
  if (!classifier) throw new Error('classifier not loaded');
  for (const fx of EN_FIXTURES) {
    const out = await (classifier as never as (
      text: string,
      opts: { aggregation_strategy: 'simple' }
    ) => Promise<Array<{ entity_group: string; start: number; end: number; score: number; word: string }>>)(
      fx.text,
      { aggregation_strategy: 'simple' }
    );
    console.log(`[en/${fx.id}]`, JSON.stringify(out, null, 2));
  }
}

async function main(): Promise<void> {
  await loadModelFromUserDir();
  await runEnglishCases();
}

void main();
```

이 코드는 PoC 임시 코드이며, transformers.js 가 디렉토리 입력을 어떻게 받는지의 실제 API 는 라이브러리 버전에 따라 다르다. 작업자는 이 코드를 출발점으로 삼아 **실제 동작하는 형태**로 수정한다. 핵심은 `pipeline('token-classification', ..., { device, dtype })` 호출이 성공하고, `aggregation_strategy: 'simple'` 결과가 `{entity_group, start, end, score}` 를 포함하는지 확인하는 것.

- [ ] **Step 3: NLP 모드 dev 서버로 동작 확인**

Run: `npm run dev:nlp` → 브라우저에서 `http://localhost:5173/index-nlp.html` 열기 → "모델 폴더 선택" 클릭 → 콘솔에서 영문 entity 출력 확인.

Expected: `[en/en-basic]` 출력에 `Alice Smith` (`private_person`) 와 `alice@example.com` (`private_email`) 둘 다 보인다. score 는 0.9 이상.

이 단계가 막히면 stop. 작업자는 transformers.js 의 로컬 모델 로딩 방식을 README/이슈 트래커에서 확인하고 코드를 조정한 뒤 다시 시도한다. 전부 막히면 PoC 보고서에 "Q1 답변: 현 방식 불가" 로 기록하고 스펙으로 회귀.

- [ ] **Step 4: 보고서에 영문 결과 기록 (보고서는 Task 7 에서 한 번에 작성)**

영문 결과의 raw JSON 을 콘솔에서 복사해 두기 (또는 `console.log` 를 `localStorage` 저장으로 바꾸기). Task 7 에서 보고서 생성 시 사용.

- [ ] **Step 5: 커밋**

```bash
git add src/poc/ner-poc.ts src/poc/poc-fixtures.ts
git commit -m "chore(poc): 영문 NER 추론 PoC 진입점 추가"
```

---

## Task 3: char offset 정확도 측정 (Q2)

**Files:**
- Create: `tests/unit/charOffset-baseline.test.ts`
- Modify: `src/poc/ner-poc.ts`

- [ ] **Step 1: 알고리즘 단위 테스트 작성 (failing)**

```ts
// tests/unit/charOffset-baseline.test.ts
import { describe, it, expect } from 'vitest';
import { compareEntityOffsets } from '@/poc/ner-poc';
import { EN_FIXTURES } from '@/poc/poc-fixtures';

describe('PoC: char offset 정확도', () => {
  it('영문 기대값과 실제 entity offset 의 차이를 측정한다', () => {
    const fx = EN_FIXTURES[0];
    const observed = [
      { entity_group: 'private_person', start: 11, end: 22, score: 0.99, word: 'Alice Smith' },
      { entity_group: 'private_email', start: 39, end: 56, score: 0.99, word: 'alice@example.com' },
    ];
    const result = compareEntityOffsets(fx, observed);
    expect(result.exactMatches).toBe(2);
    expect(result.offsetMismatches).toEqual([]);
  });

  it('offset 1 글자 어긋난 경우를 mismatch 로 분류한다', () => {
    const fx = EN_FIXTURES[0];
    const observed = [
      { entity_group: 'private_person', start: 12, end: 22, score: 0.99, word: 'lice Smith' },
    ];
    const result = compareEntityOffsets(fx, observed);
    expect(result.exactMatches).toBe(0);
    expect(result.offsetMismatches).toHaveLength(1);
    expect(result.offsetMismatches[0]).toMatchObject({
      expected: { start: 11, end: 22 },
      observed: { start: 12, end: 22 },
      delta: { start: 1, end: 0 },
    });
  });
});
```

- [ ] **Step 2: 테스트 실행 → fail 확인**

Run: `npm test -- tests/unit/charOffset-baseline.test.ts`
Expected: FAIL — `compareEntityOffsets is not exported`.

- [ ] **Step 3: `compareEntityOffsets` 구현**

```ts
// src/poc/ner-poc.ts 에 export 추가
import type { FixtureCase } from './poc-fixtures';

export interface OffsetCompareResult {
  exactMatches: number;
  offsetMismatches: Array<{
    expected: { entity: string; start: number; end: number };
    observed: { entity: string; start: number; end: number };
    delta: { start: number; end: number };
  }>;
  missing: Array<FixtureCase['expected'][number]>;
  extra: Array<{ entity_group: string; start: number; end: number }>;
}

export function compareEntityOffsets(
  fixture: FixtureCase,
  observed: Array<{ entity_group: string; start: number; end: number; score: number; word: string }>
): OffsetCompareResult {
  const result: OffsetCompareResult = {
    exactMatches: 0,
    offsetMismatches: [],
    missing: [],
    extra: [],
  };
  const usedObs = new Set<number>();
  for (const exp of fixture.expected) {
    let foundIdx = -1;
    for (let i = 0; i < observed.length; i++) {
      if (usedObs.has(i)) continue;
      const obs = observed[i];
      if (obs.entity_group !== exp.entity) continue;
      if (obs.start === exp.start && obs.end === exp.end) {
        foundIdx = i;
        result.exactMatches += 1;
        break;
      }
      // 같은 카테고리이지만 offset 어긋남
      if (Math.abs(obs.start - exp.start) <= 5 || Math.abs(obs.end - exp.end) <= 5) {
        foundIdx = i;
        result.offsetMismatches.push({
          expected: { entity: exp.entity, start: exp.start, end: exp.end },
          observed: { entity: obs.entity_group, start: obs.start, end: obs.end },
          delta: { start: obs.start - exp.start, end: obs.end - exp.end },
        });
        break;
      }
    }
    if (foundIdx === -1) {
      result.missing.push(exp);
    } else {
      usedObs.add(foundIdx);
    }
  }
  observed.forEach((obs, i) => {
    if (!usedObs.has(i)) {
      result.extra.push({ entity_group: obs.entity_group, start: obs.start, end: obs.end });
    }
  });
  return result;
}
```

- [ ] **Step 4: 테스트 실행 → pass 확인**

Run: `npm test -- tests/unit/charOffset-baseline.test.ts`
Expected: PASS.

- [ ] **Step 5: PoC 진입점에서 영문 케이스마다 비교 결과 출력**

`src/poc/ner-poc.ts` 의 `runEnglishCases` 끝에 추가:

```ts
// runEnglishCases 안에서
const cmp = compareEntityOffsets(fx, out);
console.log(`[en/${fx.id}] compare`, cmp);
```

- [ ] **Step 6: dev 서버로 다시 검증**

Run: `npm run dev:nlp` → 콘솔에서 모든 영문 픽스처에 대해 `exactMatches` / `offsetMismatches` 카운트 확인. 결과를 보고서에 옮길 메모로 남긴다.

- [ ] **Step 7: 커밋**

```bash
git add src/poc/ner-poc.ts tests/unit/charOffset-baseline.test.ts
git commit -m "chore(poc): char offset 정확도 비교 함수 + 단위 테스트"
```

---

## Task 4: 한국어 char offset + 검출 baseline (Q3, Q4)

**Files:**
- Modify: `src/poc/ner-poc.ts`
- Create: `tests/fixtures/ner-ko-baseline.json`

- [ ] **Step 1: 한국어 케이스 실행 함수 추가**

```ts
// src/poc/ner-poc.ts
async function runKoreanCases(): Promise<Array<{
  id: string;
  text: string;
  observed: Array<{ entity_group: string; start: number; end: number; score: number; word: string }>;
}>> {
  if (!classifier) throw new Error('classifier not loaded');
  const acc: Array<{
    id: string;
    text: string;
    observed: Array<{ entity_group: string; start: number; end: number; score: number; word: string }>;
  }> = [];
  for (const fx of KO_FIXTURES) {
    const out = await (classifier as never as (
      text: string,
      opts: { aggregation_strategy: 'simple' }
    ) => Promise<Array<{ entity_group: string; start: number; end: number; score: number; word: string }>>)(
      fx.text,
      { aggregation_strategy: 'simple' }
    );
    console.log(`[ko/${fx.id}]`, JSON.stringify(out, null, 2));
    acc.push({ id: fx.id, text: fx.text, observed: out });
  }
  return acc;
}
```

`main()` 에서 `await runKoreanCases()` 도 호출.

- [ ] **Step 2: 결과를 baseline JSON 으로 다운로드하는 도우미 추가**

```ts
// src/poc/ner-poc.ts
async function downloadJson(filename: string, data: unknown): Promise<void> {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// main 끝에서:
const ko = await runKoreanCases();
await downloadJson('ner-ko-baseline.json', { generatedAt: new Date().toISOString(), cases: ko });
```

- [ ] **Step 3: dev 서버에서 실행 → 다운로드된 JSON 을 저장소로 옮기기**

Run: `npm run dev:nlp` → 모델 폴더 선택 → 자동 다운로드된 `ner-ko-baseline.json` 을 `tests/fixtures/ner-ko-baseline.json` 으로 이동.

- [ ] **Step 4: char offset 검증 (한국어 — UTF-16 surrogate 주의)**

한국어는 BMP 안에 있어 UTF-16 단위와 codepoint 가 일치하지만, 이모지 등 surrogate pair 가 들어가면 어긋날 수 있다. baseline JSON 의 `observed` 의 `start`/`end` 와 `text.slice(start, end)` 가 `word` 와 일치하는지 수동 검증:

```bash
node -e "
const fs = require('fs');
const b = JSON.parse(fs.readFileSync('tests/fixtures/ner-ko-baseline.json', 'utf8'));
for (const c of b.cases) {
  for (const o of c.observed) {
    const slice = c.text.slice(o.start, o.end);
    const ok = slice === o.word || slice.trim() === o.word.trim();
    console.log(c.id, o.entity_group, o.start, o.end, JSON.stringify(slice), JSON.stringify(o.word), ok ? 'OK' : 'MISMATCH');
  }
}
"
```

Expected: 모든 줄이 `OK` 면 한국어 char offset 도 신뢰 가능. `MISMATCH` 가 있으면 어떤 패턴인지 (앞뒤 공백/조사/UTF-16) 메모해서 보고서에 기록.

- [ ] **Step 5: 한국어 검출 카테고리 요약**

baseline JSON 을 읽어 카테고리별 검출 건수와 평균 score 를 정리:

```bash
node -e "
const b = JSON.parse(require('fs').readFileSync('tests/fixtures/ner-ko-baseline.json','utf8'));
const stats = {};
for (const c of b.cases) for (const o of c.observed) {
  stats[o.entity_group] ||= { count: 0, sum: 0 };
  stats[o.entity_group].count++;
  stats[o.entity_group].sum += o.score;
}
for (const [k,v] of Object.entries(stats)) console.log(k, v.count, (v.sum/v.count).toFixed(3));
"
```

이 출력도 보고서에 기록할 메모.

- [ ] **Step 6: 커밋**

```bash
git add src/poc/ner-poc.ts tests/fixtures/ner-ko-baseline.json
git commit -m "chore(poc): 한국어 NER baseline JSON 생성 + char offset 검증"
```

---

## Task 5: NLP 빌드 사이즈 측정 (Q5)

**Files:**
- 변경 없음 (이미 Task 1 에서 `build:nlp` 셋업)

- [ ] **Step 1: NLP 빌드 산출**

Run: `npm run build:nlp`
Expected: `dist-nlp/index.html` 생성. postbuild 의 `verify-build-size --budget=35` 가 PASS 또는 FAIL.

- [ ] **Step 2: 사이즈 분해**

산출 파일과 의존성별 비중을 측정:

```bash
ls -la dist-nlp/
du -sh dist-nlp/
node -e "
const fs = require('fs');
const html = fs.readFileSync('dist-nlp/index.html', 'utf8');
console.log('HTML 총 크기 bytes:', Buffer.byteLength(html));
// onnxruntime / transformers 식별 가능한 청크 크기 어림 — 각자 marker 검색
const markers = ['onnxruntime', 'transformers', 'mupdf'];
for (const m of markers) {
  const matches = html.match(new RegExp(m + '[^\"\\']{0,80}', 'g')) ?? [];
  console.log(m, 'occurrences', matches.length);
}
"
```

이 결과를 보고서에 기록한다.

- [ ] **Step 3: 35MB 초과 시 옵션 검토**

`verify-build-size` 가 FAIL 했다면 다음 옵션을 보고서에 옵션 분석으로 기재:
- 옵션 A: 예산 상향 (예: 50MB) — 단순. 사용자 다운로드 부담 증가
- 옵션 B: onnxruntime-web wasm 을 산출 HTML 에 임베드하지 않고 별도 파일로 분리 — file:// 의 단일 HTML 원칙 깨짐
- 옵션 C: BYO 백엔드 — 사용자가 onnxruntime wasm 도 BYOM 처럼 직접 가져옴 — 복잡, UX 나쁨

PASS 했다면 35MB 예산 확정.

- [ ] **Step 4: 커밋 (산출물은 gitignore 가정)**

코드 변경 없음. 측정 결과는 Task 7 에서 보고서로.

---

## Task 6: file:// + WebGPU/WASM 동작 확인 (Q1, Q6)

**Files:**
- 변경 없음

- [ ] **Step 1: NLP 빌드 산출 더블클릭**

`open dist-nlp/index.html` (macOS) 또는 Windows 의 더블클릭. 브라우저별로 (Chrome / Edge / Safari / Firefox 가능 범위 내) 시도.

- [ ] **Step 2: 모델 폴더 선택 → 콘솔 로그 확인**

Expected:
- `WebGPU 실패, WASM 폴백:` 같은 경고가 떴는지 (떴다면 어느 브라우저)
- 모델 로드 시간 (`[ner-poc] 모델 로드 ...ms`)
- 영문 케이스 출력이 정상인지

- [ ] **Step 3: 브라우저별 표 작성용 메모**

| 브라우저 | OS | WebGPU | WASM | 모델 로드 시간 | 영문 추론 시간 | 비고 |
|---|---|---|---|---|---|---|
| Chrome | macOS 14 | ? | ? | ? | ? | ? |
| Edge | Windows | ? | ? | ? | ? | ? |
| Safari | macOS 14 | ? | ? | ? | ? | ? |

이 표를 보고서에 옮긴다.

- [ ] **Step 4: 한 환경이라도 동작하면 PASS**

PoC 의 통과 기준은 "최소 1개 환경에서 file:// 더블클릭 → 모델 로드 → 영문 추론 성공". 모두 실패면 후속 본구현 plan 의 가정이 깨지므로 보고서에 빨간 깃발.

---

## Task 7: PoC 보고서 작성

**Files:**
- Create: `docs/poc-ner-report.md`

- [ ] **Step 1: 보고서 초안 작성**

```markdown
# NER 통합 PoC 결과 (M0)

- **작성일**: 2026-04-29
- **작성자**: <이름>
- **PoC 환경**: macOS 14 / Chrome <버전>, ... (실측 환경 기재)
- **사용 모델**: openai/privacy-filter (받아온 변형: q4 등 명시)

## Q1. file:// 단일 HTML 동작 가능 여부

**결과**: PASS / FAIL — <상세>

상세:
- `npm run build:nlp` 산출 `dist-nlp/index.html` 더블클릭 → 모델 폴더 선택 시 동작 확인.
- transformers.js 의 로컬 모델 로딩은 `env.localModelPath` + `env.allowRemoteModels=false` 조합으로 가능.
- (만약 막혔다면 그 사유와 우회 방법)

## Q2. 영문 char offset 정확도

**결과**: <exactMatches / offsetMismatches / missing / extra 카운트>

| 케이스 | exactMatches | offsetMismatches | missing | extra |
|---|---|---|---|---|
| en-basic | 2/2 | 0 | 0 | 0 |
| en-multientity | 4/4 | 0 | 0 | 0 |

> 결론: spanMap 알고리즘은 entity.start/end 를 그대로 사용 가능 / char-level 재정렬 layer 필요.

## Q3. 한국어 char offset 정확도

**결과**: 베이스라인 JSON 의 `text.slice(start, end) === word` 검증 결과 — 일치율 N/M.

mismatch 발생 시 패턴:
- 조사 포함/제외
- 앞뒤 공백
- (실측 결과)

> 결론: 한국어도 char offset 신뢰 가능 / 토크나이저별 보정 필요.

## Q4. 한국어 검출 baseline

| entity_group | 검출 건수 | 평균 score |
|---|---|---|
| private_person | ? | ? |
| private_address | ? | ? |
| ... | ? | ? |

> 결론:
> - 한국 이름은 검출되는가? 부분적인가? 못 잡는가?
> - 한국 주소는 검출되는가?
> - 사용자 가치 판단: 보강 도구로 가치 있음 / 한계 명확하지만 OFF 기본값으로 안전 / 실용성 낮음

## Q5. NLP 빌드 사이즈

| 항목 | 크기 |
|---|---|
| `dist-nlp/index.html` 총 크기 | ? MB |
| 35MB 예산 통과 | YES / NO |
| 주요 비중: mupdf wasm | ? MB |
| 주요 비중: onnxruntime-web | ? MB |
| 주요 비중: transformers.js | ? MB |
| 주요 비중: 기존 react/mupdf 코드 | ? MB |

> 결론: 예산 35MB 적정 / 50MB 상향 필요 / wasm 분리 옵션.

## Q6. WebGPU / WASM 환경 매트릭스

| 브라우저 | OS | WebGPU | WASM | 모델 로드 | 영문 추론 |
|---|---|---|---|---|---|
| Chrome | macOS 14 | ? | ? | ? ms | ? ms |
| Edge | Windows | ? | ? | ? ms | ? ms |
| Safari | macOS 14 | ? | ? | ? ms | ? ms |

> 결론: WebGPU 가용 환경의 비중이 충분 / WASM 단독으로도 사용 가능 시간 / 사용 불가.

## 본구현 plan (M1~M5) 에 미치는 영향

- spec N7 (35MB 예산): 유지 / 변경 (<MB>로)
- spec N8 (WebGPU/WASM 폴백): 유지 / 변경
- spec 4.3 (spanMap 알고리즘): 그대로 / 보정 layer 추가
- spec 1.2 (비범위): "한국어 한계" 섹션 강화 여부

## 다음 단계

본 PoC 결과를 반영해 `docs/superpowers/plans/2026-04-29-ner-integration-impl.md` 본구현 plan 을 작성한다.
```

- [ ] **Step 2: 실측값으로 모든 `?` 채우기**

Task 2~6 에서 메모해 둔 측정값을 채워 보고서를 완성한다.

- [ ] **Step 3: 커밋**

```bash
git add docs/poc-ner-report.md
git commit -m "docs(poc): NER 통합 PoC 결과 보고서 (M0)"
```

---

## Task 8: PoC 코드 정리 결정

**Files:**
- 결정에 따라 다름

- [ ] **Step 1: PoC 코드 영구화 여부 결정**

PoC 결과를 보고 다음을 결정:

**Option A — PoC 코드 폐기, 본구현에서 새로 작성**
- `src/poc/`, `index-nlp.html` 을 본구현 plan 의 첫 번째 task 에서 제거
- PoC 보고서만 영구 산출

**Option B — PoC 일부를 재사용**
- `compareEntityOffsets` 같은 유틸은 본구현의 통합 테스트에서 재사용 가능 → `tests/util/` 로 옮긴다
- `KO_FIXTURES`/`EN_FIXTURES` 도 통합 테스트 픽스처로 승격

- [ ] **Step 2: 결정을 보고서 마지막 섹션에 기록**

```markdown
## PoC 코드 처리 방침

- src/poc/ner-poc.ts : 폐기 / 일부 함수 (`compareEntityOffsets` 등) 재사용
- src/poc/poc-fixtures.ts : 폐기 / `tests/fixtures/` 로 승격
- index-nlp.html : 폐기 / NLP 빌드 진입점으로 정식화
- tests/unit/charOffset-baseline.test.ts : 유지 / 폐기
```

- [ ] **Step 3: 본구현 plan 작성 트리거 메모**

본구현 plan(`2026-04-29-ner-integration-impl.md`) 작성 시 보고서의 결론을 반영해야 함을 PoC 보고서 끝에 명시. 이 PoC plan 은 이로써 종료.

- [ ] **Step 4: 커밋**

```bash
git add docs/poc-ner-report.md
git commit -m "docs(poc): PoC 코드 처리 방침 + 본구현 plan 트리거 메모"
```

---

## 종료 게이트

이 PoC plan 의 모든 task 가 끝났을 때 다음이 만족되어야 한다:

1. `npm run build` 회귀 0 (기본 18MB 정규식 빌드 그대로)
2. `npm run build:nlp` 가 PASS 또는 FAIL 인지 명시적으로 측정 결과 기록
3. `docs/poc-ner-report.md` 의 모든 `?` 가 채워짐
4. Q1~Q6 의 모든 결정이 보고서에 명시

게이트 통과 후 본구현 plan(`2026-04-29-ner-integration-impl.md`)을 별도 brainstorming 또는 직접 작성으로 시작한다 — PoC 결과가 spec 의 가정을 흔들었다면 spec 부분 수정도 함께.
