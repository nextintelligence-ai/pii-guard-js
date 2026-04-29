# NER 통합 본구현 (M1~M5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PoC(M0) 결과를 반영해 OpenAI privacy-filter NER 보강을 본격 구현한다 — onnxruntime wasm 로컬화 → NER 워커 + 모델 로더 → spanMap → 디스패처 + 진행률 UI → CandidatePanel 통합 → 통합 테스트.

**Architecture:** Spec `2026-04-29-ner-integration-design.md` 를 따른다. 단, PoC 결과로 (N7) 빌드 예산 70MB 상향, (N10 신설) onnxruntime-web wasm 의 로컬 서빙·임베드, (4.2) `env.backends.onnx.wasm.wasmPaths` 설정 추가. 모든 좌표는 PDF point 로 통일, NER 워커는 mupdf 워커와 분리, NER 후보는 기본 OFF.

**Tech Stack:** React 19 / Vite 5 / `@huggingface/transformers` 4.2 / onnxruntime-web (transformers.js 의존) / mupdf 1.27 / Comlink 4 / Zustand 5 / Vitest 2

---

## File Structure

| 파일 | 역할 | 변경 |
|---|---|---|
| `docs/superpowers/specs/2026-04-29-ner-integration-design.md` | spec | **갱신** (N7→70MB, N10 신설 등) |
| `vite.config.ts` | 빌드/dev 설정 | onnxruntime wasm 로컬 서빙 plugin + 빌드 시점 wasm 임베드 검증 |
| `scripts/embed-onnx-runtime.mjs` | onnxruntime wasm base64 임베드 (필요 시) | **신규** (필요 여부는 T0.3 검증 후 결정) |
| `scripts/verify-no-external.mjs` | 외부 URL 가드 | NLP 모드 정책 강화 — 안내 string 은 prefix allow, 실 fetch 가 없음을 보장 |
| `scripts/verify-build-size.mjs` | 사이즈 가드 | NLP 모드 예산 70MB 로 상향 |
| `package.json` | scripts | `postbuild:nlp --budget=70` 갱신 |
| `src/poc/` | PoC 코드 | 정리 — `compareEntityOffsets.ts`/`poc-fixtures.ts` 는 영구화 (`tests/util/`, `tests/fixtures/`), `ner-poc.ts`/`index-nlp.html` 은 본구현이 대체 |
| `src/workers/ner.worker.ts` | NER 추론 워커 | **신규** — comlink + transformers.js + WebGPU/WASM 폴백 |
| `src/core/nerModel.ts` | 모델 로더 + OPFS 캐시 + hash 메타 | **신규** |
| `src/core/spanMap.ts` | 텍스트 ↔ PDF 좌표 매핑 | **신규** |
| `src/core/nerDispatcher.ts` | 페이지 큐 + 우선순위 + 캔슬 | **신규** |
| `src/hooks/useNerModel.ts` | 모델 로드 hook (상태 머신) | **신규** |
| `src/hooks/useNerDetect.ts` | 디스패처 트리거 + store 합류 | **신규** |
| `src/components/NerProgress.tsx` | 진행률 UI | **신규** |
| `src/components/Toolbar.tsx` | `[NER 모델 로드]` 버튼 | **수정** |
| `src/components/CandidatePanel.tsx` | 5 카테고리 추가 + 출처 뱃지 + 신뢰도 슬라이더 | **수정** |
| `src/components/UsageGuideModal.tsx` | NER 사용법 + 한국어 한계 안내 | **수정** |
| `src/state/store.ts` | NER 후보 + threshold + source 필드 | **수정** |
| `src/state/selectors.ts` | NER 셀렉터 | **수정** |
| `tests/util/compareEntityOffsets.ts` | PoC 의 비교 함수 영구화 | **이동** |
| `tests/fixtures/ner-fixtures.ts` | 영문/한국어 픽스처 영구화 | **이동** |
| `tests/fixtures/ner-ko-baseline.json` | 한국어 baseline | **신규** (M5 모니터 테스트에 사용) |
| `tests/unit/spanMap.test.ts` | spanMap 단위 테스트 | **신규** |
| `tests/unit/nerDispatcher.test.ts` | 디스패처 단위 테스트 | **신규** |
| `tests/integration/ner-flow.test.ts` | 전체 플로우 통합 테스트 (mock 워커) | **신규** |
| `tests/integration/ner-realmodel.test.ts` | 실 모델 회귀 (default skip) | **신규** |
| `README.md` | 사용법 | NER 빌드 안내 추가 |
| `CLAUDE.md` | 컨벤션 | NER 모듈 함정 모음 추가 |
| `docs/release-checklist.md` | 릴리스 체크리스트 | NER 빌드 검증 항목 |

---

## Phase 0: 사전 정리 (spec 갱신 + PoC 정리 + onnxruntime 로컬화)

### Task 0.1: Spec 갱신 — PoC 결과 반영

**Files:**
- Modify: `docs/superpowers/specs/2026-04-29-ner-integration-design.md`

- [ ] **Step 1: Decisions Log 갱신**

기존 N7 행을 다음으로 교체:

```md
| N7 | 빌드 분기 = `npm run build:nlp` 신설. 기본 빌드는 18MB 그대로 | NLP 모드 예산 **70 MB** (PoC 실측 63MB 기반) |
```

다음 행을 새로 추가:

```md
| N10 | onnxruntime-web wasm 백엔드의 로컬화 — dev 서버는 vite middleware 로 `/ort/` 매핑, 빌드는 viteSingleFile 의 inline 보장(또는 별도 임베드 스크립트) | spec 의 외부 네트워크 0 정책을 깨지 않기 위함. PoC 에서 jsdelivr CDN fetch 발견 |
```

- [ ] **Step 2: 4.2 NER 워커 구현 지침 갱신**

`env.allowRemoteModels = false` 다음에 한 줄 추가:

```md
- `env.backends.onnx.wasm.wasmPaths = '/ort/'` 로 onnxruntime-web 의 wasm 백엔드를 로컬 prefix 에서 받게 한다. dev 서버는 vite middleware 가 `node_modules/onnxruntime-web/dist/` 를 매핑.
```

- [ ] **Step 3: 5.3 산출물 표의 NER 모드 예산을 35 MB → 70 MB**

- [ ] **Step 4: 5.4 외부 네트워크 가드 섹션 강화**

기존 한 문단을 다음으로 교체:

