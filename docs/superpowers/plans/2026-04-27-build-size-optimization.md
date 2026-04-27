# 빌드 사이즈 최적화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 HTML 빌드 사이즈를 ~34MB → ~14MB로 줄인다 (WASM 이중 base64 인코딩 제거).

**Architecture:** WASM 바이너리를 워커 번들에서 분리한다. 메인 스레드가 base64 → Uint8Array 디코드를 1회만 수행하고 `postMessage` transferable로 워커에 zero-copy 이관한다. 워커는 init 핸드셰이크 완료 후에야 comlink `expose`를 호출하므로 RPC 타이밍이 안전하게 직렬화된다.

**Tech Stack:** React 19 / Vite 5 / vite-plugin-singlefile / mupdf 1.27 (WASM) / Comlink 4 / Vitest 2

---

## 핵심 변경 요약

```
Before:                                        After:
mupdfBinary.ts (13MB base64) ────┐            mupdfBinary.ts (13MB base64) ──┐
                                  │                                          │
pdf.worker.ts ◄── mupdfBridge.ts ◄┘            pdfWorkerClient.ts ◄──────────┘
                                                  │ decode 1회
?worker&inline (×1.37 base64)                     ▼ postMessage transfer
   = ~18MB 워커 dataURL                         pdf.worker.ts (gate: init-wasm)
                                                  │ setWasmBinary(buf)
                                                  ▼
                                                expose(comlink api)
```

---

## File Structure

| 파일 | 역할 | 변경 |
|---|---|---|
| `src/wasm/mupdfBinary.ts` | base64 + byteLength export (자동 생성) | 변경 없음 |
| `src/wasm/decodeMupdfWasm.ts` | base64 → Uint8Array + byteLength 검증 헬퍼 | **신규** |
| `src/core/mupdfBridge.ts` | mupdf 호출 통합 + WASM 초기화 | `MUPDF_WASM_BASE64` import 제거, `setWasmBinary` 추가, `ensureMupdfReady`가 외부 주입을 await |
| `src/workers/pdf.worker.ts` | comlink로 노출되는 워커 API | 모듈 로드 시 `init-wasm` 메시지를 기다린 후에만 `expose(api)` |
| `src/workers/pdfWorkerClient.ts` | 메인 스레드의 워커 핸들 | sync → async (`Promise<Remote<PdfWorkerApi>>`), wasm decode + transfer + ready 대기 |
| `src/hooks/useApply.ts` | apply RPC 호출 | `(await getPdfWorker()).apply(...)` |
| `src/hooks/useAutoDetect.ts` | detectAll RPC | 동일 |
| `src/hooks/useCanvasPainter.ts` | renderPage RPC | 동일 |
| `src/hooks/usePdfDocument.ts` | open RPC | 동일 |
| `src/hooks/useSpansForPage.ts` | extractSpans RPC | 동일 |
| `tests/integration/redact.test.ts` | 통합 테스트 (Node) | 새 init 경로로 wasm 주입 |
| `tests/unit/mupdfBridge-init.test.ts` | 브리지 init contract | **신규** |

---

## Task 1: 브리지 WASM 외부 주입 contract 단위 테스트

**Files:**
- Create: `tests/unit/mupdfBridge-init.test.ts`

- [ ] **Step 1: 단위 테스트 작성 (failing)**

