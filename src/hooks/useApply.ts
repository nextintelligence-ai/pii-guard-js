import { useCallback } from 'react';
import { useAppStore } from '@/state/store';
import { downloadBlob } from '@/utils/fileIO';
import { getPdfWorker } from '@/workers/pdfWorkerClient';

export function useApply() {
  const apply = useCallback(async () => {
    const s = useAppStore.getState();
    const enabled = Object.values(s.boxes).filter((b) => b.enabled);
    s.setDoc({ kind: 'applying' });
    try {
      const { pdf, report } = await getPdfWorker().apply(enabled, s.maskStyle);
      // pdf 는 워커에서 transfer 된 Uint8Array<ArrayBufferLike> 라
      // Blob 의 BlobPart(ArrayBufferView<ArrayBuffer>) 와 타입이 다르다.
      // .buffer 는 ArrayBuffer 로 좁혀지므로 그대로 BlobPart 로 전달한다.
      const blob = new Blob([pdf.buffer as ArrayBuffer], { type: 'application/pdf' });
      useAppStore.getState().setDoc({ kind: 'done', outputBlob: blob, report });
    } catch (e) {
      useAppStore.getState().setDoc({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const download = useCallback(() => {
    const s = useAppStore.getState();
    if (s.doc.kind !== 'done') return;
    downloadBlob(s.doc.outputBlob, 'redacted.pdf');
  }, []);

  return { apply, download };
}