```md
`scripts/verify-no-external.mjs` 의 NLP 모드 정책은 **이중 구조** 다.
1. **Prefix allow list** — transformers.js / onnxruntime-web 코드 안에 string 으로 박혀있고 실제 fetch 는 발생하지 않는 안내 URL 들: `huggingface.co/`, `web.dev/`, `developer.mozilla.org/`, `github.com/huggingface/transformers.js/`, `https://acme.com` (테스트 픽스처).
2. **차단** — 실제 런타임 fetch 가 발생하는 `cdn.jsdelivr.net/npm/onnxruntime-web@...` 은 allow 가 아니라 **로컬 서빙으로 대체**. 산출 HTML 안의 wasm 은 `viteSingleFile` 또는 별도 임베드로 inline.
```

- [ ] **Step 5: 9. 위험과 완화 표에 새 행 추가**

```md
| transformers.js 의 onnxruntime-web 백엔드가 jsdelivr CDN 에서 wasm 을 fetch | 외부 네트워크 0 정책 위반, file:// 동작 실패 | env.backends.onnx.wasm.wasmPaths 설정 + vite middleware (dev) + viteSingleFile inline (build). T0.3 에서 검증 |
```

- [ ] **Step 6: 커밋**

```bash
git add docs/superpowers/specs/2026-04-29-ner-integration-design.md
git commit -m "docs(spec): PoC 결과 반영 — 예산 70MB, onnxruntime 로컬화 N10 신설"
```

---

### Task 0.2: PoC 코드 정리 (영구화 + 폐기)

**Files:**
- Move: `src/poc/compareEntityOffsets.ts` → `tests/util/compareEntityOffsets.ts`
- Move: `src/poc/poc-fixtures.ts` → `tests/fixtures/ner-fixtures.ts`
- Delete: `src/poc/ner-poc.ts`
- Delete: `index-nlp.html` (본구현이 정식 진입점으로 대체 — 어떤 형태가 될지는 T1 에서 결정)
- Modify: `tests/unit/charOffset-baseline.test.ts` (import path 갱신)

- [ ] **Step 1: compareEntityOffsets 이동**

```bash
mkdir -p tests/util
git mv src/poc/compareEntityOffsets.ts tests/util/compareEntityOffsets.ts
```

- [ ] **Step 2: 픽스처 이동 + 이름 변경**

```bash
git mv src/poc/poc-fixtures.ts tests/fixtures/ner-fixtures.ts
```

- [ ] **Step 3: 단위 테스트의 import 경로 갱신**

`tests/unit/charOffset-baseline.test.ts` 의 import 두 줄을 다음으로 교체:

```ts
import { compareEntityOffsets } from '@/../tests/util/compareEntityOffsets';
import { EN_FIXTURES } from '@/../tests/fixtures/ner-fixtures';
```

또는 `vitest.config.ts` 에 alias 추가 (`'@tests': path.resolve(__dirname, 'tests')`):

```ts
import { compareEntityOffsets } from '@tests/util/compareEntityOffsets';
import { EN_FIXTURES } from '@tests/fixtures/ner-fixtures';
```

작업자는 기존 alias 컨벤션 (`@`) 과 비교해 일관성 있는 쪽 선택.

- [ ] **Step 4: ner-poc.ts 와 index-nlp.html 삭제**

```bash
git rm src/poc/ner-poc.ts
git rm index-nlp.html
rmdir src/poc 2>/dev/null || true
```

- [ ] **Step 5: 테스트 통과 + lint 통과 확인**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git commit -m "refactor(poc): PoC 코드 정리 — 영구화(compareEntityOffsets, fixtures) + 폐기(ner-poc, index-nlp)"
```

---

### Task 0.3: onnxruntime-web wasm 로컬화 (가장 위험한 task)

**Files:**
- Modify: `vite.config.ts`
- (조건부) Create: `scripts/embed-onnx-runtime.mjs`
- Create: `index-nlp.html` (재생성, NLP 모드 정식 진입점)
- Create: `src/nlp/main.tsx` (NLP 모드 React 진입점 — 이 task 에서는 wasm 로딩까지만 검증)
- Modify: `package.json` (예산 70MB)

- [ ] **Step 1: 빌드 시점 inline 동작 검증**

먼저 현재 `npm run build:nlp` 산출물에 onnxruntime wasm 이 inline 되어 있는지 확인:

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('dist-nlp/index-nlp.html', 'utf8');
// onnxruntime wasm 의 marker 검색 — base64 의 일부일 가능성
const markers = ['ort_wasm_simd', 'wasmPaths', 'asyncify'];
for (const m of markers) {
  console.log(m, html.includes(m));
}
console.log('총 사이즈 MB:', (html.length / 1024 / 1024).toFixed(2));
"
```

(현재 빌드 산출이 PoC 단계에서 1.32 KB 짜리 빈 entry 였으므로 다시 빌드 후 측정. PoC 의 ner-poc.ts 는 Task 0.2 에서 삭제됐고 새 NLP 진입점은 다음 step.)

- [ ] **Step 2: NLP 모드 정식 진입점 — `index-nlp.html` 재생성**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1.0" />
    <title>pdf-anony (NLP)</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/nlp/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: NLP 진입점 — `src/nlp/main.tsx`**

이 시점에는 본 앱(`src/main.tsx` 와 동일) 을 import 하되 NLP 코드만 추가. 가장 단순한 형태:

```tsx
// src/nlp/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../App';
import '../styles/index.css';
import { configureNerEnv } from './configureNerEnv';

await configureNerEnv();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 4: `src/nlp/configureNerEnv.ts` 작성**

```ts
// src/nlp/configureNerEnv.ts
import { env } from '@huggingface/transformers';

export async function configureNerEnv(): Promise<void> {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = '/models/';
  // onnxruntime-web 의 wasm 백엔드를 로컬 경로에서 받게 한다.
  // dev 서버: vite middleware 가 /ort/ 를 node_modules/onnxruntime-web/dist/ 로 매핑.
  // 빌드: viteSingleFile 이 inline 한다 (Step 1 검증). inline 이 안 되면
  // scripts/embed-onnx-runtime.mjs 로 base64 임베드 후 wasmPaths 를 data: URL 로 설정.
  // env.backends.onnx 의 정확한 형태는 transformers.js 4.2 에서 확인.
  const ortBackends = (env as unknown as { backends?: { onnx?: { wasm?: { wasmPaths?: string } } } }).backends;
  if (ortBackends?.onnx?.wasm) {
    ortBackends.onnx.wasm.wasmPaths = '/ort/';
  }
}
```

- [ ] **Step 5: vite middleware — onnxruntime wasm 로컬 서빙 (dev)**

`vite.config.ts` 의 `pocModelServer` plugin 옆에 새 plugin 추가:

```ts
function ortRuntimeServer(): Plugin {
  const ortDir = path.resolve(__dirname, 'node_modules/onnxruntime-web/dist');
  const URL_PREFIX = '/ort/';
  return {
    name: 'ort-runtime-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith(URL_PREFIX)) return next();
        const relPath = decodeURIComponent(req.url.slice(URL_PREFIX.length).split('?')[0]);
        const safe = path.posix.normalize('/' + relPath).slice(1);
        const filePath = path.join(ortDir, safe);
        if (!filePath.startsWith(ortDir)) {
          res.statusCode = 403;
          res.end('forbidden');
          return;
        }
        try {
          const data = await fs.readFile(filePath);
          if (filePath.endsWith('.mjs') || filePath.endsWith('.js'))
            res.setHeader('Content-Type', 'application/javascript');
          else if (filePath.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
          res.setHeader('Content-Length', String(data.byteLength));
          res.end(data);
        } catch (e) {
          res.statusCode = 404;
          res.end(`ort-runtime-server: ${(e as Error).message}`);
        }
      });
    },
  };
}
```

`plugins` 배열의 `pocModelServer()` 옆에 `ortRuntimeServer()` 추가 — `isNlp` 일 때만.

`pocModelServer` 도 정식 명명으로 재용도 가능 — 파일명이 PoC 인 만큼 본구현 시점에 이름 정리 (예: `nlpModelServer`). 작업자 판단.

- [ ] **Step 6: 빌드 사이즈 예산 70MB 로 상향**

```jsonc
// package.json
"postbuild:nlp": "node scripts/verify-no-external.mjs --target=dist-nlp/index-nlp.html && node scripts/verify-build-size.mjs --budget=70 --target=dist-nlp/index-nlp.html",
```

- [ ] **Step 7: dev 서버 + 페이지 로드 + 콘솔에 외부 fetch 0건 검증 (수동)**

