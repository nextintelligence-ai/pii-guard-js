import { useEffect, useRef } from 'react';
import { useParams } from '@tanstack/react-router';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { applyCurrentDocument } from '@/hooks/useApply';
import { usePdfDocument } from '@/hooks/usePdfDocument';
import { SinglePage } from '@/pages/SinglePage';
import { useAppStore } from '@/state/store';
import { useBatchStore } from '@/state/batchStore';

type Props = {
  jobId: string;
};

function backToBatch(): void {
  void import('@/router').then(({ router }) => {
    void router.navigate({ to: '/batch' });
  });
}

export function BatchJobRoutePage() {
  const params = useParams({ from: '/batch/$jobId' });
  return <BatchJobPage jobId={params.jobId} />;
}

export function BatchJobPage({ jobId }: Props) {
  const job = useBatchStore((s) => s.jobs.find((item) => item.id === jobId));
  const updateJob = useBatchStore((s) => s.updateJob);
  const { load } = usePdfDocument();
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current || !job) return;
    loadedRef.current = true;
    void load(job.file);
  }, [job, load]);

  if (!job) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="rounded-md border bg-background p-6 text-sm text-muted-foreground">
          해당 batch 파일을 찾을 수 없습니다.
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-2">
        <Button variant="ghost" size="sm" onClick={backToBatch}>
          <ArrowLeft />
          일괄 목록
        </Button>
        <span className="text-sm font-medium">{job.fileName}</span>
        <Badge variant={job.status === 'warning' ? 'warning' : 'outline'}>
          {job.status === 'warning' ? '검증 경고' : job.status}
        </Badge>
        <div className="flex-1" />
        <Button
          size="sm"
          onClick={async () => {
            const doc = useAppStore.getState().doc;
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
              if (doc.kind === 'ready') useAppStore.getState().setDoc(doc);
            } catch (error) {
              updateJob(job.id, {
                status: 'failed',
                errorMessage: error instanceof Error ? error.message : String(error),
                needsReview: true,
              });
              if (doc.kind === 'ready') useAppStore.getState().setDoc(doc);
            }
          }}
        >
          <RotateCcw />
          다시 적용
        </Button>
      </div>
      <SinglePage />
    </main>
  );
}
