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
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const LABELS: Record<DetectionCategory, string> = {
  rrn: '주민등록번호',
  phone: '전화번호',
  email: '이메일',
  account: '계좌번호',
  businessNo: '사업자번호',
  card: '카드번호',
  address: '주소',
  private_person: '사람 이름',
  private_address: '주소',
  private_url: 'URL',
  private_date: '날짜',
  secret: '시크릿/키',
};

const CAT_COLORS: Record<DetectionCategory, string> = {
  rrn: 'bg-red-500',
  phone: 'bg-orange-500',
  email: 'bg-blue-500',
  account: 'bg-green-500',
  businessNo: 'bg-purple-500',
  card: 'bg-yellow-500',
  address: 'bg-pink-500',
  private_person: 'bg-rose-500',
  private_address: 'bg-fuchsia-500',
  private_url: 'bg-cyan-500',
  private_date: 'bg-amber-500',
  secret: 'bg-zinc-700',
};

const REGEX_CATEGORIES: DetectionCategory[] = [
  'rrn',
  'phone',
  'email',
  'account',
  'businessNo',
  'card',
  'address',
];

const NER_CATEGORIES: DetectionCategory[] = [
  'private_person',
  'private_address',
  'private_url',
  'private_date',
  'secret',
];

type DetectedBox = RedactionBox & {
  category: DetectionCategory;
  source: 'auto' | 'ner' | 'ocr' | 'ocr-ner';
};
type ManualBox = RedactionBox & { source: 'manual-rect' | 'text-select' };
type DetectionSource = 'regex' | 'ner' | 'ocr';
type SourceGroup = {
  source: DetectionSource;
  items: DetectedBox[];
};

const CATEGORY_ORDER: DetectionCategory[] = [...REGEX_CATEGORIES, ...NER_CATEGORIES];

export function CandidatePanel() {
  const detectedBoxes = useAppStore(
    useShallow((s) =>
      Object.values(s.boxes).filter(
        (b): b is DetectedBox =>
          (b.source === 'auto' ||
            b.source === 'ner' ||
            b.source === 'ocr' ||
            b.source === 'ocr-ner') &&
          b.category !== undefined,
      ),
    ),
  );
  const candidates = useAppStore(useShallow((s) => s.candidates));
  const manualBoxes = useAppStore(
    useShallow((s) =>
      Object.values(s.boxes).filter(
        (b): b is ManualBox => b.source === 'manual-rect' || b.source === 'text-select',
      ),
    ),
  );
  const cats = useAppStore((s) => s.categoryEnabled);
  const nerThreshold = useAppStore((s) => s.nerThreshold);
  const toggle = useAppStore((s) => s.toggleBox);
  const toggleCat = useAppStore((s) => s.toggleCategory);
  const goToPage = useAppStore((s) => s.goToPage);
  const focusBox = useAppStore((s) => s.focusBox);
  const deleteBox = useAppStore((s) => s.deleteBox);
  const selectedBoxId = useAppStore((s) => s.selectedBoxId);
  const candidateById = useMemo(
    () => new Map(candidates.map((c) => [c.id, c])),
    [candidates],
  );
  const regexBoxes = useMemo(
    () => detectedBoxes.filter((b) => b.source === 'auto'),
    [detectedBoxes],
  );
  const nerBoxes = useMemo(
    () =>
      detectedBoxes.filter((b) => {
        if (b.source !== 'ner' && b.source !== 'ocr-ner') return false;
        const confidence = candidateById.get(b.id)?.confidence ?? 0;
        return confidence >= nerThreshold;
      }),
    [candidateById, detectedBoxes, nerThreshold],
  );
  const ocrBoxes = useMemo(
    () => detectedBoxes.filter((b) => b.source === 'ocr'),
    [detectedBoxes],
  );

  const totalAuto = regexBoxes.length + ocrBoxes.length + nerBoxes.length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <section className="flex min-h-0 flex-1 flex-col space-y-2">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold">자동으로 찾은 개인정보</h2>
          <p className="text-xs text-muted-foreground">
            {totalAuto > 0
              ? `${totalAuto}개를 찾았어요. 가릴 항목만 체크해 주세요`
              : '발견된 개인정보가 없어요. 필요하면 PDF에서 직접 박스를 그려도 돼요'}
          </p>
        </div>
        <ScrollArea aria-label="자동 개인정보 목록" className="min-h-0 flex-1">
          <div className="space-y-2 pr-2">
            {CATEGORY_ORDER.map((cat) => {
              const sourceGroups = buildSourceGroups({
                cat,
                regexBoxes,
                ocrBoxes,
                nerBoxes,
              });
              return (
                <CategoryGroup
                  key={cat}
                  cat={cat}
                  sourceGroups={sourceGroups}
                  enabled={cats[cat]}
                  selectedBoxId={selectedBoxId}
                  candidateById={candidateById}
                  onToggleCategory={() => toggleCat(cat)}
                  onToggleBox={toggle}
                  onGoTo={goToPage}
                  onFocusBox={(id, page) => {
                    goToPage(page);
                    focusBox(id);
                  }}
                />
              );
            })}
            {nerBoxes.length === 0 && (
              <div className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                NER 모델을 로드하면 사람 이름·주소·URL·날짜·시크릿 자동 검출이 추가됩니다.
              </div>
            )}
          </div>
        </ScrollArea>
      </section>

      <section className="shrink-0 space-y-2">
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
          selectedBoxId={selectedBoxId}
          onToggleBox={toggle}
          onGoTo={goToPage}
          onFocusBox={(id, page) => {
            goToPage(page);
            focusBox(id);
          }}
          onDelete={deleteBox}
        />
      </section>
    </div>
  );
}