작업자가 직접 또는 playwright 로:
1. `npm run dev:nlp`
2. http://localhost:5173/index-nlp.html (또는 5174 등) 로드
3. 개발자 도구 Network 탭 → `cdn.jsdelivr.net` 으로의 요청이 **0건** 인지 확인
4. `/ort/...` 경로의 wasm 요청이 200 응답 받는지 확인

검증 통과 못하면 작업자는 transformers.js 4.x 의 `env.backends.onnx.wasm.wasmPaths` 정확한 형태를 docs/소스에서 다시 확인하고 코드 조정.

- [ ] **Step 8: build:nlp 산출물 사이즈 + verify 통과 확인**

```bash
npm run build:nlp
```

Expected: 산출 사이즈 70MB 이내, verify-no-external 통과 (또는 jsdelivr 등 string allow list 추가 필요 시 verify 갱신).

verify-no-external 는 이번 단계에서 갱신:

`scripts/verify-no-external.mjs` 의 allow list 에 다음 추가:
```js
'huggingface.co/',
'web.dev/cross-origin-isolation-guide/',
'developer.mozilla.org/',
'github.com/huggingface/transformers.js/',
```

`cdn.jsdelivr.net/npm/onnxruntime-web` 는 allow 하지 않음 — Step 7 의 wasmPaths 설정으로 빌드 산출에 jsdelivr URL 이 활성 코드 path 로 남지 않아야 함. 만약 그래도 잡히면 별도 task 로 escalate (BLOCKED).

- [ ] **Step 9: 커밋**

```bash
git add vite.config.ts package.json scripts/verify-no-external.mjs scripts/verify-build-size.mjs index-nlp.html src/nlp/
git commit -m "feat(nlp): onnxruntime wasm 로컬화 + NLP 정식 진입점"
```

---

## Phase 1 (M1): NER 워커 + 모델 로더 + OPFS 캐시

### Task 1.1: NER 워커 skeleton + comlink RPC 인터페이스

**Files:**
- Create: `src/workers/ner.worker.ts`
- Create: `src/core/nerWorkerClient.ts`
- Create: `tests/unit/nerWorkerClient.test.ts`

- [ ] **Step 1: 단위 테스트 — 워커 client 가 mock worker 에 RPC 한다**

```ts
// tests/unit/nerWorkerClient.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createNerWorkerClient, type NerWorkerApi } from '@/core/nerWorkerClient';

describe('nerWorkerClient', () => {
  it('classify 호출이 워커의 classify 로 전달된다', async () => {
    const fakeApi: NerWorkerApi = {
      load: vi.fn().mockResolvedValue({ labelMap: { 0: 'O' }, backend: 'wasm' }),
      classify: vi.fn().mockResolvedValue([
        { entity_group: 'private_person', start: 0, end: 5, score: 0.99, word: 'Alice' },
      ]),
      unload: vi.fn().mockResolvedValue(undefined),
    };
    const client = createNerWorkerClient(fakeApi);
    const out = await client.classify('hello');
    expect(out[0].entity_group).toBe('private_person');
    expect(fakeApi.classify).toHaveBeenCalledWith('hello');
  });
});
```

- [ ] **Step 2: 테스트 실행 → fail**

Run: `npm test -- tests/unit/nerWorkerClient.test.ts`
Expected: FAIL — `createNerWorkerClient is not exported`.

- [ ] **Step 3: 인터페이스/팩토리 구현**

```ts
// src/core/nerWorkerClient.ts
export interface Entity {
  entity_group: string;
  start: number;
  end: number;
  score: number;
  word: string;
}

export interface NerWorkerApi {
  load(modelHandle: FileSystemDirectoryHandle | ArrayBuffer): Promise<{
    labelMap: Record<number, string>;
    backend: 'webgpu' | 'wasm';
  }>;
  classify(text: string): Promise<Entity[]>;
  unload(): Promise<void>;
}

export function createNerWorkerClient(api: NerWorkerApi): NerWorkerApi {
  return api;
}
```

(현재는 단순 pass-through. 워커 spawn 은 Task 1.2 에서.)

- [ ] **Step 4: 테스트 통과**

Run: `npm test -- tests/unit/nerWorkerClient.test.ts`
Expected: PASS.

- [ ] **Step 5: NER 워커 skeleton (실 구현은 Task 1.2)**

```ts
// src/workers/ner.worker.ts
import * as Comlink from 'comlink';
import type { NerWorkerApi, Entity } from '@/core/nerWorkerClient';

const api: NerWorkerApi = {
  async load() {
    throw new Error('not implemented yet');
  },
  async classify(): Promise<Entity[]> {
    throw new Error('not implemented yet');
  },
  async unload() {
    // no-op
  },
};

Comlink.expose(api);
```

- [ ] **Step 6: 커밋**

```bash
git add src/core/nerWorkerClient.ts src/workers/ner.worker.ts tests/unit/nerWorkerClient.test.ts
git commit -m "feat(ner): NER 워커 skeleton + comlink RPC 인터페이스"
```

---

### Task 1.2: NER 워커의 load() 구현 (transformers.js + WebGPU/WASM 폴백)

**Files:**
- Modify: `src/workers/ner.worker.ts`
- Create: `src/workers/nerEnv.ts` (transformers.js env 설정 — `src/nlp/configureNerEnv.ts` 와 같은 내용을 worker context 에서)

- [ ] **Step 1: nerEnv 모듈**

```ts
// src/workers/nerEnv.ts
import { env } from '@huggingface/transformers';

export function configureWorkerEnv(): void {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = '/models/';
  const ortBackends = (env as unknown as { backends?: { onnx?: { wasm?: { wasmPaths?: string } } } }).backends;
  if (ortBackends?.onnx?.wasm) {
    ortBackends.onnx.wasm.wasmPaths = '/ort/';
  }
}
```

- [ ] **Step 2: 워커의 load 구현**

```ts
// src/workers/ner.worker.ts
import * as Comlink from 'comlink';
import { pipeline } from '@huggingface/transformers';
import type { NerWorkerApi, Entity } from '@/core/nerWorkerClient';
import { configureWorkerEnv } from './nerEnv';

configureWorkerEnv();

let classifier: ((text: string, opts: { aggregation_strategy: 'simple' }) => Promise<Entity[]>) | null = null;
let labelMap: Record<number, string> = {};
let backend: 'webgpu' | 'wasm' = 'wasm';

async function tryLoad(device: 'webgpu' | 'wasm') {
  const pipe = await pipeline('token-classification', 'privacy-filter', {
    device,
    dtype: 'q4',
  } as never);
  return pipe;
}

const api: NerWorkerApi = {
  async load() {
    let pipe;
    try {
      pipe = await tryLoad('webgpu');
      backend = 'webgpu';
    } catch (e) {
      console.warn('[ner.worker] WebGPU 실패, WASM 폴백:', e);
      pipe = await tryLoad('wasm');
      backend = 'wasm';
    }
    classifier = pipe as never;
    // labelMap 추출 — pipe.model.config.id2label
    const cfg = (pipe as unknown as { model: { config: { id2label?: Record<number, string> } } }).model
      .config;
    labelMap = cfg.id2label ?? {};
    return { labelMap, backend };
  },
  async classify(text: string): Promise<Entity[]> {
    if (!classifier) throw new Error('classifier not loaded');
    const SCORE_FLOOR = 0.5;
    const out = await classifier(text, { aggregation_strategy: 'simple' });
    return out.filter((e) => e.score >= SCORE_FLOOR);
  },
  async unload() {
    classifier = null;
    labelMap = {};
  },
};

Comlink.expose(api);
```

