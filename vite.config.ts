import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

/**
 * mupdf 의 ESM 엔트리(`mupdf-wasm.js`)는 다음 패턴을 포함한다:
 *   new URL("mupdf-wasm.wasm", import.meta.url).href
 *
 * Vite 의 asset plugin 이 이를 정적 자산 import 로 인식해 WASM 파일을 별도 chunk 로 emit
 * 하고, 단일 HTML 모드에서는 이를 base64 dataURL 로 inline 한다 (×1.37 인플레이션).
 *
 * 우리는 mupdf 초기화 직전에 globalThis.$libmupdf_wasm_Module.wasmBinary 를 주입해 사용하므로
 * mupdf 는 위 URL 을 절대 fetch 하지 않는다. URL 구성을 빈 문자열 리터럴로 치환해 Vite
 * 의 자산 emit 을 회피한다. 이로써 단일 HTML 빌드 사이즈가 약 30MB → ~14MB 로 감소한다.
 *
 * 패턴이 발견되지 않으면 mupdf 포맷이 변경된 것이므로 빌드를 실패시켜 회귀를 명시화한다.
 */
function stripMupdfWasmAsset(): Plugin {
  const needle = 'new URL("mupdf-wasm.wasm",import.meta.url).href';
  return {
    name: 'strip-mupdf-wasm-asset',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('mupdf-wasm.js')) return null;
      if (!code.includes(needle)) {
        this.error(
          `strip-mupdf-wasm-asset: 패턴을 찾지 못했습니다. mupdf 가 업그레이드된 것 같습니다. ` +
            `'${needle}' 가 mupdf-wasm.js 에 더 이상 존재하지 않으면 빌드 사이즈 최적화가 깨집니다.`,
        );
      }
      return {
        code: code.replace(needle, '""'),
        map: null,
      };
    },
  };
}

/**
 * transformers.js 4.2 의 `src/backends/onnx.js` 는 onnxruntime-web 백엔드 로드 시점에
 * 다음 기본 wasmPaths 를 세팅한다 (https://cdn.jsdelivr.net/npm/onnxruntime-web@<version>/dist/).
 *
 *   const wasmPathPrefix = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ONNX_ENV.versions.web}/dist/`;
 *   ONNX_ENV.wasm.wasmPaths = ... { mjs: `${wasmPathPrefix}...`, wasm: `${wasmPathPrefix}...` }
 *
 * 우리는 `configureNerEnv()` 에서 `wasmPaths = '/ort/'` 로 덮어써 실제 런타임 fetch 는
 * jsdelivr 로 가지 않지만, 위 jsdelivr 템플릿 리터럴이 산출 HTML 에 dead-string 으로 남아
 * `verify-no-external` 가 차단한다 (외부 네트워크 0 정책의 string-scan 가드).
 *
 * 정책상 jsdelivr URL 은 allow list 에 절대 추가하지 않는다. 따라서 mupdf 처럼 빌드 시점에
 * 리터럴을 비파괴적으로 무력화 (jsdelivr → about:blank/) 한다. configureNerEnv 의 override 가
 * 어차피 먼저 적용되므로 이 dead path 가 실행되어도 결과는 동일하다.
 *
 * 회귀 가드 메모: mupdf / onnx-proxy 와 달리 본 플러그인은 needle 미스매치 시 silent
 * return 한다. 이유는 `@huggingface/transformers` 패키지 안의 여러 모듈을 `transform`
 * 이 거치므로 (id 필터가 패키지 단위라 넓다) 패턴이 없는 모듈도 정상이기 때문이다.
 * transformers.js 업그레이드로 jsdelivr 리터럴이 사라지거나 형태가 바뀌어 strip 이
 * 동작하지 않게 되면, postbuild 의 `scripts/verify-no-external.mjs` 가 산출 HTML 에서
 * jsdelivr URL 을 발견해 빌드를 실패시킨다 (회귀 가드는 산출 단계에서 명시화된다).
 */
function stripOnnxJsdelivrDefault(): Plugin {
  // transformers.js 4.2 의 minified template literal 시그니처. 버전 부분(`${ONNX_ENV.versions.web}`)
  // 은 minify 후 변수명이 바뀌므로 안정적인 prefix 만 매칭.
  const needle = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@';
  return {
    name: 'strip-onnx-jsdelivr-default',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@huggingface/transformers')) return null;
      if (!code.includes(needle)) return null;
      // 같은 파일에 여러 번 등장할 수 있으므로 모두 치환. about:blank/ 는 절대 URL 이지만
      // verify-no-external 의 https?:\/\/ 정규식에 걸리지 않고 fetch 시도해도 외부로 나가지 않는다.
      return {
        code: code.split(needle).join('about:blank/onnxruntime-web@'),
        map: null,
      };
    },
  };
}

