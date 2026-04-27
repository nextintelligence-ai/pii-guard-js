import { useCallback } from 'react';
import { useAppStore } from '@/state/store';
import { getPdfWorker } from '@/workers/pdfWorkerClient';
import { fileToArrayBuffer } from '@/utils/fileIO';

export function usePdfDocument() {
  const setDoc = useAppStore((s) => s.setDoc);
  const reset = useAppStore((s) => s.reset);

  const load = useCallback(
    async (f: File) => {
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