```ts
// tests/unit/mupdfBridge-init.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('mupdfBridge WASM 외부 주입', () => {
  beforeEach(() => {
    // 모듈 캐시를 매 테스트마다 리셋해 ensureMupdfReady 의 단발 promise 가
    // 다른 케이스로 누수되지 않게 한다.
    vi.resetModules();
    delete (globalThis as { $libmupdf_wasm_Module?: unknown }).$libmupdf_wasm_Module;
  });

  it('setWasmBinary 호출 전에는 ensureMupdfReady 가 대기한다', async () => {
    const bridge = await import('@/core/mupdfBridge');
    let resolved = false;
    const p = bridge.ensureMupdfReady().then(() => {
      resolved = true;
    });
    // 한 마이크로태스크 진행해도 아직 resolved 가 아니어야 한다.
    await Promise.resolve();
    expect(resolved).toBe(false);
    // 이제 주입한다.
    const { decodeMupdfWasm } = await import('@/wasm/decodeMupdfWasm');
    bridge.setWasmBinary(decodeMupdfWasm());
    await p;
    expect(resolved).toBe(true);
  });

  it('setWasmBinary 가 ensureMupdfReady 보다 먼저 호출돼도 동작한다', async () => {
    const bridge = await import('@/core/mupdfBridge');
    const { decodeMupdfWasm } = await import('@/wasm/decodeMupdfWasm');
    bridge.setWasmBinary(decodeMupdfWasm());
    const mod = await bridge.ensureMupdfReady();
    expect(typeof mod.Document.openDocument).toBe('function');
  });
});
```

추가로 파일 최상단에 `import { vi } from 'vitest';` 도 포함한다.

- [ ] **Step 2: 테스트 실행 → fail 확인**

Run: `npm test -- tests/unit/mupdfBridge-init.test.ts`
Expected: FAIL — `setWasmBinary is not a function` (혹은 `decodeMupdfWasm` 모듈 없음)

- [ ] **Step 3: Commit (red 상태)**

```bash
git add tests/unit/mupdfBridge-init.test.ts
git commit -m "test(core): WASM 외부 주입 contract 단위 테스트 (red)"
```

---

## Task 2: decodeMupdfWasm 헬퍼

**Files:**
- Create: `src/wasm/decodeMupdfWasm.ts`

- [ ] **Step 1: 헬퍼 작성**

```ts
// src/wasm/decodeMupdfWasm.ts
import { MUPDF_WASM_BASE64, MUPDF_WASM_BYTE_LENGTH } from './mupdfBinary';

/**
 * 임베드된 mupdf WASM base64 문자열을 Uint8Array 로 디코드한다.
 * 디코드된 byteLength 가 임베드 시점에 기록된 값과 다르면 던진다.
 *
 * 주의: 이 함수가 import 되는 모든 진입점은 13MB 짜리 base64 상수를 번들에 끌어온다.
 * 프로덕션에서는 메인 스레드(`pdfWorkerClient`)와 Node 테스트에서만 호출되어야 한다.
 * 워커 번들은 이 모듈을 import 해서는 안 된다 (전체 최적화의 핵심).
 */
export function decodeMupdfWasm(): Uint8Array {
  const bin = atob(MUPDF_WASM_BASE64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  if (out.byteLength !== MUPDF_WASM_BYTE_LENGTH) {
    throw new Error(
      `mupdf WASM byteLength 불일치: 기대 ${MUPDF_WASM_BYTE_LENGTH}, 실제 ${out.byteLength}`,
    );
  }
  return out;
}
```

- [ ] **Step 2: 헬퍼는 단독으로 통과해야 할 단위 테스트가 따로 필요 없음**

`tests/unit/mupdfBridge-init.test.ts` 가 이 헬퍼를 import 하므로 통합적으로 검증된다.

- [ ] **Step 3: Commit**

```bash
git add src/wasm/decodeMupdfWasm.ts
git commit -m "feat(wasm): mupdf WASM base64 디코드 헬퍼 분리"
```

---

## Task 3: mupdfBridge 의 WASM 직접 import 제거 + setWasmBinary 도입

**Files:**
- Modify: `src/core/mupdfBridge.ts`

- [ ] **Step 1: import 제거 + Deferred 패턴 추가**

`src/core/mupdfBridge.ts` 상단의

```ts
import { MUPDF_WASM_BASE64, MUPDF_WASM_BYTE_LENGTH } from '@/wasm/mupdfBinary';
```