`load` 의 모델 핸들 인자(spec 에는 `FileSystemDirectoryHandle | ArrayBuffer`) 는 본 task 에서는 무시 — 모델은 vite middleware 가 정적 서빙. OPFS 캐시 인입 로직은 Task 1.4.

- [ ] **Step 3: 빌드 확인 (type 체크)**

Run: `npm run lint`
Expected: PASS. transformers.js 의 타입이 strict 와 충돌하면 `as unknown as` 등으로 narrow.

- [ ] **Step 4: 커밋**

```bash
git add src/workers/ner.worker.ts src/workers/nerEnv.ts
git commit -m "feat(ner): NER 워커 load() 구현 (WebGPU 우선, WASM 폴백, score floor 0.5)"
```

---

### Task 1.3: nerWorkerClient — 실 워커 spawn

**Files:**
- Modify: `src/core/nerWorkerClient.ts`

- [ ] **Step 1: spawn 함수 추가**

기존 `createNerWorkerClient(api)` 는 테스트용으로 두고, 실 spawn 은 별도:

```ts
// src/core/nerWorkerClient.ts (추가분)
import * as Comlink from 'comlink';

export async function spawnNerWorker(): Promise<NerWorkerApi> {
  const worker = new Worker(new URL('../workers/ner.worker.ts', import.meta.url), {
    type: 'module',
  });
  const api = Comlink.wrap<NerWorkerApi>(worker);
  return {
    load: (h) => api.load(h),
    classify: (t) => api.classify(t),
    unload: () => api.unload(),
  };
}
```

- [ ] **Step 2: 빌드/lint 확인**

Run: `npm run lint && npm run build:nlp`
Expected: PASS. 워커가 vite 의 `?worker` 또는 `new Worker(new URL(..., import.meta.url))` 패턴으로 정상 번들되는지 확인. 만약 `inlineDynamicImports` 와 충돌하면 `worker.format` 설정 검토 (CLAUDE.md 의 "워커 포맷은 'es'" 규칙 참조).

- [ ] **Step 3: 커밋**

```bash
git add src/core/nerWorkerClient.ts
git commit -m "feat(ner): NER 워커 spawn 함수 (comlink wrap)"
```

---

### Task 1.4: nerModel — OPFS 캐시 + hash 메타

**Files:**
- Create: `src/core/nerModel.ts`
- Create: `tests/unit/nerModel.test.ts`

- [ ] **Step 1: 단위 테스트 (메모리 백업으로 OPFS 모킹)**

```ts
// tests/unit/nerModel.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { computeModelHash, type ModelMeta } from '@/core/nerModel';

describe('nerModel', () => {
  it('computeModelHash 는 동일 config.json 입력에 동일 결과를 반환한다', async () => {
    const a = new TextEncoder().encode('{"hidden_size": 256}');
    const b = new TextEncoder().encode('{"hidden_size": 256}');
    expect(await computeModelHash(a)).toBe(await computeModelHash(b));
  });
  it('config.json 이 다르면 hash 가 다르다', async () => {
    const a = new TextEncoder().encode('{"hidden_size": 256}');
    const b = new TextEncoder().encode('{"hidden_size": 128}');
    expect(await computeModelHash(a)).not.toBe(await computeModelHash(b));
  });
});
```

- [ ] **Step 2: nerModel 구현**

```ts
// src/core/nerModel.ts
export interface ModelMeta {
  id: string; // sha256 hash of config.json bytes
  modelName: string;
  loadedAt: number;
  labelMap: Record<number, string>;
}

export async function computeModelHash(configBytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', configBytes as BufferSource);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const META_KEY = 'ner.model.meta.v1';

export function readModelMeta(): ModelMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as ModelMeta) : null;
  } catch {
    return null;
  }
}

export function writeModelMeta(meta: ModelMeta): void {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}
```

(OPFS 디렉토리 복사·저장 로직은 Task 1.5 의 useNerModel 안에서. 본 모듈은 hash + 메타 직렬화에만 집중.)

- [ ] **Step 3: 테스트 통과**

Run: `npm test -- tests/unit/nerModel.test.ts`
Expected: PASS.

- [ ] **Step 4: 커밋**

```bash
git add src/core/nerModel.ts tests/unit/nerModel.test.ts
git commit -m "feat(ner): nerModel — config.json 기반 sha256 hash + localStorage 메타"
```

---

### Task 1.5: useNerModel hook + Toolbar 의 [NER 모델 로드] 버튼

**Files:**
- Create: `src/hooks/useNerModel.ts`
- Modify: `src/components/Toolbar.tsx`

- [ ] **Step 1: useNerModel 의 상태 머신**

```ts
// src/hooks/useNerModel.ts
import { useCallback, useEffect, useState } from 'react';
import { spawnNerWorker, type NerWorkerApi } from '@/core/nerWorkerClient';
import { computeModelHash, readModelMeta, writeModelMeta, type ModelMeta } from '@/core/nerModel';

export type NerModelState = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';

interface UseNerModel {
  state: NerModelState;
  meta: ModelMeta | null;
  worker: NerWorkerApi | null;
  loadFromUserDir(): Promise<void>;
  reset(): void;
}

export function useNerModel(): UseNerModel {
  const [state, setState] = useState<NerModelState>('idle');
  const [meta, setMeta] = useState<ModelMeta | null>(() => readModelMeta());
  const [worker, setWorker] = useState<NerWorkerApi | null>(null);

  // 첫 마운트 시 캐시 메타가 있으면 자동 로드 시도 — OPFS 안에 모델 파일이 살아있음을 가정.
  useEffect(() => {
    if (meta) {
      void autoLoadFromCache();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function autoLoadFromCache(): Promise<void> {
    setState('loading');
    try {
      const w = await spawnNerWorker();
      const { labelMap, backend } = await w.load(new ArrayBuffer(0)); // OPFS 자체 read 는 워커 안에서
      setWorker(w);
      setState('ready');
      console.log(`[useNerModel] 캐시에서 로드 (backend=${backend}, labels=${Object.keys(labelMap).length})`);
    } catch (e) {
      console.warn('[useNerModel] 캐시 로드 실패:', e);
      setState('error');
    }
  }

  const loadFromUserDir = useCallback(async (): Promise<void> => {
    setState('loading');
    try {
      const picker = (window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> })
        .showDirectoryPicker;
      if (!picker) {
        setState('unsupported');
        return;
      }
      const dirHandle = await picker.call(window);
      // config.json 읽어 hash 생성
      const configFile = await dirHandle.getFileHandle('config.json');
      const configBytes = new Uint8Array(await (await configFile.getFile()).arrayBuffer());
      const id = await computeModelHash(configBytes);
      // OPFS 에 복사 — 본 task 의 핵심
      await copyDirToOpfs(dirHandle, id);
      const w = await spawnNerWorker();
      const { labelMap } = await w.load(new ArrayBuffer(0));
      const newMeta: ModelMeta = {
        id,
        modelName: 'openai/privacy-filter',
        loadedAt: Date.now(),
        labelMap,
      };
      writeModelMeta(newMeta);
      setMeta(newMeta);
      setWorker(w);
      setState('ready');
    } catch (e) {
      console.error('[useNerModel] loadFromUserDir 실패:', e);
      setState('error');
    }
  }, []);

  const reset = useCallback(() => {
    void worker?.unload();
    setWorker(null);
    setMeta(null);
    setState('idle');
    localStorage.removeItem('ner.model.meta.v1');
  }, [worker]);

  return { state, meta, worker, loadFromUserDir, reset };
}

async function copyDirToOpfs(src: FileSystemDirectoryHandle, modelId: string): Promise<void> {
  const opfs = await navigator.storage.getDirectory();
  const models = await opfs.getDirectoryHandle('models', { create: true });
  const target = await models.getDirectoryHandle(modelId, { create: true });
  await copyRecursive(src, target);
}

async function copyRecursive(
  src: FileSystemDirectoryHandle,
  dst: FileSystemDirectoryHandle,
): Promise<void> {
  for await (const entry of (src as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
    if (entry.kind === 'file') {
      const f = await (entry as FileSystemFileHandle).getFile();
      const wf = await dst.getFileHandle(entry.name, { create: true });
      const writable = await (wf as unknown as { createWritable(): Promise<WritableStream> }).createWritable();
      await f.stream().pipeTo(writable as unknown as WritableStream);
    } else if (entry.kind === 'directory') {
      const sub = await dst.getDirectoryHandle(entry.name, { create: true });
      await copyRecursive(entry as FileSystemDirectoryHandle, sub);
    }
  }
}
```

