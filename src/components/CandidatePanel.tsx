import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ChevronRight, Trash2, MousePointerSquareDashed, TextCursorInput } from 'lucide-react';
import { useAppStore } from '@/state/store';
import type { DetectionCategory, RedactionBox } from '@/types/domain';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

const LABELS: Record<DetectionCategory, string> = {
  rrn: '주민등록번호',
  phone: '전화번호',
  email: '이메일',
  account: '계좌번호',
  businessNo: '사업자번호',
  card: '카드번호',
  address: '주소',
};

const CAT_COLORS: Record<DetectionCategory, string> = {
  rrn: 'bg-red-500',
  phone: 'bg-orange-500',
  email: 'bg-blue-500',
  account: 'bg-green-500',
  businessNo: 'bg-purple-500',
  card: 'bg-yellow-500',
  address: 'bg-pink-500',
};

const CATS: DetectionCategory[] = [
  'rrn',
  'phone',
  'email',
  'account',
  'businessNo',
  'card',
  'address',
];

type AutoBox = RedactionBox & { category: DetectionCategory };
type ManualBox = RedactionBox & { source: 'manual-rect' | 'text-select' };

export function CandidatePanel() {
  const autoBoxes = useAppStore(
    useShallow((s) =>
      Object.values(s.boxes).filter(
        (b): b is AutoBox => b.source === 'auto' && b.category !== undefined,
      ),
    ),
  );
  const manualBoxes = useAppStore(
    useShallow((s) =>
      Object.values(s.boxes).filter(
        (b): b is ManualBox => b.source === 'manual-rect' || b.source === 'text-select',
      ),
    ),
  );
  const cats = useAppStore((s) => s.categoryEnabled);
  const toggle = useAppStore((s) => s.toggleBox);
  const toggleCat = useAppStore((s) => s.toggleCategory);
  const goToPage = useAppStore((s) => s.goToPage);
  const deleteBox = useAppStore((s) => s.deleteBox);

  const totalAuto = autoBoxes.length;

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold">자동으로 찾은 개인정보</h2>
          <p className="text-xs text-muted-foreground">
            {totalAuto > 0
              ? `${totalAuto}개를 찾았어요. 가릴 항목만 체크해 주세요`
              : '발견된 개인정보가 없어요. 필요하면 PDF에서 직접 박스를 그려도 돼요'}
          </p>
        </div>
        {CATS.map((cat) => {
          const items = autoBoxes.filter((b) => b.category === cat);
          return (
            <CategoryGroup
              key={cat}
              cat={cat}
              items={items}
              enabled={cats[cat]}
              onToggleCategory={() => toggleCat(cat)}
              onToggleBox={toggle}
              onGoTo={goToPage}
            />
          );
        })}
      </section>

      <section className="space-y-2">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold">직접 마스크한 영역</h2>
          <p className="text-xs text-muted-foreground">
            {manualBoxes.length > 0
              ? `${manualBoxes.length}개를 직접 만들었어요`
              : 'PDF 위에서 드래그해 직접 가릴 영역을 만들 수 있어요'}
          </p>
        </div>
        <ManualGroup
          items={manualBoxes}
          onToggleBox={toggle}
          onGoTo={goToPage}
          onDelete={deleteBox}
        />
      </section>
    </div>
  );
}

type GroupProps = {
  cat: DetectionCategory;
  items: AutoBox[];
  enabled: boolean;
  onToggleCategory(): void;
  onToggleBox(id: string): void;
  onGoTo(page: number): void;
};

