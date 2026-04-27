import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const isMulti = mode === 'multi';
  return {
    plugins: [react(), ...(isMulti ? [] : [viteSingleFile()])],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
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
