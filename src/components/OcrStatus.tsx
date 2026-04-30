import { AlertTriangle, Loader2, ScanText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/state/store';

export function OcrStatus() {
  const progress = useAppStore((s) => s.ocrProgress);

  if (progress.total === 0) return null;

  const failedCount = Object.values(progress.byPage).filter(
    (page) => page.status === 'failed',
  ).length;
  const failedPages = Object.entries(progress.byPage)
    .filter(([, page]) => page.status === 'failed' && page.message)
    .map(([pageIndex, page]) => ({
      pageNumber: Number(pageIndex) + 1,
      message: page.message,
    }));

  return (
    <div className="mb-3 rounded-md border bg-muted/30 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        {progress.currentPage === null ? (
          <ScanText className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
        <span className="font-medium">
          OCR {progress.done}/{progress.total} 페이지
        </span>
        {failedCount > 0 && (
          <Badge variant="destructive" className="ml-auto gap-1">
            <AlertTriangle className="h-3 w-3" />
            실패 {failedCount}
          </Badge>
        )}
      </div>
      {progress.currentPage !== null && (
        <p className="mt-1 text-muted-foreground">p{progress.currentPage + 1} 처리 중</p>
      )}
      {failedPages.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-destructive">
          {failedPages.map((page) => (
            <li key={page.pageNumber} className="truncate">
              p{page.pageNumber}: {page.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