를 삭제한다.

같은 파일의 `decodeBase64` 함수도 더 이상 쓰이지 않으므로 삭제한다. (Task 2 의 헬퍼가 그 자리를 대신함.)

`mupdfModulePromise` 선언 바로 아래에 다음을 추가한다:

```ts
type WasmDeferred = {
  promise: Promise<Uint8Array>;
  resolve: (b: Uint8Array) => void;
};
let wasmDeferred: WasmDeferred | null = null;

function getWasmDeferred(): WasmDeferred {
  if (!wasmDeferred) {
    let resolve!: (b: Uint8Array) => void;
    const promise = new Promise<Uint8Array>((r) => {
      resolve = r;
    });
    wasmDeferred = { promise, resolve };
  }
  return wasmDeferred;
}

/**
 * WASM 바이너리를 외부에서 주입한다.
 * - 워커 환경: 메인이 postMessage 로 전달한 ArrayBuffer 를 Uint8Array 로 감싸 호출.
 * - Node 테스트: `decodeMupdfWasm()` 결과를 직접 호출.
 *
 * 두 번 이상 호출돼도 첫 호출의 buffer 만 적용된다 (Promise.resolve idempotency).
 */
export function setWasmBinary(buf: Uint8Array): void {
  getWasmDeferred().resolve(buf);
}
```

- [ ] **Step 2: ensureMupdfReady 본문을 외부 주입 await 로 교체**

기존:

```ts
export function ensureMupdfReady(): Promise<MupdfModule> {
  if (!mupdfModulePromise) {
    mupdfModulePromise = (async () => {
      const wasmBinary = decodeBase64(MUPDF_WASM_BASE64);
      if (wasmBinary.byteLength !== MUPDF_WASM_BYTE_LENGTH) {
        throw new Error(
          `mupdf WASM byteLength 불일치: 기대 ${MUPDF_WASM_BYTE_LENGTH}, 실제 ${wasmBinary.byteLength}`,
        );
      }
      const g = globalThis as unknown as Record<string, unknown>;
      ...
```

를 다음으로 바꾼다:

```ts
export function ensureMupdfReady(): Promise<MupdfModule> {
  if (!mupdfModulePromise) {
    mupdfModulePromise = (async () => {
      const wasmBinary = await getWasmDeferred().promise;
      // mupdf-wasm.js 가 globalThis["$libmupdf_wasm_Module"] 을 Emscripten Module 로 사용한다.
      // wasmBinary 를 미리 주입해 fetch 없이 인스턴스화한다.
      const g = globalThis as unknown as Record<string, unknown>;
      const existing = g['$libmupdf_wasm_Module'];
      const existingObj =
        typeof existing === 'object' && existing !== null
          ? (existing as Record<string, unknown>)
          : {};
      g['$libmupdf_wasm_Module'] = {
        ...existingObj,
        wasmBinary,
      };
      const mod = (await import('mupdf')) as MupdfModule;
      return mod;
    })();
  }
  return mupdfModulePromise;
}
```

- [ ] **Step 3: 단위 테스트 통과 확인**

Run: `npm test -- tests/unit/mupdfBridge-init.test.ts`
Expected: PASS — 두 케이스 모두 통과.

- [ ] **Step 4: 통합 테스트가 깨지는지 확인 (예상: red)**

Run: `npm test -- tests/integration/redact.test.ts`
Expected: FAIL — `ensureMupdfReady` 가 setWasmBinary 호출 없이 hang. (Task 4에서 고친다.)

- [ ] **Step 5: Commit**

```bash
git add src/core/mupdfBridge.ts
git commit -m "refactor(core): WASM 바이너리를 setWasmBinary 외부 주입으로 분리"
```

---

## Task 4: 통합 테스트가 새 init 경로로 동작하도록 수정

**Files:**
- Modify: `tests/integration/redact.test.ts`