> 주: 워커가 OPFS 에서 직접 모델 파일을 읽어 transformers.js 에 주입하는 부분은 별도 hook 필요. 본 task 에서는 vite middleware (dev) 또는 build inline (prod) 이 모델을 서빙한다는 가정 — `env.localModelPath = '/models/'` 가 그것. 즉 **dev/build 환경에서 사용자가 모델을 드는 첫 동작은 OPFS 복사이지만, 실제 추론에는 vite middleware/inline 이 우선**. 본구현 plan 의 후속 task (Task 1.6 또는 별도) 에서 OPFS → fetch 흐름 정합성 검증 필요. 작업자가 막히면 BLOCKED 로 escalate.

- [ ] **Step 2: Toolbar 의 [NER 모델 로드] 버튼**

Toolbar 의 기존 패턴을 따라 새 버튼 추가:

```tsx
// src/components/Toolbar.tsx 의 일부
const ner = useNerModel();
// ...
{import.meta.env.MODE === 'nlp' && (
  <Button variant="outline" onClick={() => void ner.loadFromUserDir()} disabled={ner.state === 'loading'}>
    {ner.state === 'ready' ? `NER 로드됨 (${ner.meta?.modelName ?? ''})` : 'NER 모델 로드'}
  </Button>
)}
```

`Button` 컴포넌트는 기존 shadcn primitive 사용. 정확한 import 경로는 기존 `src/components/Toolbar.tsx` 의 컨벤션을 따름.

- [ ] **Step 3: 빌드/타입 체크 통과**

Run: `npm run lint && npm run build:nlp`
Expected: PASS.

- [ ] **Step 4: 커밋**

```bash
git add src/hooks/useNerModel.ts src/components/Toolbar.tsx
git commit -m "feat(ner): useNerModel hook (OPFS 복사 + 자동 캐시 로드) + Toolbar 버튼"
```

> M1 phase 종료 게이트: `npm test && npm run lint && npm run build && npm run build:nlp` 4종 통과.

---

## Phase 2 (M2): spanMap

### Task 2.1: spanMap.serialize 단위 테스트 + 구현

**Files:**
- Create: `src/core/spanMap.ts`
- Create: `tests/unit/spanMap.test.ts`

- [ ] **Step 1: 인터페이스 정의 (작성만)**

```ts
// src/core/spanMap.ts
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CharIndexEntry {
  pageTextOffset: number;
  pdfBbox: BBox;
  lineId: number;
  spanId: number;
  /** 줄 경계로 추가된 '\n' 인지 */
  isLineBreak: boolean;
}

export interface PageMap {
  pageText: string;
  charIndex: CharIndexEntry[];
}

export interface StructuredLine {
  id: number;
  spans: Array<{
    id: number;
    chars: Array<{ ch: string; bbox: BBox }>;
  }>;
}

export function serialize(lines: StructuredLine[]): PageMap {
  throw new Error('not implemented');
}
```

- [ ] **Step 2: 단위 테스트**

```ts
// tests/unit/spanMap.test.ts
import { describe, it, expect } from 'vitest';
import { serialize, type StructuredLine } from '@/core/spanMap';

describe('spanMap.serialize', () => {
  it('단일 라인 단일 span 의 char 들을 직선 결합한다', () => {
    const lines: StructuredLine[] = [
      {
        id: 0,
        spans: [
          {
            id: 0,
            chars: [
              { ch: 'a', bbox: { x: 0, y: 0, w: 10, h: 10 } },
              { ch: 'b', bbox: { x: 10, y: 0, w: 10, h: 10 } },
            ],
          },
        ],
      },
    ];
    const map = serialize(lines);
    expect(map.pageText).toBe('ab');
    expect(map.charIndex).toHaveLength(2);
    expect(map.charIndex[0]).toMatchObject({ pageTextOffset: 0, lineId: 0, spanId: 0, isLineBreak: false });
  });

  it('두 라인 사이에 줄경계 \\n 을 삽입하고 charIndex 에도 항목을 추가한다', () => {
    const lines: StructuredLine[] = [
      { id: 0, spans: [{ id: 0, chars: [{ ch: 'a', bbox: { x: 0, y: 0, w: 10, h: 10 } }] }] },
      { id: 1, spans: [{ id: 1, chars: [{ ch: 'b', bbox: { x: 0, y: 20, w: 10, h: 10 } }] }] },
    ];
    const map = serialize(lines);
    expect(map.pageText).toBe('a\nb');
    expect(map.charIndex).toHaveLength(3);
    expect(map.charIndex[1].isLineBreak).toBe(true);
  });
});
```

- [ ] **Step 3: 테스트 실행 → fail**

Run: `npm test -- tests/unit/spanMap.test.ts`
Expected: FAIL — `not implemented`.

- [ ] **Step 4: serialize 구현**

```ts
export function serialize(lines: StructuredLine[]): PageMap {
  let pageText = '';
  const charIndex: CharIndexEntry[] = [];
  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) {
      // 줄 경계 — 직전 char 의 bbox 를 재사용 (없으면 영역 0)
      const prev = charIndex[charIndex.length - 1];
      charIndex.push({
        pageTextOffset: pageText.length,
        pdfBbox: prev?.pdfBbox ?? { x: 0, y: 0, w: 0, h: 0 },
        lineId: line.id,
        spanId: -1,
        isLineBreak: true,
      });
      pageText += '\n';
    }
    for (const span of line.spans) {
      for (const c of span.chars) {
        charIndex.push({
          pageTextOffset: pageText.length,
          pdfBbox: c.bbox,
          lineId: line.id,
          spanId: span.id,
          isLineBreak: false,
        });
        pageText += c.ch;
      }
    }
  });
  return { pageText, charIndex };
}
```

- [ ] **Step 5: 테스트 통과**

Run: `npm test -- tests/unit/spanMap.test.ts`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add src/core/spanMap.ts tests/unit/spanMap.test.ts
git commit -m "feat(ner): spanMap.serialize — 페이지 텍스트 + char ↔ PDF bbox 매핑"
```

---

### Task 2.2: spanMap.entitiesToBoxes 단위 테스트 + 구현

**Files:**
- Modify: `src/core/spanMap.ts`
- Modify: `tests/unit/spanMap.test.ts`

- [ ] **Step 1: 단위 테스트 추가**

```ts
// tests/unit/spanMap.test.ts 에 추가
import { entitiesToBoxes } from '@/core/spanMap';

