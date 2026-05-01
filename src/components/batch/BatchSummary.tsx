import { Badge } from '@/components/ui/badge';
import { useBatchStore } from '@/state/batchStore';
import type { BatchJobStatus, BatchSummary as Summary } from '@/state/batchStore';

export function BatchSummary() {
  const jobs = useBatchStore((s) => s.jobs);
  const summary = jobs.reduce<Summary>(
    (acc, job) => {
      acc.total += 1;
      if (job.status === 'queued') acc.queued += 1;
      else if (isRunning(job.status)) acc.running += 1;
      else if (job.status === 'done') acc.done += 1;
      else if (job.status === 'warning') acc.warning += 1;
      else if (job.status === 'failed') acc.failed += 1;
      else if (job.status === 'cancelled') acc.cancelled += 1;
      return acc;
    },
    {
      total: 0,
      queued: 0,
      running: 0,
      done: 0,
      warning: 0,
      failed: 0,
      cancelled: 0,
    },
  );

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">요약</span>
      <Badge variant="outline">전체 {summary.total}</Badge>
      <Badge variant="outline">대기 {summary.queued}</Badge>
      <Badge variant="outline">처리 중 {summary.running}</Badge>
      <Badge variant="outline">완료 {summary.done}</Badge>
      <Badge variant="outline">검증 경고 {summary.warning}</Badge>
      <Badge variant="outline">실패 {summary.failed}</Badge>
      <Badge variant="outline">취소 {summary.cancelled}</Badge>
    </div>
  );
}

function isRunning(status: BatchJobStatus): boolean {
  return status === 'opening' || status === 'detecting' || status === 'ocr' || status === 'applying';
}
