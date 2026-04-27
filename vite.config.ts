import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

function fileProtocolInlineModuleWorker(): Plugin {
  const needle = 'export default function WorkerWrapper(options) {\n            let objURL;';
  const replacement = `function createFileProtocolModuleWorker(encodedJs, options) {
            const workerSource = [
              'URL.revokeObjectURL(self.location.href);',
              'const encodedJs = ' + JSON.stringify(encodedJs) + ';',
              'const decodeBase64 = (base64) => Uint8Array.from(atob(base64), c => c.charCodeAt(0));',
              'const queuedMessages = [];',
              'const queueMessage = (event) => { queuedMessages.push(event); event.stopImmediatePropagation(); };',
              'self.addEventListener("message", queueMessage);',
              'const moduleBlob = new Blob(["URL.revokeObjectURL(import.meta.url);", decodeBase64(encodedJs)], { type: "text/javascript;charset=utf-8" });',
              'const moduleURL = URL.createObjectURL(moduleBlob);',
              'import(moduleURL).then(() => {',
              '  self.removeEventListener("message", queueMessage);',
              '  for (const event of queuedMessages) {',
              '    self.dispatchEvent(new MessageEvent("message", { data: event.data, ports: event.ports }));',
              '  }',
              '}).catch(error => setTimeout(() => { throw error; }));',
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
            if (globalThis.location?.protocol === "file:") {
              return createFileProtocolModuleWorker(encodedJs, options);
            }
            let objURL;`;

  return {
    name: 'file-protocol-inline-module-worker',
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
    plugins: [react(), fileProtocolInlineModuleWorker(), ...(isMulti ? [] : [viteSingleFile()])],
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