function CategoryGroup({
  cat,
  items,
  enabled,
  onToggleCategory,
  onToggleBox,
  onGoTo,
}: GroupProps) {
  const [open, setOpen] = useState(items.length > 0 && items.length <= 30);

  const byPage = useMemo(() => {
    const map = new Map<number, AutoBox[]>();
    for (const b of items) {
      const arr = map.get(b.pageIndex) ?? [];
      arr.push(b);
      map.set(b.pageIndex, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [items]);

  const id = `cat-${cat}`;

  return (
    <div className="rounded-md border bg-card">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Checkbox
            id={id}
            checked={enabled}
            onCheckedChange={onToggleCategory}
            disabled={items.length === 0}
          />
          <span className={cn('h-2 w-2 rounded-full', CAT_COLORS[cat])} />
          <Label htmlFor={id} className="flex-1 cursor-pointer text-sm">
            {LABELS[cat]}
          </Label>
          <Badge variant="secondary">{items.length}</Badge>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="rounded p-1 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              disabled={items.length === 0}
              aria-label={open ? '접기' : '펼치기'}
            >
              <ChevronRight
                className={cn('h-4 w-4 transition-transform', open && 'rotate-90')}
              />
            </button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="border-t bg-muted/30 px-2 py-1.5">
            {byPage.map(([page, group]) => (
              <div key={page} className="py-1">
                <button
                  type="button"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                  onClick={() => onGoTo(page)}
                >
                  p{page + 1} ({group.length})
                </button>
                <ul className="ml-2 mt-1 space-y-1">
                  {group.map((b) => (
                    <li key={b.id} className="flex items-center gap-2">
                      <Checkbox
                        id={b.id}
                        checked={b.enabled}
                        onCheckedChange={() => onToggleBox(b.id)}
                      />
                      <Label
                        htmlFor={b.id}
                        className="cursor-pointer text-xs font-normal text-muted-foreground"
                      >
                        박스 #{b.id.slice(-6)}
                      </Label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

type ManualGroupProps = {
  items: ManualBox[];
  onToggleBox(id: string): void;
  onGoTo(page: number): void;
  onDelete(id: string): void;
};

function ManualGroup({ items, onToggleBox, onGoTo, onDelete }: ManualGroupProps) {
  const [open, setOpen] = useState(items.length > 0 && items.length <= 30);

  const byPage = useMemo(() => {
    const map = new Map<number, ManualBox[]>();
    for (const b of items) {
      const arr = map.get(b.pageIndex) ?? [];
      arr.push(b);
      map.set(b.pageIndex, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [items]);

  return (
    <div className="rounded-md border bg-card">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span className="h-2 w-2 rounded-full bg-slate-500" />
          <span className="flex-1 text-sm">사용자 마스크</span>
          <Badge variant="secondary">{items.length}</Badge>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="rounded p-1 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              disabled={items.length === 0}
              aria-label={open ? '접기' : '펼치기'}
            >
              <ChevronRight
                className={cn('h-4 w-4 transition-transform', open && 'rotate-90')}
              />
            </button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="border-t bg-muted/30 px-2 py-1.5">
            {byPage.map(([page, group]) => (
              <div key={page} className="py-1">
                <button
                  type="button"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                  onClick={() => onGoTo(page)}
                >
                  p{page + 1} ({group.length})
                </button>
                <ul className="ml-2 mt-1 space-y-1">
                  {group.map((b) => {
                    const Icon =
                      b.source === 'text-select' ? TextCursorInput : MousePointerSquareDashed;
                    const sourceLabel =
                      b.source === 'text-select' ? '텍스트 선택' : '직접 그림';
                    return (
                      <li key={b.id} className="flex items-center gap-2">
                        <Checkbox
                          id={b.id}
                          checked={b.enabled}
                          onCheckedChange={() => onToggleBox(b.id)}
                        />
                        <Icon
                          className="h-3 w-3 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <Label
                          htmlFor={b.id}
                          className="flex-1 cursor-pointer truncate text-xs font-normal text-muted-foreground"
                          title={b.label ?? sourceLabel}
                        >
                          {b.label ?? sourceLabel} #{b.id.slice(-6)}
                        </Label>
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                          onClick={() => onDelete(b.id)}
                          aria-label="삭제"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
