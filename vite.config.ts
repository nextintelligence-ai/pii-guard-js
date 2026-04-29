import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

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

export default defineConfig(({ mode }) => {
  const isMulti = mode === 'multi';
  return {
    plugins: [react(), stripMupdfWasmAsset(), deferredWasmModuleWorker(), ...(isMulti ? [] : [viteSingleFile()])],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    // React DOM 19 는 Navigation API 가 있으면 synthetic navigation 을 시작한다.
    // 단일 HTML 을 file:// 로 직접 열 때 Chrome 이 이 자기 자신 replace 탐색을
    // 차단하므로, 이 앱에서는 전역 navigation 참조를 번들 시점에 제거한다.
    define: {
      navigation: 'undefined',
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
      plugins: () => [stripMupdfWasmAsset()],
      rollupOptions: {
        // mupdf 가 내부에서 dynamic import 를 사용하므로 단일 청크로 인라인한다
        // (?worker&inline 또는 viteSingleFile 과 함께 동작).
        output: { inlineDynamicImports: true },
      },
    },
    build: {
      outDir: isMulti ? 'dist-multi' : 'dist',
      target: 'es2022',
      cssCodeSplit: false,
      assetsInlineLimit: isMulti ? 4096 : 100_000_000,
      rollupOptions: {
        output: { inlineDynamicImports: !isMulti },
      },
    },
  };
});