- [ ] **Step 1: setWasmBinary 호출 추가**

`tests/integration/redact.test.ts` 의 import 블록과 beforeAll 을 다음과 같이 바꾼다:

```ts
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  applyRedactions,
  closeDocument,
  ensureMupdfReady,
  extractLines,
  openDocument,
  setWasmBinary,
} from '@/core/mupdfBridge';
import { decodeMupdfWasm } from '@/wasm/decodeMupdfWasm';
import { runDetectors } from '@/core/detectors';
import type { RedactionBox } from '@/types/domain';

describe('통합: 디지털 PDF 익명화', () => {
  beforeAll(async () => {
    setWasmBinary(decodeMupdfWasm());
    await ensureMupdfReady();
  });
  // ... (이하 동일)
```

- [ ] **Step 2: 통합 테스트 통과 확인**

Run: `npm test -- tests/integration/redact.test.ts`
Expected: PASS — `postCheckLeaks: 0` 그대로.

- [ ] **Step 3: 전체 테스트 그린 확인**

Run: `npm test`
Expected: 모든 테스트 (sanity + detector + store + undo + bridge-init + integration) 통과.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/redact.test.ts
git commit -m "test(integration): setWasmBinary 외부 주입 경로로 전환"
```

---

## Task 5: 워커 init 핸드셰이크

**Files:**
- Modify: `src/workers/pdf.worker.ts`

- [ ] **Step 1: 워커 모듈 로드 시점에 init-wasm 메시지를 먼저 기다리도록 변경**

`src/workers/pdf.worker.ts` 를 다음으로 교체한다:

```ts
import { expose, transfer } from 'comlink';
import { runDetectors } from '@/core/detectors';
import {
  applyRedactions,
  closeDocument,
  ensureMupdfReady,
  extractLines,
  extractSpans,
  openDocument,
  renderPage,
  setWasmBinary,
} from '@/core/mupdfBridge';
import type { PdfWorkerApi } from './pdf.worker.types';

const api: Partial<PdfWorkerApi> = {
  async ping() {
    await ensureMupdfReady();
    return 'pong' as const;
  },
  async open(buf, opts) {
    const pages = await openDocument(buf, opts?.password);
    return { pages };
  },
  async renderPage(pageIndex, scale) {
    const result = await renderPage(pageIndex, scale);
    return transfer(result, [result.bitmap]);
  },
  async extractSpans(pageIndex) {
    return extractSpans(pageIndex);
  },
  async detectAll(pageIndex) {
    const lines = await extractLines(pageIndex);
    return runDetectors(lines);
  },
  async apply(boxes, maskStyle) {
    const r = await applyRedactions(boxes, maskStyle);
    return transfer(r, [r.pdf.buffer]);
  },
  async close() {
    closeDocument();
  },
};

/**
 * 워커는 메인 스레드가 보낸 init-wasm 메시지를 받기 전까지 comlink expose 를 호출하지 않는다.
 *
 * 이렇게 해야:
 *   1. 메인이 큰 base64 WASM 을 1회만 디코드해 transferable buffer 로 전달 → 워커 번들 사이즈 감소.
 *   2. expose 가 늦게 attach 되므로, 메인이 wasm-ready 수신 전 RPC postMessage 를 보낼 위험이 없다.
 *
 * init-wasm 메시지 모양: { type: 'init-wasm', buffer: ArrayBuffer }
 * 응답: 'wasm-ready' (string) → 메인은 이를 받고 comlink wrap 진행.
 */