describe('spanMap.entitiesToBoxes', () => {
  it('단일 라인 entity 는 char bbox 의 합집합 한 박스로 변환한다', () => {
    const lines: StructuredLine[] = [
      {
        id: 0,
        spans: [
          {
            id: 0,
            chars: [
              { ch: 'A', bbox: { x: 0, y: 0, w: 10, h: 10 } },
              { ch: 'l', bbox: { x: 10, y: 0, w: 10, h: 10 } },
              { ch: 'i', bbox: { x: 20, y: 0, w: 5, h: 10 } },
              { ch: 'c', bbox: { x: 25, y: 0, w: 10, h: 10 } },
              { ch: 'e', bbox: { x: 35, y: 0, w: 10, h: 10 } },
            ],
          },
        ],
      },
    ];
    const map = serialize(lines);
    const boxes = entitiesToBoxes(map, [
      { entity_group: 'private_person', start: 0, end: 5, score: 0.99 },
    ]);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].bbox).toEqual({ x: 0, y: 0, w: 45, h: 10 });
    expect(boxes[0].category).toBe('private_person');
  });

  it('두 라인을 가로지르는 entity 는 라인별로 박스를 분할한다', () => {
    const lines: StructuredLine[] = [
      {
        id: 0,
        spans: [
          {
            id: 0,
            chars: [
              { ch: 'A', bbox: { x: 0, y: 0, w: 10, h: 10 } },
              { ch: 'B', bbox: { x: 10, y: 0, w: 10, h: 10 } },
            ],
          },
        ],
      },
      {
        id: 1,
        spans: [
          {
            id: 1,
            chars: [
              { ch: 'C', bbox: { x: 0, y: 20, w: 10, h: 10 } },
              { ch: 'D', bbox: { x: 10, y: 20, w: 10, h: 10 } },
            ],
          },
        ],
      },
    ];
    const map = serialize(lines);
    // pageText: 'AB\nCD' (offsets 0..5). entity 0..5 는 두 라인을 모두 포함.
    const boxes = entitiesToBoxes(map, [
      { entity_group: 'private_person', start: 0, end: 5, score: 0.99 },
    ]);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].bbox).toEqual({ x: 0, y: 0, w: 20, h: 10 });
    expect(boxes[1].bbox).toEqual({ x: 0, y: 20, w: 20, h: 10 });
  });
});
```

- [ ] **Step 2: 테스트 → fail**

Run: `npm test -- tests/unit/spanMap.test.ts`
Expected: FAIL — `entitiesToBoxes is not exported`.

- [ ] **Step 3: 구현**

```ts
// src/core/spanMap.ts 에 추가
export interface NerEntity {
  entity_group: string;
  start: number;
  end: number;
  score: number;
}

export interface NerBox {
  category: string;
  bbox: BBox;
  score: number;
}

export function entitiesToBoxes(map: PageMap, entities: NerEntity[]): NerBox[] {
  const result: NerBox[] = [];
  for (const e of entities) {
    const slice = map.charIndex.filter(
      (c) => c.pageTextOffset >= e.start && c.pageTextOffset < e.end && !c.isLineBreak,
    );
    if (slice.length === 0) continue;
    // 라인별 그룹화
    const byLine = new Map<number, CharIndexEntry[]>();
    for (const c of slice) {
      const arr = byLine.get(c.lineId) ?? [];
      arr.push(c);
      byLine.set(c.lineId, arr);
    }
    for (const group of byLine.values()) {
      const xs = group.map((c) => c.pdfBbox.x);
      const ys = group.map((c) => c.pdfBbox.y);
      const xe = group.map((c) => c.pdfBbox.x + c.pdfBbox.w);
      const ye = group.map((c) => c.pdfBbox.y + c.pdfBbox.h);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const w = Math.max(...xe) - x;
      const h = Math.max(...ye) - y;
      result.push({ category: e.entity_group, bbox: { x, y, w, h }, score: e.score });
    }
  }
  return result;
}
```

- [ ] **Step 4: 테스트 통과**

Run: `npm test -- tests/unit/spanMap.test.ts`
Expected: PASS — 모든 테스트.

- [ ] **Step 5: 커밋**

```bash
git add src/core/spanMap.ts tests/unit/spanMap.test.ts
git commit -m "feat(ner): spanMap.entitiesToBoxes — 라인 단위 분할 + bbox 합집합"
```

> M2 phase 종료 게이트: `npm test && npm run lint && npm run build && npm run build:nlp`.

---

## Phase 3 (M3): nerDispatcher + auto trigger + 진행률 UI

### Task 3.1: nerDispatcher 단위 테스트 + 구현

**Files:**
- Create: `src/core/nerDispatcher.ts`
- Create: `tests/unit/nerDispatcher.test.ts`

- [ ] **Step 1: 단위 테스트**

```ts
// tests/unit/nerDispatcher.test.ts
import { describe, it, expect } from 'vitest';
import { NerDispatcher } from '@/core/nerDispatcher';

describe('NerDispatcher', () => {
  it('enqueueAll 후 next 가 priority desc / createdAt asc 로 작업을 반환한다', () => {
    const d = new NerDispatcher();
    d.enqueueAll(3); // pages 0,1,2 priority=0
    expect(d.next()).toBe(0);
    expect(d.next()).toBe(1);
    expect(d.next()).toBe(2);
    expect(d.next()).toBe(null);
  });

  it('bumpPriority 가 큐 안의 작업을 즉시 다음으로 끌어올린다', () => {
    const d = new NerDispatcher();
    d.enqueueAll(5);
    expect(d.next()).toBe(0); // 0 처리 시작
    d.markDone(0);
    d.bumpPriority(3);
    expect(d.next()).toBe(3);
  });

  it('cancel 후 next 는 null 을 돌려주고 results 는 비어있다', () => {
    const d = new NerDispatcher();
    d.enqueueAll(3);
    d.cancel();
    expect(d.next()).toBe(null);
  });

  it('progress 는 done/total 을 보고한다', () => {
    const d = new NerDispatcher();
    d.enqueueAll(4);
    expect(d.progress()).toEqual({ done: 0, total: 4 });
    d.markDone(0);
    d.markDone(1);
    expect(d.progress()).toEqual({ done: 2, total: 4 });
  });
});
```

- [ ] **Step 2: 테스트 → fail**

Run: `npm test -- tests/unit/nerDispatcher.test.ts`
Expected: FAIL — `NerDispatcher is not exported`.

- [ ] **Step 3: 구현**

```ts
// src/core/nerDispatcher.ts
interface QueueItem {
  pageIndex: number;
  priority: number;
  createdAt: number;
}

export class NerDispatcher {
  private queue: QueueItem[] = [];
  private done = new Set<number>();
  private total = 0;
  private cancelled = false;

  enqueueAll(pageCount: number): void {
    this.total = pageCount;
    const now = Date.now();
    for (let i = 0; i < pageCount; i++) {
      this.queue.push({ pageIndex: i, priority: 0, createdAt: now + i });
    }
  }

  next(): number | null {
    if (this.cancelled) return null;
    if (this.queue.length === 0) return null;
    this.queue.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    const item = this.queue.shift();
    return item ? item.pageIndex : null;
  }

  bumpPriority(pageIndex: number): void {
    const item = this.queue.find((q) => q.pageIndex === pageIndex);
    if (item) item.priority = 10;
  }

  markDone(pageIndex: number): void {
    this.done.add(pageIndex);
  }

