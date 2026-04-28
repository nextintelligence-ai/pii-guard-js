import { CheckCircle2, AlertTriangle } from "lucide-react";
import { useAppStore } from "@/state/store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const CAT_LABELS: Record<string, string> = {
  rrn: "주민등록번호",
  phone: "전화번호",
  email: "이메일",
  account: "계좌번호",
  businessNo: "사업자번호",
  card: "카드번호",
  address: "주소",
  manual: "수동",
};

const CAT_COLORS: Record<string, string> = {
  rrn: "bg-red-500",
  phone: "bg-orange-500",
  email: "bg-blue-500",
  account: "bg-green-500",
  businessNo: "bg-purple-500",
  card: "bg-yellow-500",
  address: "bg-pink-500",
  manual: "bg-slate-500",
};

export function ApplyResultDialog() {
  const result = useAppStore((s) => s.applyResult);

  if (!result) return null;

  const ok = result.postCheckLeaks === 0;
  const activeCats = Object.entries(result.byCategory).filter(([, n]) => n > 0);

  const close = (): void => {
    useAppStore.getState().setApplyResult(null);
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
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
          <DialogDescription>
            결과 PDF 가 자동으로 저장되었습니다.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between">
            <span className="text-muted-foreground">총 적용</span>
            <Badge variant="secondary">{result.totalBoxes}건</Badge>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-muted-foreground">영향 페이지</span>
            <Badge variant="secondary">
              {result.pagesAffected.length}페이지
            </Badge>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-muted-foreground">검증 누수</span>
            <Badge variant={ok ? "default" : "destructive"}>
              {result.postCheckLeaks}건 {ok ? "(통과)" : "(주의)"}
            </Badge>
          </li>
          <li className="flex items-start justify-between gap-3">
            <span className="shrink-0 pt-0.5 text-muted-foreground">
              카테고리별
            </span>
            {activeCats.length === 0 ? (
              <span className="text-muted-foreground">없음</span>
            ) : (
              <div className="flex flex-wrap justify-end gap-1.5">
                {activeCats.map(([k, n]) => (
                  <Badge
                    key={k}
                    variant="outline"
                    className="gap-1.5 font-normal"
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        CAT_COLORS[k] ?? "bg-slate-500",
                      )}
                    />
                    {CAT_LABELS[k] ?? k}
                    <span className="font-semibold tabular-nums">{n}</span>
                  </Badge>
                ))}
              </div>
            )}
          </li>
        </ul>
        <DialogFooter className="sm:justify-center">
          <Button onClick={close} style={{ minWidth: 100 }}>
            확인
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