self.addEventListener(
  'message',
  function onInit(e: MessageEvent) {
    const data = e.data as unknown;
    if (
      typeof data === 'object' &&
      data !== null &&
      (data as { type?: unknown }).type === 'init-wasm' &&
      (data as { buffer?: unknown }).buffer instanceof ArrayBuffer
    ) {
      self.removeEventListener('message', onInit);
      const buffer = (data as { buffer: ArrayBuffer }).buffer;
      setWasmBinary(new Uint8Array(buffer));
      expose(api);
      // 메인에 ready 신호. 이 메시지는 plain string 이라 comlink RPC 와 충돌하지 않는다
      // (comlink 페이로드는 항상 객체).
      self.postMessage('wasm-ready');
    }
  },
);
```

- [ ] **Step 2: 타입 체크**

Run: `npm run lint`
Expected: tsc 클린 (TS6310 등 없음).

- [ ] **Step 3: Commit**

```bash
git add src/workers/pdf.worker.ts
git commit -m "feat(worker): init-wasm 핸드셰이크 후에만 comlink expose"
```

---

## Task 6: 클라이언트 비동기화 + WASM transfer

**Files:**
- Modify: `src/workers/pdfWorkerClient.ts`

- [ ] **Step 1: getPdfWorker 를 Promise 기반으로 교체**

`src/workers/pdfWorkerClient.ts` 를 다음으로 교체한다:

```ts
import { wrap, type Remote } from 'comlink';
import PdfWorker from './pdf.worker.ts?worker&inline';
import { decodeMupdfWasm } from '@/wasm/decodeMupdfWasm';
import type { PdfWorkerApi } from './pdf.worker.types';

let cached: Promise<Remote<PdfWorkerApi>> | null = null;

/**
 * 워커를 1회 생성하고 init-wasm 핸드셰이크가 끝나야 comlink Remote 를 반환한다.
 *
 * 1. 새 Worker 생성 (vite `?worker&inline` ESM 워커, file:// 호환 플러그인 적용)
 * 2. base64 WASM 을 1회 디코드해 ArrayBuffer 를 transferable 로 전송 → 메인 메모리 즉시 해제
 * 3. 워커가 'wasm-ready' string 메시지를 보낼 때까지 대기
 * 4. comlink wrap 후 캐시
 */
