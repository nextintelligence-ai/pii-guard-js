import { Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

type Props = {
  open: boolean;
  doNotShowAgain: boolean;
  onDoNotShowAgainChange(checked: boolean): void;
  onClose(): void;
};

const STEPS = [
  {
    title: 'PDF 업로드',
    body: '파일을 드롭하거나 업로드 버튼으로 선택합니다. PDF는 브라우저 안에서만 처리되며 외부로 전송되지 않습니다.',
  },
  {
    title: '자동 탐지 결과 검수',
    body: '왼쪽 패널에서 주민등록번호, 전화번호, 이메일, 계좌번호, 사업자번호, 카드번호 후보를 확인하고 제외할 항목은 체크를 해제합니다.',
  },
  {
    title: '누락 영역 보강',
    body: 'PDF 위에서 드래그해 수동 박스를 만들 수 있습니다. 텍스트만 고를 때는 Shift 키를 누른 채 드래그합니다.',
  },
  {
    title: '적용 후 다운로드',
    body: '익명화 적용을 누르면 실제 PDF 콘텐츠가 제거됩니다. 완료 리포트에서 검증 누수 0건을 확인한 뒤 다운로드합니다.',
  },
] as const;

export function UsageGuideModal({
  open,
  doNotShowAgain,
  onDoNotShowAgainChange,
  onClose,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>사용 방법</DialogTitle>
          <DialogDescription>
            이 안내는 상단 사용법 버튼에서 언제든 다시 볼 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3">
          {STEPS.map((step, idx) => (
            <li key={step.title} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary text-xs font-semibold text-primary-foreground">
                {idx + 1}
              </span>
              <div>
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <Alert variant="warning">
          <Info className="h-4 w-4" />
          <AlertDescription>
            스캔본처럼 텍스트 레이어가 없는 PDF는 자동 탐지 결과가 없을 수 있습니다. 이 경우
            수동 박스로 가릴 영역을 지정하세요.
          </AlertDescription>
        </Alert>

        <DialogFooter className="sm:justify-between">
          <div className="flex items-center gap-2">
            <Checkbox
              id="dont-show-again"
              checked={doNotShowAgain}
              onCheckedChange={(c) => onDoNotShowAgainChange(c === true)}
            />
            <Label htmlFor="dont-show-again" className="text-sm">
              더 이상 표시하지 않기
            </Label>
          </div>
          <Button onClick={onClose}>시작하기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