/**
 * onnxruntime-web 의 `ort.webgpu.bundle.min.mjs` 에는 wasm 파일을 가리키는 `new URL("ort-wasm...wasm",
 * import.meta.url).href` 패턴이 두 군데 등장한다:
 *
 *   1. 메인 스레드의 `WebAssembly.instantiateStreaming` fallback — `locateFile` 도 없고 `wasmPaths`
 *      도 없을 때 wasm 을 직접 fetch 하는 경로.
 *   2. **proxy worker 의 `init-wasm` 메시지 wasmPaths fallback** — proxy 모드에서 worker 에 보낼
 *      wasmPaths 가 비어있고 SharedArrayBuffer 가 없을 때 fallback.
 *
 * Vite 의 asset emit 은 두 패턴을 각각 별도 자산으로 처리해 동일한 wasm 을 base64 dataURL 로
 * **두 번** 인라인한다 (총 약 60MB → 사이즈 예산 70MB 가까이 압박).
 *
 * `configureNerEnv()` 가 항상 `wasm.wasmPaths = '/ort/'` 를 미리 세팅하므로 (2) 의 분기 (`!i.in.wasm.wasmPaths`)
 * 는 런타임에서 절대 truthy 가 되지 않는다. 따라서 (2) 의 `new URL(...)` 표현식 자체를
 * 빈 문자열 리터럴로 치환해 Vite 의 자산 emit 을 회피한다 — 산출 사이즈가 약 30MB 감소한다.
 *
 * (1) 은 그대로 둔다. 이 분기는 본 빌드에서 file:// 더블클릭 동작 시 wasmPaths 가 dev 와 달리
 * 절대 fetch 가 안 되므로 (file:// 의 Same Origin Policy) wasm dataURL 이 유일한 inline 경로다.
 *
 * 패턴이 변하면 onnxruntime-web 가 업그레이드된 것이므로 빌드를 실패시켜 회귀를 명시화한다.
 */
function stripOnnxProxyWasmDataUrl(): Plugin {
  // proxy worker 의 init-wasm fallback. minified 변수명(`i`, `s`, `tn`)은 버전에 따라 바뀔 수 있어
  // 안정 부분만 매칭. import.meta.url 을 쓰는 wasm new URL 은 본 패턴 1건뿐이라 부수효과 없음.
  const needle =
    '.in.wasm.wasmPaths={wasm:new URL("ort-wasm-simd-threaded.asyncify.wasm",import.meta.url).href}';
  const replacement = '.in.wasm.wasmPaths={wasm:""}';
  return {
    name: 'strip-onnx-proxy-wasm-dataurl',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('ort.webgpu.bundle.min.mjs')) return null;
      if (!code.includes(needle)) {
        this.error(
          `strip-onnx-proxy-wasm-dataurl: 패턴을 찾지 못했습니다. onnxruntime-web 가 업그레이드된 것 같습니다. ` +
            `'${needle}' 가 ort.webgpu.bundle.min.mjs 에 더 이상 존재하지 않으면 빌드 사이즈 예산이 깨집니다.`,
        );
      }
      return {
        code: code.replace(needle, replacement),
        map: null,
      };
    },
  };
}