  cancel(): void {
    this.cancelled = true;
    this.queue = [];
    this.done.clear();
    this.total = 0;
  }

  progress(): { done: number; total: number } {
    return { done: this.done.size, total: this.total };
  }
}
```

- [ ] **Step 4: 테스트 통과**

Run: `npm test -- tests/unit/nerDispatcher.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/core/nerDispatcher.ts tests/unit/nerDispatcher.test.ts
git commit -m "feat(ner): nerDispatcher — 페이지 큐 + 우선순위 + 진행률 + 캔슬"
```

---

### Task 3.2: useNerDetect hook + NerProgress 컴포넌트

**Files:**
- Create: `src/hooks/useNerDetect.ts`
- Create: `src/components/NerProgress.tsx`
- Modify: `src/state/store.ts` (NER 후보 + threshold + source)
- Modify: `src/state/selectors.ts`

- [ ] **Step 1: store 확장**

`src/state/store.ts` 의 candidate 타입에 `source: 'regex' | 'ner'`, `defaultChecked: boolean` 추가. NER 임계값 state 도 추가:

```ts
// store.ts 의 state 추가분
nerThreshold: number; // 0.5..0.95
setNerThreshold(v: number): void;
nerProgress: { done: number; total: number };
setNerProgress(p: { done: number; total: number }): void;
```

- [ ] **Step 2: useNerDetect**

```ts
// src/hooks/useNerDetect.ts
import { useEffect, useRef } from 'react';
import { useStore } from '@/state/store';
import { NerDispatcher } from '@/core/nerDispatcher';
import { serialize, entitiesToBoxes } from '@/core/spanMap';
import { useNerModel } from './useNerModel';
import { getPdfWorker } from '@/core/pdfWorkerClient';

export function useNerDetect(pageCount: number, currentPage: number): void {
  const ner = useNerModel();
  const setProgress = useStore((s) => s.setNerProgress);
  const addCandidates = useStore((s) => s.addNerCandidates);
  const dispatcherRef = useRef<NerDispatcher | null>(null);

  useEffect(() => {
    if (ner.state !== 'ready' || !ner.worker || pageCount === 0) return;
    const d = new NerDispatcher();
    d.enqueueAll(pageCount);
    dispatcherRef.current = d;
    let cancelled = false;

    void (async () => {
      while (!cancelled) {
        const p = d.next();
        if (p === null) break;
        const pdf = await (await getPdfWorker()).extractStructuredText(p);
        const map = serialize(pdf);
        const ents = await ner.worker!.classify(map.pageText);
        const boxes = entitiesToBoxes(map, ents);
        if (cancelled) return;
        addCandidates(p, boxes);
        d.markDone(p);
        setProgress(d.progress());
      }
    })();

    return () => {
      cancelled = true;
      d.cancel();
    };
  }, [ner.state, ner.worker, pageCount, addCandidates, setProgress]);

  useEffect(() => {
    dispatcherRef.current?.bumpPriority(currentPage);
  }, [currentPage]);
}
```

> 이 hook 은 기존 `getPdfWorker().extractStructuredText(p)` 가 spanMap 의 `StructuredLine[]` 형식을 반환한다고 가정한다. 만약 mupdf 의 현재 형식이 다르면 이 hook 안 또는 mupdfBridge 에 변환 layer 추가. 작업자가 막히면 BLOCKED.

- [ ] **Step 3: NerProgress 컴포넌트**

```tsx
// src/components/NerProgress.tsx
import { useStore } from '@/state/store';
import { useShallow } from 'zustand/react/shallow';

export function NerProgress() {
  const { done, total } = useStore(
    useShallow((s) => s.nerProgress)
  );
  if (total === 0) return null;
  if (done === total) return <div className="text-xs text-muted-foreground">NER 분석 완료 ({total}/{total})</div>;
  return (
    <div className="text-xs text-muted-foreground">
      NER 분석 중 {done} / {total}
    </div>
  );
}
```

- [ ] **Step 4: App.tsx 에 hook + 컴포넌트 통합**

`useNerDetect(pageCount, currentPage)` 호출 + 사이드바 적절한 자리에 `<NerProgress />` 배치.

- [ ] **Step 5: 빌드/타입 통과**

Run: `npm run lint && npm run build && npm run build:nlp`

- [ ] **Step 6: 커밋**

```bash
git add src/hooks/useNerDetect.ts src/components/NerProgress.tsx src/state/store.ts src/state/selectors.ts src/App.tsx
git commit -m "feat(ner): useNerDetect 디스패처 트리거 + NerProgress + store 확장"
```

> M3 게이트: 4종 빌드/테스트 통과.

---

## Phase 4 (M4): CandidatePanel UI 통합

### Task 4.1: CandidatePanel 5 카테고리 추가 + 출처 뱃지 + 신뢰도 슬라이더

**Files:**
- Modify: `src/components/CandidatePanel.tsx`

- [ ] **Step 1: 출처 뱃지 컴포넌트**

CandidatePanel 의 카테고리 헤더에 다음 형태 추가:

```tsx
<Badge variant={cat.source === 'regex' ? 'secondary' : 'warning'}>
  {cat.source === 'regex' ? '정규식' : 'NER · 검수 필요'}
</Badge>
```

- [ ] **Step 2: NER 5 카테고리 정의 추가**

기존 정규식 6 카테고리에 추가:

```ts
const NER_CATEGORIES = [
  { id: 'private_person', label: '사람 이름' },
  { id: 'private_address', label: '주소' },
  { id: 'private_url', label: 'URL' },
  { id: 'private_date', label: '날짜' },
  { id: 'secret', label: '시크릿/키' },
];
```

이 카테고리들에 속한 후보는 store 에서 `source: 'ner'` 로 들어와 있다.

- [ ] **Step 3: 신뢰도 슬라이더 (NER 카테고리 그룹 상단)**

```tsx
<Slider
  value={[threshold]}
  min={0.5}
  max={0.95}
  step={0.05}
  onValueChange={([v]) => setNerThreshold(v)}
/>
<span>신뢰도 ≥ {threshold.toFixed(2)}</span>
```

`Slider` 는 shadcn primitive — 없다면 추가 (`npx shadcn add slider`).

- [ ] **Step 4: 후보 필터링**

NER 후보의 표시는 `score >= nerThreshold` 만, 정규식은 그대로. 셀렉터에서 분리.

- [ ] **Step 5: NER 후보 기본 체크 OFF**

candidate 의 `defaultChecked` 가 false 면 스토어에 처음 들어올 때 `checked: false` 로 시작. 정규식은 `defaultChecked: true`.

- [ ] **Step 6: NER 모델 미로드 시 안내 카드**

`useNerModel().state` 가 `idle` 또는 `error` 일 때 NER 5 카테고리 자리에 텍스트 카드:

```
"NER 모델을 로드하면 사람 이름·주소·URL·날짜·시크릿 자동 검출이 추가됩니다."
```

- [ ] **Step 7: 빌드/타입 통과**

Run: `npm run lint && npm run build && npm run build:nlp`

- [ ] **Step 8: 커밋**

```bash
git add src/components/CandidatePanel.tsx src/components/ui/slider.tsx
git commit -m "feat(ner): CandidatePanel — 5 카테고리 + 출처 뱃지 + 신뢰도 슬라이더 + 기본 OFF"
```

---

### Task 4.2: UsageGuideModal 갱신

**Files:**
- Modify: `src/components/UsageGuideModal.tsx`

- [ ] **Step 1: NER 사용법 섹션 추가**

기존 가이드 끝에 한 단계 추가:

```md
4. (옵션) NER 모델 로드 — 상단 [NER 모델 로드] 버튼으로 받아둔 모델 폴더 선택. 사람 이름·주소 같은 비정형 PII 가 추가로 후보에 올라옵니다. 모델은 영어 우선 학습이라 한국어에서는 누락이 있을 수 있어 사용자 검수가 필요합니다.
```

- [ ] **Step 2: 빌드 통과**

Run: `npm run build:nlp`

- [ ] **Step 3: 커밋**

```bash
git add src/components/UsageGuideModal.tsx
git commit -m "docs(ui): UsageGuideModal 에 NER 사용법 + 한국어 한계 안내 추가"
```

> M4 게이트: 4종 통과 + 수동 시각 검수 (개발자 도구로 카테고리 11개 확인).

---

## Phase 5 (M5): 통합 테스트 + 문서

### Task 5.1: 영문 통합 테스트 (mock 워커)

**Files:**
- Create: `tests/integration/ner-flow.test.ts`

- [ ] **Step 1: mock 워커가 미리 정의된 entity 를 반환하도록 작성**

```ts
// tests/integration/ner-flow.test.ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStore } from '@/state/store';

