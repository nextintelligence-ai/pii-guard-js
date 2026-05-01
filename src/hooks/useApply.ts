import { useCallback } from 'react';
import { useAppStore } from '@/state/store';
import { buildAnonymizedFileName, downloadBlob } from '@/utils/fileIO';
import { getPdfWorker } from '@/workers/pdfWorkerClient';
import { toast } from '@/components/ui/sonner';
import type { ApplyReport } from '@/types/domain';

export async function applyCurrentDocument(): Promise<{
  blob: Blob;
  report: ApplyReport;
  sourceFileName: string;
}> {
  const s = useAppStore.getState();
  if (s.nerProgress.total > 0 && s.nerProgress.done < s.nerProgress.total) {
    throw new Error('NER 분석이 아직 진행 중입니다');
  }
  const enabled = Object.values(s.boxes).filter((b) => b.enabled);
  if (enabled.length === 0) {
    throw new Error('적용할 박스가 없습니다');
  }
  const sourceFileName = s.doc.kind === 'ready' ? s.doc.fileName : '';
  s.setDoc({ kind: 'applying' });
  const api = await getPdfWorker();
  const { pdf, report } = await api.apply(enabled);
  // pdf 는 워커에서 transfer 된 Uint8Array<ArrayBufferLike> 라
  // Blob 의 BlobPart(ArrayBufferView<ArrayBuffer>) 와 타입이 다르다.
  // .buffer 는 ArrayBuffer 로 좁혀지므로 그대로 BlobPart 로 전달한다.
  const blob = new Blob([pdf.buffer as ArrayBuffer], { type: 'application/pdf' });
  return { blob, report, sourceFileName };
}

export function useApply() {
  const apply = useCallback(async () => {
    const s = useAppStore.getState();
    if (s.nerProgress.total > 0 && s.nerProgress.done < s.nerProgress.total) {
      toast.error('NER 분석이 끝난 뒤 익명화를 적용해 주세요');
      return;
    }
    const enabled = Object.values(s.boxes).filter((b) => b.enabled);
    if (enabled.length === 0) {
      toast.error('적용할 박스가 없습니다');
      return;
    }
    try {
      const { blob, report, sourceFileName } = await applyCurrentDocument();
      downloadBlob(blob, buildAnonymizedFileName(sourceFileName));
      // 결과는 즉시 다운로드되므로 문서 상태는 초기화해 드롭존 화면으로
      // 돌아가고, 별도의 applyResult 슬롯에 보관한 리포트로 결과 다이얼로그를 띄운다.
      // 순서 주의: reset() 이 applyResult 도 비우므로 setApplyResult 보다 먼저 호출한다.
      useAppStore.getState().reset();
      useAppStore.getState().setApplyResult(report);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      useAppStore.getState().setDoc({ kind: 'error', message });
      toast.error(`적용 실패: ${message}`);
    }
  }, []);

  return { apply };
}
