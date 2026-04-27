import { CheckCircle2, AlertTriangle, Save } from 'lucide-react';
import { useAppStore } from '@/state/store';
import { useApply } from '@/hooks/useApply';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function ReportModal() {
  const doc = useAppStore((s) => s.doc);
  const dismissed = useAppStore((s) => s.reportDismissed);
  const { download } = useApply();

  if (doc.kind !== 'done') return null;

  const open = !dismissed;
  const onOpenChange = (next: boolean): void => {
    if (!next) useAppStore.getState().dismissReport();
  };

  const r = doc.report;
  const ok = r.postCheckLeaks === 0;
  const categoryLine =
    Object.entries(r.byCategory)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}=${n}`)
      .join(', ') || '없음';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {ok ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            )}
            익명화 완료
          </DialogTitle>
          <DialogDescription>적용 결과 요약입니다.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between">
            <span className="text-muted-foreground">총 적용</span>
            <Badge variant="secondary">{r.totalBoxes}건</Badge>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-muted-foreground">영향 페이지</span>
            <Badge variant="secondary">{r.pagesAffected.length}페이지</Badge>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-muted-foreground">검증 누수</span>
            <Badge variant={ok ? 'default' : 'destructive'}>
              {r.postCheckLeaks}건 {ok ? '(통과)' : '(주의)'}
            </Badge>
          </li>
          <li className="text-xs text-muted-foreground">카테고리별: {categoryLine}</li>
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => useAppStore.getState().dismissReport()}>
            닫기
          </Button>
          <Button onClick={download}>
            <Save />
            PDF 저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
