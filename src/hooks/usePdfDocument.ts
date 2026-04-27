import { useCallback } from 'react';
import { useAppStore } from '@/state/store';
import { getPdfWorker } from '@/workers/pdfWorkerClient';
import { fileToArrayBuffer } from '@/utils/fileIO';

const LARGE_FILE_THRESHOLD = 200 * 1024 * 1024;
const sizeMb = (n: number) => Math.round(n / (1024 * 1024));

export function usePdfDocument() {
  const setDoc = useAppStore((s) => s.setDoc);
  const reset = useAppStore((s) => s.reset);

  const load = useCallback(
    async (f: File) => {
      if (f.size > LARGE_FILE_THRESHOLD) {
        const ok = window.confirm(
          `이 파일은 ${sizeMb(f.size)}MB로 매우 큽니다. 처리 시 메모리 부담이 클 수 있는데 계속하시겠습니까?`,
        );
        if (!ok) return;
      }
      reset();
      setDoc({ kind: 'loading' });
      try {
        const buf = await fileToArrayBuffer(f);
        const { pages } = await getPdfWorker().open(buf);
        setDoc({ kind: 'ready', pages, fileName: f.name });
      } catch (e) {
        setDoc({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    },
    [setDoc, reset],
  );

  return { load };
}