export function getPdfWorker(): Promise<Remote<PdfWorkerApi>> {
  if (cached) return cached;
  cached = (async () => {
    const w = new PdfWorker();
    const wasmBytes = decodeMupdfWasm();
    const buffer = wasmBytes.buffer;

    await new Promise<void>((resolve, reject) => {
      const onMessage = (e: MessageEvent): void => {
        if (e.data === 'wasm-ready') {
          w.removeEventListener('message', onMessage);
          w.removeEventListener('error', onError);
          resolve();
        }
      };
      const onError = (e: ErrorEvent): void => {
        w.removeEventListener('message', onMessage);
        w.removeEventListener('error', onError);
        reject(new Error(`pdf.worker init error: ${e.message}`));
      };
      w.addEventListener('message', onMessage);
      w.addEventListener('error', onError);
      // ArrayBuffer 를 transferable 로 보내면 메인 측 wasmBytes 의 underlying buffer 가 detach
      // 되어 즉시 GC 후보가 된다. 캐시할 필요가 없으므로 의도된 동작.
      w.postMessage({ type: 'init-wasm', buffer }, [buffer]);
    });

    return wrap<PdfWorkerApi>(w);
  })();
  return cached;
}
```

- [ ] **Step 2: 빌드 타입 체크**

Run: `npm run lint`
Expected: tsc 클린. (호출부 5곳이 아직 sync expectation 이라 에러가 날 수 있음 — Task 7에서 같이 본다. 만약 에러가 호출부 5곳에서만 발생한다면 그대로 다음 task 로.)

- [ ] **Step 3: Commit (호출부 미변경 상태로 일단 커밋)**

```bash
git add src/workers/pdfWorkerClient.ts
git commit -m "feat(client): WASM 디코드 + transferable + ready 핸드셰이크"
```

---

## Task 7: 5개 훅 호출부를 await getPdfWorker() 로 갱신

**Files:**
- Modify: `src/hooks/useApply.ts:12`
- Modify: `src/hooks/useAutoDetect.ts:14`
- Modify: `src/hooks/useCanvasPainter.ts:18`
- Modify: `src/hooks/usePdfDocument.ts:30`
- Modify: `src/hooks/useSpansForPage.ts:14`

각 파일에서 `getPdfWorker().<method>(...)` 패턴을 `(await getPdfWorker()).<method>(...)` 로 바꾼다. 모두 이미 `async` 함수 안에서 호출되므로 추가적인 async 전환은 필요 없다.

- [ ] **Step 1: useApply.ts**

라인 12 근방의

```ts
const { pdf, report } = await getPdfWorker().apply(enabled, s.maskStyle);
```

를

```ts
const api = await getPdfWorker();
const { pdf, report } = await api.apply(enabled, s.maskStyle);
```

로 바꾼다. (인라인 `(await getPdfWorker()).apply(...)` 도 가능하지만 두 줄로 분리하는 편이 가독성/디버깅에 유리.)

- [ ] **Step 2: useAutoDetect.ts**

라인 14:

```ts
const candidates = await getPdfWorker().detectAll(page);
```

→

```ts
const api = await getPdfWorker();
const candidates = await api.detectAll(page);
```

- [ ] **Step 3: useCanvasPainter.ts**

라인 18:

```ts
const r = await getPdfWorker().renderPage(page, scale);
```

→

```ts
const api = await getPdfWorker();
const r = await api.renderPage(page, scale);
```

- [ ] **Step 4: usePdfDocument.ts**

라인 30:

```ts
const { pages } = await getPdfWorker().open(buf, opts);
```

→

```ts
const api = await getPdfWorker();
const { pages } = await api.open(buf, opts);
```

- [ ] **Step 5: useSpansForPage.ts**

라인 14:

```ts
const v = await getPdfWorker().extractSpans(pageIndex);
```

→

```ts
const api = await getPdfWorker();
const v = await api.extractSpans(pageIndex);
```

- [ ] **Step 6: 타입 체크 + 테스트 그린 확인**

Run:
```bash
npm run lint
npm test
```
Expected: tsc 0 error, 모든 테스트 그린.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useApply.ts src/hooks/useAutoDetect.ts src/hooks/useCanvasPainter.ts src/hooks/usePdfDocument.ts src/hooks/useSpansForPage.ts
git commit -m "refactor(hooks): getPdfWorker 비동기화 대응"
```

---

## Task 8: 빌드 사이즈 측정 + 검증

**Files:** (변경 없음)

- [ ] **Step 1: 빌드**

Run:
```bash
npm run build
```
Expected:
- `dist/index.html` 생성 성공
- `node scripts/verify-no-external.mjs` 가 외부 URL 0 보고 (postbuild)

- [ ] **Step 2: 사이즈 비교**

Run:
```bash
ls -lh dist/index.html
```
Expected:
- 변경 전: 약 34MB (이전 커밋 기준)
- 변경 후: 13~15MB 수준 (목표 ~14MB)

만약 결과가 20MB 이상이면 워커 번들에 mupdfBinary 가 여전히 포함된 것 → bundle analyzer 또는 grep 으로 확인:
```bash
grep -o "MUPDF_WASM_BASE64" dist/index.html | wc -l
```
워커 chunk 와 메인 chunk 양쪽에 등장하면 (값이 2 이상) 의도와 다름. 1 이어야 정상.

- [ ] **Step 3: 통합 테스트 재실행**

Run: `npm test`
Expected: 32/32 그대로 그린.

- [ ] **Step 4: Commit (사이즈 측정 결과 기록 — HANDOFF.md 가 있다면 업데이트)**

`HANDOFF.md` 의 "빌드 산출물 35.9MB" 문단을 새 측정값으로 갱신:

