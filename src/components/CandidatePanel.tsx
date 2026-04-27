import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ChevronRight } from 'lucide-react';
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
};

const CAT_COLORS: Record<DetectionCategory, string> = {
  rrn: 'bg-red-500',
  phone: 'bg-orange-500',
  email: 'bg-blue-500',
  account: 'bg-green-500',
  businessNo: 'bg-purple-500',
  card: 'bg-yellow-500',
};

const CATS: DetectionCategory[] = ['rrn', 'phone', 'email', 'account', 'businessNo', 'card'];

type AutoBox = RedactionBox & { category: DetectionCategory };

export function CandidatePanel() {
  const boxes = useAppStore(
    useShallow((s) =>
      Object.values(s.boxes).filter(
        (b): b is AutoBox => b.source === 'auto' && b.category !== undefined,
      ),
    ),
  );
  const cats = useAppStore((s) => s.categoryEnabled);
  const toggle = useAppStore((s) => s.toggleBox);
  const toggleCat = useAppStore((s) => s.toggleCategory);
  const goToPage = useAppStore((s) => s.goToPage);

  const totalCount = boxes.length;

  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold">자동으로 찾은 개인정보</h2>
        <p className="text-xs text-muted-foreground">
          {totalCount > 0
            ? `${totalCount}개를 찾았어요. 가릴 항목만 체크해 주세요`
            : '발견된 개인정보가 없어요. 필요하면 PDF에서 직접 박스를 그려도 돼요'}
        </p>
      </div>
      {CATS.map((cat) => {
        const items = boxes.filter((b) => b.category === cat);
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
