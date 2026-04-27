import { useCallback } from 'react';
import { useAppStore } from '@/state/store';
import { downloadBlob } from '@/utils/fileIO';
import { getPdfWorker } from '@/workers/pdfWorkerClient';
import { toast } from '@/components/ui/sonner';

export function useApply() {
  const apply = useCallback(async () => {
    const s = useAppStore.getState();
    const enabled = Object.values(s.boxes).filter((b) => b.enabled);
    if (enabled.length === 0) {
      toast.warning('적용할 박스가 없습니다');
      return;
    }
    s.setDoc({ kind: 'applying' });
    toast.loading('익명화 적용 중…', { id: 'apply' });
    try {
      const api = await getPdfWorker();
      const { pdf, report } = await api.apply(enabled, s.maskStyle);
      // pdf 는 워커에서 transfer 된 Uint8Array<ArrayBufferLike> 라
      // Blob 의 BlobPart(ArrayBufferView<ArrayBuffer>) 와 타입이 다르다.
      // .buffer 는 ArrayBuffer 로 좁혀지므로 그대로 BlobPart 로 전달한다.
      const blob = new Blob([pdf.buffer as ArrayBuffer], { type: 'application/pdf' });
      useAppStore.getState().setDoc({ kind: 'done', outputBlob: blob, report });
      if (report.postCheckLeaks > 0) {
        toast.warning(`익명화 완료 — 검증 누수 ${report.postCheckLeaks}건`, { id: 'apply' });
      } else {
        toast.success('익명화 완료', { id: 'apply' });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      useAppStore.getState().setDoc({ kind: 'error', message });
      toast.error(`적용 실패: ${message}`, { id: 'apply' });
    }
  }, []);

  const download = useCallback(() => {
    const s = useAppStore.getState();
    if (s.doc.kind !== 'done') {
      toast.error('저장할 결과가 없습니다');
      return;
    }
    downloadBlob(s.doc.outputBlob, 'redacted.pdf');
    toast.success('PDF 저장 시작');
  }, []);

  return { apply, download };
}