```diff
-- **빌드 산출물 35.9MB** (예상 15-25MB의 1.4~2배): `?worker&inline`으로 워커 번들이 base64 dataURL이 되면서 WASM 문자열이 사실상 두 번 인코딩됨. → **해결책**: 메인 스레드에서 wasm Uint8Array를 받아 `worker.postMessage(buf, [buf.buffer])`로 transfer 하고, 워커는 메시지로 받은 바이트로 `globalThis.$libmupdf_wasm_Module`을 세팅. 후속 작업 권장
+- **빌드 산출물 ~14MB** (2026-04-27 최적화): WASM 을 워커 번들에서 빼내 메인이 1회 디코드 후 transferable 로 워커에 이관. `?worker&inline` 의 이중 base64 인코딩 제거.
```

```bash
git add HANDOFF.md
git commit -m "docs: 빌드 사이즈 최적화 결과 반영"
```

---

## Task 9: 브라우저 수동 스모크

**Files:** (변경 없음)

- [ ] **Step 1: dev 서버에서 확인**

Run: `npm run dev`

브라우저(`http://localhost:5173`)에서:
- DevTools Console 에러 없음
- PDF 드롭 → 캔버스 렌더 OK
- 자동 탐지 후보 표시 → "익명화 적용" → 다운로드 버튼 활성화

- [ ] **Step 2: 빌드 산출물에서 확인 (file:// 가장 까다로운 경로)**

Run: `npm run build && open dist/index.html`

체크 항목:
- DevTools Console 에 init-wasm 관련 에러 없음
- 워커 ping 성공 (앱이 정상 동작)
- PDF 업로드 → 적용 → 다운로드 전체 플로우
- 결과 PDF 의 메타데이터가 비어 있음

- [ ] **Step 3: 검증 결과 기록**

`docs/poc-report.md` 의 사용자 수동 검증 체크리스트 (이미 존재) 갱신.

```bash
git add docs/poc-report.md
git commit -m "docs: 빌드 사이즈 최적화 후 수동 스모크 기록"
```

---

## Self-Review 결과

**Spec 커버리지**:
- ✅ WASM 단일 임베드 (Task 2, 3, 6)
- ✅ 워커 번들에서 WASM 제거 (Task 3, 5)
- ✅ postMessage transferable (Task 6)
- ✅ 단일 HTML 모드 호환 검증 (Task 8 step 2 — `?worker&inline` + viteSingleFile 그대로 사용)
- ✅ 외부 URL 0 검증 유지 (Task 8 step 1 — postbuild 그대로)

**Placeholder 스캔**: 없음. 모든 코드 블록은 실제 적용할 코드.

**타입/시그니처 일관성**:
- `setWasmBinary(buf: Uint8Array): void` — Task 3 정의, Task 4/5에서 동일 시그니처로 호출.
- `getPdfWorker(): Promise<Remote<PdfWorkerApi>>` — Task 6 정의, Task 7에서 await 으로 일관 사용.
- `decodeMupdfWasm(): Uint8Array` — Task 2 정의, Task 1/4/6 에서 동일 사용.
- 메시지 프로토콜: `{ type: 'init-wasm', buffer: ArrayBuffer }` (요청) / `'wasm-ready'` (응답) — Task 5 정의, Task 6 에서 동일 매칭.

**리스크 / 미리 알아둘 것**:
- comlink 페이로드는 항상 객체이므로 `'wasm-ready'` plain string 으로 충돌을 피한다 (Task 5 주석 참조).
- 워커가 `init-wasm` 외 메시지를 받으면 무시된다 — 이 경우 메시지가 사라지지만, 메인은 `wasm-ready` 가 올 때까지 comlink wrap 을 미루므로 RPC 메시지가 워커로 빠지는 일은 발생하지 않는다.
- transferable 후 main 의 `wasmBytes.buffer` 는 detach 되므로 재사용 금지 (Task 6 주석 참조).
- `vi.resetModules()` 로 매 단위 테스트마다 모듈 상태 리셋 필요 (Task 1).