function buildSourceGroups({
  cat,
  regexBoxes,
  ocrBoxes,
  nerBoxes,
}: {
  cat: DetectionCategory;
  regexBoxes: DetectedBox[];
  ocrBoxes: DetectedBox[];
  nerBoxes: DetectedBox[];
}): SourceGroup[] {
  const groups: SourceGroup[] = [];
  if (REGEX_CATEGORIES.includes(cat)) {
    groups.push({
      source: 'regex',
      items: regexBoxes.filter((b) => b.category === cat),
    });
    groups.push({
      source: 'ocr',
      items: ocrBoxes.filter((b) => b.category === cat),
    });
  }
  if (NER_CATEGORIES.includes(cat)) {
    groups.push({
      source: 'ner',
      items: nerBoxes.filter((b) => b.category === cat),
    });
  }
  return groups.filter((group) => group.items.length > 0);
}

type GroupProps = {
  cat: DetectionCategory;
  sourceGroups: SourceGroup[];
  enabled: boolean;
  selectedBoxId: string | null;
  candidateById: Map<string, { confidence: number }>;
  onToggleCategory(): void;
  onToggleBox(id: string): void;
  onGoTo(page: number): void;
  onFocusBox(id: string, page: number): void;
};

function CategoryGroup({
  cat,
  sourceGroups,
  enabled,
  selectedBoxId,
  candidateById,
  onToggleCategory,
  onToggleBox,
  onGoTo,
  onFocusBox,
}: GroupProps) {
  const itemCount = sourceGroups.reduce((sum, group) => sum + group.items.length, 0);
  const [open, setOpen] = useState(itemCount > 0 && itemCount <= 30);

  const id = `cat-${cat}`;

  return (
    <div className="rounded-md border bg-card">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Checkbox
            id={id}
            checked={enabled}
            onCheckedChange={onToggleCategory}
            disabled={itemCount === 0}
          />
          <span className={cn('h-2 w-2 rounded-full', CAT_COLORS[cat])} />
          <Label htmlFor={id} className="flex-1 cursor-pointer text-sm">
            {LABELS[cat]}
          </Label>
          <Badge variant="secondary">{itemCount}</Badge>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="rounded p-1 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              disabled={itemCount === 0}
              aria-label={open ? '접기' : '펼치기'}
            >
              <ChevronRight
                className={cn('h-4 w-4 transition-transform', open && 'rotate-90')}
              />
            </button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="space-y-2 border-t bg-muted/30 px-2 py-1.5">
            {sourceGroups.map((sourceGroup) => (
              <SourceCandidateSection
                key={sourceGroup.source}
                sourceGroup={sourceGroup}
                selectedBoxId={selectedBoxId}
                candidateById={candidateById}
                onToggleBox={onToggleBox}
                onGoTo={onGoTo}
                onFocusBox={onFocusBox}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

type SourceCandidateSectionProps = {
  sourceGroup: SourceGroup;
  selectedBoxId: string | null;
  candidateById: Map<string, { confidence: number }>;
  onToggleBox(id: string): void;
  onGoTo(page: number): void;
  onFocusBox(id: string, page: number): void;
};

function SourceCandidateSection({
  sourceGroup,
  selectedBoxId,
  candidateById,
  onToggleBox,
  onGoTo,
  onFocusBox,
}: SourceCandidateSectionProps) {
  const byPage = useMemo(() => {
    const map = new Map<number, DetectedBox[]>();
    for (const b of sourceGroup.items) {
      const arr = map.get(b.pageIndex) ?? [];
      arr.push(b);
      map.set(b.pageIndex, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [sourceGroup.items]);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-1">
        <SourceBadge source={sourceGroup.source} />
        <Badge variant="secondary">{sourceGroup.items.length}</Badge>
      </div>
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
              const isSelected = selectedBoxId === b.id;
              const confidence = candidateById.get(b.id)?.confidence;
              const confidenceLabel =
                (b.source === 'ner' || b.source === 'ocr-ner' || b.source === 'ocr') &&
                typeof confidence === 'number'
                  ? confidence.toFixed(2)
                  : null;
              return (
                <li key={b.id}>
                  <div
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-1 py-0.5 transition-colors hover:bg-accent',
                      isSelected && 'bg-accent',
                    )}
                  >
                    <span
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        id={b.id}
                        checked={b.enabled}
                        onCheckedChange={() => onToggleBox(b.id)}
                      />
                    </span>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => onFocusBox(b.id, b.pageIndex)}
                      aria-label={`박스 #${b.id.slice(-6)} 위치로 이동`}
                    >
                      <span className="truncate text-xs font-normal text-muted-foreground">
                        박스 #{b.id.slice(-6)}
                      </span>
                      {confidenceLabel !== null && (
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {confidenceLabel}
                        </span>
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SourceBadge({ source }: { source: DetectionSource }) {
  if (source === 'regex') return <Badge variant="secondary">정규식</Badge>;
  if (source === 'ocr') return <Badge variant="outline">OCR</Badge>;
  return <Badge variant="warning">NER · 검수 필요</Badge>;
}

type ManualGroupProps = {
  items: ManualBox[];
  selectedBoxId: string | null;
  onToggleBox(id: string): void;
  onGoTo(page: number): void;
  onFocusBox(id: string, page: number): void;
  onDelete(id: string): void;
};

function ManualGroup({
  items,
  selectedBoxId,
  onToggleBox,
  onGoTo,
  onFocusBox,
  onDelete,
}: ManualGroupProps) {
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
                    const isSelected = selectedBoxId === b.id;
                    return (
                      <li key={b.id}>
                        <div
                          className={cn(
                            'flex items-center gap-2 rounded px-1 py-0.5 transition-colors hover:bg-accent',
                            isSelected && 'bg-accent',
                          )}
                        >
                          <span
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              id={b.id}
                              checked={b.enabled}
                              onCheckedChange={() => onToggleBox(b.id)}
                            />
                          </span>
                          <Icon
                            className="h-3 w-3 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                          <button
                            type="button"
                            className="flex-1 cursor-pointer truncate text-left text-xs font-normal text-muted-foreground"
                            title={b.label ?? sourceLabel}
                            onClick={() => onFocusBox(b.id, b.pageIndex)}
                            aria-label={`${b.label ?? sourceLabel} #${b.id.slice(-6)} 위치로 이동`}
                          >
                            {b.label ?? sourceLabel} #{b.id.slice(-6)}
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                            onClick={() => onDelete(b.id)}
                            aria-label="삭제"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
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
