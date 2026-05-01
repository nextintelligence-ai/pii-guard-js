import { Download, Loader2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buildAnonymizedFileName, downloadBlob } from '@/utils/fileIO';
import type { BatchJob, BatchJobStatus } from '@/state/batchStore';

type Props = {
  jobs: BatchJob[];
  onReview(jobId: string): void;
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

const RUNNING_STATUS_MESSAGES: Partial<Record<BatchJobStatus, string>> = {
  opening: 'PDF 여는 중...',
  detecting: '개인정보 후보 탐지 중...',
  ocr: 'OCR 처리 중...',
  applying: '비식별 적용 중...',
};

function getRunningMessage(status: BatchJobStatus): string | undefined {
  return RUNNING_STATUS_MESSAGES[status];
}

export function BatchJobTable({ jobs, onReview }: Props) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-md border bg-background p-8 text-center text-sm text-muted-foreground">
        추가된 PDF가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <div className="grid grid-cols-[minmax(180px,1fr)_110px_80px_80px_100px_160px] border-b px-3 py-2 text-xs font-medium text-muted-foreground">
        <span>파일명</span>
        <span>상태</span>
        <span>후보</span>
        <span>적용</span>
        <span>검증</span>
        <span>작업</span>
      </div>
      {jobs.map((job) => {
        const runningMessage = getRunningMessage(job.status);

        return (
          <div
            key={job.id}
            className="grid grid-cols-[minmax(180px,1fr)_110px_80px_80px_100px_160px] items-center border-b px-3 py-2 text-sm last:border-b-0"
          >
            <span className="min-w-0 pr-3">
              <span className="block truncate">{job.fileName}</span>
              {runningMessage && (
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {runningMessage}
                </span>
              )}
            </span>
            <span>
              <Badge
                variant={job.status === 'failed' ? 'destructive' : 'outline'}
                className="gap-1.5"
              >
                {runningMessage && (
                  <Loader2
                    className="h-3 w-3 animate-spin"
                    aria-label="처리 중"
                    role="img"
                  />
                )}
                {STATUS_LABELS[job.status]}
              </Badge>
            </span>
            <span>{job.candidateCount}</span>
            <span>{job.enabledBoxCount > 0 ? '완료' : '-'}</span>
            <span>{job.report ? `${job.report.postCheckLeaks}건` : '-'}</span>
            <span className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onReview(job.id)}
                disabled={job.status === 'queued' || job.status === 'opening'}
              >
                <Search />
                검수
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`${job.fileName} 저장`}
                disabled={!job.outputBlob}
                onClick={() => {
                  if (!job.outputBlob) return;
                  downloadBlob(job.outputBlob, buildAnonymizedFileName(job.fileName));
                }}
              >
                <Download />
              </Button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