function deferredWasmModuleWorker(): Plugin {
  const needle = 'export default function WorkerWrapper(options) {\n            let objURL;';
  const replacement = `function createFileProtocolModuleWorker(encodedJs, options) {
            const workerSource = [
              'URL.revokeObjectURL(self.location.href);',
              'const encodedJs = ' + JSON.stringify(encodedJs) + ';',
              'const decodeBase64 = (base64) => Uint8Array.from(atob(base64), c => c.charCodeAt(0));',
              'const queuedMessages = [];',
              'let importStarted = false;',
              'const replayQueuedMessages = () => {',
              '  self.removeEventListener("message", queueMessage);',
              '  for (const event of queuedMessages) {',
              '    self.dispatchEvent(new MessageEvent("message", { data: event.data, ports: event.ports }));',
              '  }',
              '};',
              'const reportImportError = (error) => {',
              '  self.postMessage({ type: "init-error", message: String(error && error.message ? error.message : error) });',
              '  setTimeout(() => { throw error; });',
              '};',
              'const startModuleImport = () => {',
              '  if (importStarted) return;',
              '  importStarted = true;',
              '  const moduleBlob = new Blob(["URL.revokeObjectURL(import.meta.url);", decodeBase64(encodedJs)], { type: "text/javascript;charset=utf-8" });',
              '  const moduleURL = URL.createObjectURL(moduleBlob);',
              '  import(moduleURL).then(replayQueuedMessages).catch(reportImportError);',
              '};',
              'const installWasmBinary = (buffer) => {',
              '  const existing = self.$libmupdf_wasm_Module;',
              '  const existingObj = existing && typeof existing === "object" ? existing : {};',
              '  self.$libmupdf_wasm_Module = { ...existingObj, wasmBinary: new Uint8Array(buffer) };',
              '};',
              'const queueMessage = (event) => {',
              '  queuedMessages.push(event);',
              '  event.stopImmediatePropagation();',
              '  const data = event.data;',
              '  if (data && data.type === "init-wasm" && data.buffer instanceof ArrayBuffer) {',
              '    installWasmBinary(data.buffer);',
              '    startModuleImport();',
              '  }',
              '};',
              'self.addEventListener("message", queueMessage);',
            ].join('');
            const workerURL = (self.URL || self.webkitURL).createObjectURL(
              new Blob([workerSource], { type: "text/javascript;charset=utf-8" })
            );
            const worker = new Worker(workerURL, { name: options?.name });
            worker.addEventListener("error", () => {
              (self.URL || self.webkitURL).revokeObjectURL(workerURL);
            });
            return worker;
          }
          export default function WorkerWrapper(options) {
            return createFileProtocolModuleWorker(encodedJs, options);
            let objURL;`;

  return {
    name: 'deferred-wasm-module-worker',
    enforce: 'post',
    transform(code) {
      if (!code.includes('const encodedJs =') || !code.includes(needle)) {
        return null;
      }

      return {
        code: code.replace(needle, replacement),
        map: null,
      };
    },
  };
}

/**
 * NLP 모드 dev 서버에서 onnxruntime-web 의 wasm / .mjs runtime 파일을 로컬 서빙한다.
 *
 * transformers.js 4.2 의 onnxruntime-web 백엔드는 기본 `wasmPaths` 가 jsdelivr CDN 이라
 * dev 에서 `cdn.jsdelivr.net/npm/onnxruntime-web@.../dist/` 로 fetch 가 나간다. 외부
 * 네트워크 0 정책을 깨뜨리므로 `/ort/` prefix 로 mount 해 `node_modules/onnxruntime-web/dist/`
 * 를 같은 origin 으로 노출한다 (`configureNerEnv.ts` 가 wasmPaths 를 `/ort/` 로 덮어쓴다).
 *
 * dev 서버 전용. 본 빌드(`build:nlp`)에서는 onnxruntime-web 이 `viteSingleFile` 로 inline
 * 되어 단일 HTML 안에 들어가므로 런타임에 추가 fetch 가 발생하지 않는다.
 */
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

/**
 * NLP 모드 dev 서버에서 로컬 모델 디렉토리를 정적 서빙한다.
 *
 * transformers.js 는 `pipeline(task, modelId, ...)` 호출 시 fetch 로 `${origin}/${localModelPath}/${modelId}/...`
 * 을 요청한다. PoC 단계에서는 사용자가 받아둔 폴더 (기본 `~/Downloads/privacy-filter`,
 * `POC_MODEL_DIR` 로 override) 를 `/models/privacy-filter/` 로 mount 해 표준 fetch 흐름으로
 * 동작시킨다. dev 서버에서만 활성. 빌드(`build:nlp`) 산출물에는 영향 없음.
 */
