import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { SinglePage } from '@/pages/SinglePage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { applyCurrentDocument } from '@/hooks/useApply';
import { usePdfDocument } from '@/hooks/usePdfDocument';
import { useAppStore } from '@/state/store';
import { useBatchStore } from '@/state/batchStore';
import type { BatchJobStatus } from '@/state/batchStore';

type Props = {
  jobId: string | null;
  open: boolean;
  onOpenChange(open: boolean): void;
};

const STATUS_LABELS: Record<BatchJobStatus, string> = {
  queued: '대기',
  opening: '열기',
  detecting: '탐지',
  ocr: 'OCR',
  applying: '적용',
  done: '완료',
  warning: '검증 경고',
  failed: '실패',
  cancelled: '취소',
};

export function BatchReviewDialog({ jobId, open, onOpenChange }: Props) {
  const job = useBatchStore((s) => s.jobs.find((item) => item.id === jobId));
  const updateJob = useBatchStore((s) => s.updateJob);
  const doc = useAppStore((s) => s.doc);
  const { load } = usePdfDocument();
  const loadedJobIdRef = useRef<string | null>(null);
  const loadSeqRef = useRef(0);
  const [readyJobId, setReadyJobId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      loadSeqRef.current += 1;
      loadedJobIdRef.current = null;
      setReadyJobId(null);
      return;
    }
    if (!job) {
      loadSeqRef.current += 1;
      setReadyJobId(null);
      return;
    }
    if (loadedJobIdRef.current === job.id) return;
    loadedJobIdRef.current = job.id;
    setReadyJobId(null);
    const loadSeq = (loadSeqRef.current += 1);
    void (async () => {
      await load(job.file, {
        sourceId: job.id,
        shouldCommit: () => loadSeqRef.current === loadSeq,
      });
      const currentDoc = useAppStore.getState().doc;
      if (
        loadSeqRef.current === loadSeq &&
        currentDoc.kind === 'ready' &&
        currentDoc.sourceId === job.id
      ) {
        setReadyJobId(job.id);
      }
    })();
  }, [job, load, open]);

  const canApply =
    job !== undefined &&
    readyJobId === job.id &&
    doc.kind === 'ready' &&
    doc.sourceId === job.id;

  const applyToJob = async (): Promise<void> => {
    if (!job || !canApply) return;
    const currentDoc = useAppStore.getState().doc;
    try {
      const { blob, report } = await applyCurrentDocument();
      updateJob(job.id, {
        status: report.postCheckLeaks > 0 ? 'warning' : 'done',
        candidateCount: useAppStore.getState().candidates.length,
        enabledBoxCount: Object.values(useAppStore.getState().boxes).filter(
          (box) => box.enabled,
        ).length,
        report,
        outputBlob: blob,
        errorMessage:
          report.postCheckLeaks > 0 ? `검증 누수 ${report.postCheckLeaks}건` : null,
        needsReview: report.postCheckLeaks > 0,
      });
      if (currentDoc.kind === 'ready') useAppStore.getState().setDoc(currentDoc);
    } catch (error) {
      updateJob(job.id, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
        needsReview: true,
      });
      if (currentDoc.kind === 'ready') useAppStore.getState().setDoc(currentDoc);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-32px)] max-w-[calc(100vw-32px)] flex-col gap-0 p-0">
        <DialogHeader className="border-b px-4 py-3 pr-12">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base">
                {job?.fileName ?? 'Batch 파일 검수'}
              </DialogTitle>
              <DialogDescription>일괄 처리 파일을 검수하고 다시 적용합니다.</DialogDescription>
            </div>
            {job && (
              <>
                <Badge variant={job.status === 'warning' ? 'warning' : 'outline'}>
                  {STATUS_LABELS[job.status]}
                </Badge>
                <Button size="sm" onClick={() => void applyToJob()} disabled={!canApply}>
                  <RotateCcw />
                  다시 적용
                </Button>
              </>
            )}
          </div>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {job ? (
            <SinglePage embedded />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
              해당 batch 파일을 찾을 수 없습니다.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
