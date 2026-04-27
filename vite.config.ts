import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const isMulti = mode === 'multi';
  return {
    plugins: [react(), ...(isMulti ? [] : [viteSingleFile()])],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    worker: { format: 'iife' },
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