vi.mock('@/core/nerWorkerClient', () => ({
  spawnNerWorker: async () => ({
    load: async () => ({ labelMap: {}, backend: 'wasm' }),
    classify: async (text: string) => {
      if (text.includes('Alice Smith')) {
        return [{ entity_group: 'private_person', start: 11, end: 22, score: 0.99, word: 'Alice Smith' }];
      }
      return [];
    },
    unload: async () => {},
  }),
}));

describe('NER 플로우 통합', () => {
  it('영문 페이지에서 mock 워커가 반환한 entity 가 store 의 NER 후보로 들어간다', async () => {
    // 1. mupdf mock 설정 — 페이지 1개, "My name is Alice Smith"
    // 2. useNerDetect 트리거
    // 3. store 에 candidate 가 source='ner' 로 추가됐는지 확인
    // (실제 코드는 store 와 mupdf 클라이언트 mock 에 의존 — 작업자가 환경에 맞춰 채움)
    expect(true).toBe(true);
  });
});
```

> 이 task 는 store / mupdf mock 셋업이 까다롭다. 작업자가 기존 통합 테스트 (`tests/integration/redact.test.ts`) 의 패턴을 따라 채운다.

- [ ] **Step 2: 테스트 통과**

Run: `npm test -- tests/integration/ner-flow.test.ts`

- [ ] **Step 3: 커밋**

```bash
git add tests/integration/ner-flow.test.ts
git commit -m "test(ner): 영문 NER 플로우 통합 테스트 (mock 워커)"
```

---

### Task 5.2: 한국어 baseline 모니터 (default skip)

**Files:**
- Create: `tests/integration/ner-realmodel.test.ts`
- Use: `tests/fixtures/ner-ko-baseline.json` (Task 0.2 시점 또는 휴먼이 PoC 단계에서 생성한 파일)

- [ ] **Step 1: skip 으로 표시한 모니터 테스트**

```ts
// tests/integration/ner-realmodel.test.ts
import { describe, it, expect } from 'vitest';
import baseline from '@/../tests/fixtures/ner-ko-baseline.json';

describe.skip('한국어 baseline 모니터 (실 모델 필요)', () => {
  it('현재 모델의 한국어 검출 결과가 baseline 과 너무 벗어나지 않는다', () => {
    // 실 모델로 KO_FIXTURES 추론 → 결과 비교
    // 카테고리별 검출 건수 차이가 임계값 (예: ±20%) 안인지 확인
    expect(baseline).toBeDefined();
  });
});
```

> CI 에서는 default skip. 로컬에서 `vitest --run --grep "한국어 baseline"` 로 명시 실행.

- [ ] **Step 2: 커밋**

```bash
git add tests/integration/ner-realmodel.test.ts
git commit -m "test(ner): 한국어 baseline 모니터 (default skip)"
```

---

### Task 5.3: README + CLAUDE.md + 릴리스 체크리스트 갱신

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/release-checklist.md`

- [ ] **Step 1: README — 빌드 분기 안내**

기존 빌드/실행 섹션에 추가:

```md
- `npm run build:nlp` — NER 보강 포함 빌드 (단일 HTML, ~70MB). 사용자가 받아둔 OpenAI privacy-filter 모델을 [NER 모델 로드] 버튼으로 선택해 사용.
```

- [ ] **Step 2: CLAUDE.md — NER 모듈 함정**

기존 함정 모음 섹션 다음에 새 섹션:

```md
## NER (transformers.js + onnxruntime-web) 함정

- **모델은 BYOM**, 도구가 자동 다운로드하지 않는다. `~/Downloads/privacy-filter` 가 기본, `POC_MODEL_DIR` 로 override.
- **onnxruntime-web 의 wasm 백엔드는 jsdelivr CDN 에서 fetch 하는 게 기본**. `env.backends.onnx.wasm.wasmPaths = '/ort/'` 로 로컬 경로 강제. dev 는 vite middleware (`ortRuntimeServer`), 빌드는 viteSingleFile inline.
- **워커 분리**. `src/workers/ner.worker.ts` 가 mupdf 워커 (`pdf.worker.ts`) 와 별개. 둘은 store 통해서만 합류.
- **NER 후보는 기본 OFF + 신뢰도 슬라이더 (0.5..0.95, 기본 0.7)**. score hard floor 는 워커 내 0.5. UI 슬라이더는 표시 필터만.
- **모델 캐시는 OPFS** (`navigator.storage.getDirectory()`). config.json 의 sha256 으로 hash, localStorage 메타에 매핑.
```

- [ ] **Step 3: 릴리스 체크리스트 — NER 빌드 검증**

```md
- [ ] `npm run build:nlp` 산출 70MB 이하
- [ ] 산출 HTML 안에 외부 fetch 발생 URL (jsdelivr 등) 0개 (string-only allow list 외)
- [ ] 산출 HTML 더블클릭 시 [NER 모델 로드] 동작 확인 — 받아둔 모델로 영문/한국어 추론 성공
```

- [ ] **Step 4: 커밋**

```bash
git add README.md CLAUDE.md docs/release-checklist.md
git commit -m "docs(ner): README + CLAUDE.md + 릴리스 체크리스트 갱신"
```

> M5 종료 게이트: 4종 빌드/테스트 통과 + 수동 영문/한국어 추론 1회 성공 (휴먼 검증). 게이트 통과 후 본구현 plan 종료, PR 작성.

---

## 종합 게이트

본구현 plan 의 모든 task 완료 후 다음을 확인:

1. `npm test && npm run lint && npm run build && npm run build:nlp` 4종 통과
2. 산출 `dist/index.html` 18MB 이하 (회귀 0)
3. 산출 `dist-nlp/index-nlp.html` 70MB 이하
4. 산출 NLP HTML 안에 실 fetch 외부 URL 0개
5. 휴먼 검증: NLP HTML 더블클릭 → 모델 로드 → 영문 케이스에서 person/email 검출 → 정규식 6 + NER 5 = 11 카테고리 표시 확인
6. 본구현 plan 의 PR 본문에 `docs/poc-ner-report.md` 의 측정 결과와 spec 갱신 (N7/N10) 인용

PR 머지 후 Task 8 (PoC 코드 정리) 의 결정 사항 (`compareEntityOffsets`/`fixtures` 영구화 위치) 이 모두 적용됐는지 확인.
