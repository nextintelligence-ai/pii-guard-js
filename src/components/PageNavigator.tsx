import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppStore } from '@/state/store';
import { Button } from '@/components/ui/button';

export function PageNavigator() {
  const doc = useAppStore((s) => s.doc);
  const cur = useAppStore((s) => s.currentPage);
  const go = useAppStore((s) => s.goToPage);
  if (doc.kind !== 'ready') return null;

  return (
    <div className="mt-2 flex items-center justify-center gap-2 text-sm">
      <Button
        size="icon"
        variant="outline"
        onClick={() => go(Math.max(0, cur - 1))}
        disabled={cur === 0}
        aria-label="이전 페이지"
      >
        <ChevronLeft />
      </Button>
      <span className="tabular-nums text-muted-foreground">
        {cur + 1} / {doc.pages.length}
      </span>
      <Button
        size="icon"
        variant="outline"
        onClick={() => go(Math.min(doc.pages.length - 1, cur + 1))}
        disabled={cur >= doc.pages.length - 1}
        aria-label="다음 페이지"
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