function pocModelServer(): Plugin {
  const modelDir = process.env.POC_MODEL_DIR ?? path.join(os.homedir(), 'Downloads', 'privacy-filter');
  const URL_PREFIX = '/models/privacy-filter/';
  return {
    name: 'poc-model-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith(URL_PREFIX)) return next();
        const relPath = decodeURIComponent(req.url.slice(URL_PREFIX.length).split('?')[0]);
        const safe = path.posix.normalize('/' + relPath).slice(1);
        const filePath = path.join(modelDir, safe);
        if (!filePath.startsWith(modelDir)) {
          res.statusCode = 403;
          res.end('forbidden');
          return;
        }
        try {
          const data = await fs.readFile(filePath);
          if (filePath.endsWith('.json')) res.setHeader('Content-Type', 'application/json');
          else if (filePath.endsWith('.onnx')) res.setHeader('Content-Type', 'application/octet-stream');
          else if (filePath.endsWith('.onnx_data')) res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Content-Length', String(data.byteLength));
          res.end(data);
        } catch (e) {
          res.statusCode = 404;
          res.end(`poc-model-server: ${(e as Error).message}`);
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const isMulti = mode === 'multi';
  const isNlp = mode === 'nlp';
  // NLP 모드는 별도 진입 HTML(`index-nlp.html`) 을 입력으로 받아 `dist-nlp/` 에 산출한다.
  // 기존 단일 파일/플러그인 파이프라인은 그대로 적용해 file:// 더블클릭 동작 가정을 유지.
  // rollup `input` 을 `{ index: ... }` 객체로 주면 산출 HTML 이 입력 basename 대신 키 이름
  // (`index.html`) 으로 emit 되어 `dist-nlp/index.html` 통일 — postbuild 의 verify 스크립트가
  // 모드에 무관하게 동일 경로를 검사할 수 있다.
  const inputEntry: Record<string, string> = isNlp
    ? { index: path.resolve(__dirname, 'index-nlp.html') }
    : { index: path.resolve(__dirname, 'index.html') };
  return {
    plugins: [
      react(),
      stripMupdfWasmAsset(),
      deferredWasmModuleWorker(),
      ...(isNlp
        ? [pocModelServer(), ortRuntimeServer(), stripOnnxJsdelivrDefault(), stripOnnxProxyWasmDataUrl()]
        : []),
      ...(isMulti ? [] : [viteSingleFile()]),
    ],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    // React DOM 19 는 Navigation API 가 있으면 synthetic navigation 을 시작한다.
    // 단일 HTML 을 file:// 로 직접 열 때 Chrome 이 이 자기 자신 replace 탐색을
    // 차단하므로, 이 앱에서는 전역 navigation 참조를 번들 시점에 제거한다.
    //
    // NLP 모드에서는 transformers.js 가 huggingface hub 로 모델을 fetch 하지 않도록
    // `globalThis.__NER_ALLOW_REMOTE__` 를 false 로 컴파일 타임 가드한다.
    define: {
      navigation: 'undefined',
      'globalThis.__NER_ALLOW_REMOTE__': JSON.stringify(false),
    },
    // mupdf 의 ESM 엔트리는 top-level `await import("node:fs")` / `await import("module")`
    // 를 포함한다. esbuild dep 사전 번들링이 이 Node.js builtin 을 처리하지 못해
    // mupdf 가 .vite/deps 에서 누락되는데, Vite import-analysis 는 여전히
    // `/node_modules/.vite/deps/mupdf.js` 로 rewrite 해 dev 에서 404 를 일으킨다.
    // exclude 로 사전 번들링을 끄고 node_modules 경로를 그대로 서빙한다.
    // (런타임에 `process` 가 undefined 이므로 Node 분기는 실행되지 않는다.)
    optimizeDeps: {
      exclude: ['mupdf'],
    },
    worker: {
      // mupdf.js 는 top-level await 를 사용하므로 IIFE 가 아닌 ES 모듈 워커가 필요.
      format: 'es',
      // mupdf-wasm.js 는 워커 번들 내부에서 import 되므로, asset emit 차단 플러그인을
      // 워커 빌드 파이프라인에도 적용해야 한다. Vite 5 에서는 worker.plugins 가
      // 별도 함수로 분리되어 있어 main config 의 plugins 가 자동으로 상속되지 않는다.
      //
      // NLP 모드의 NER 워커(`ner.worker.ts?worker&inline`) 는 @huggingface/transformers +
      // onnxruntime-web 을 포함한다. 메인 번들과 동일하게 jsdelivr 리터럴 / proxy worker
      // wasm dataURL 회귀를 워커 빌드 파이프라인에서도 차단해 워커 번들 내부의 onnx wasm
      // 이중 인라인을 방지한다.
      plugins: () =>
        isNlp
          ? [stripMupdfWasmAsset(), stripOnnxJsdelivrDefault(), stripOnnxProxyWasmDataUrl()]
          : [stripMupdfWasmAsset()],
      rollupOptions: {
        // mupdf 가 내부에서 dynamic import 를 사용하므로 단일 청크로 인라인한다
        // (?worker&inline 또는 viteSingleFile 과 함께 동작).
        output: { inlineDynamicImports: true },
      },
    },
    build: {
      outDir: isNlp ? 'dist-nlp' : isMulti ? 'dist-multi' : 'dist',
      target: 'es2022',
      cssCodeSplit: false,
      assetsInlineLimit: isMulti ? 4096 : 100_000_000,
      rollupOptions: {
        input: inputEntry,
        output: { inlineDynamicImports: !isMulti },
      },
    },
  };
});
