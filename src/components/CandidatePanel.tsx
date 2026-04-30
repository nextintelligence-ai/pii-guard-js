import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ChevronRight, Trash2, MousePointerSquareDashed, TextCursorInput } from 'lucide-react';
import { useAppStore } from '@/state/store';
import type { DetectionCategory, RedactionBox } from '@/types/domain';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
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
  source: 'auto' | 'ner' | 'ocr';
};
type ManualBox = RedactionBox & { source: 'manual-rect' | 'text-select' };

export function CandidatePanel() {
  const detectedBoxes = useAppStore(
    useShallow((s) =>
      Object.values(s.boxes).filter(
        (b): b is DetectedBox =>
          (b.source === 'auto' || b.source === 'ner' || b.source === 'ocr') &&
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
  const setNerThreshold = useAppStore((s) => s.setNerThreshold);
  const toggle = useAppStore((s) => s.toggleBox);
  const toggleCat = useAppStore((s) => s.toggleCategory);
  const goToPage = useAppStore((s) => s.goToPage);
  const focusBox = useAppStore((s) => s.focusBox);
  const deleteBox = useAppStore((s) => s.deleteBox);
  const selectedBoxId = useAppStore((s) => s.selectedBoxId);
  const showNerUi = import.meta.env.MODE === 'nlp';
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
        if (b.source !== 'ner') return false;
        const confidence = candidateById.get(b.id)?.confidence ?? 0;
        return confidence >= nerThreshold;
      }),
    [candidateById, detectedBoxes, nerThreshold],
  );
  const ocrBoxes = useMemo(
    () => detectedBoxes.filter((b) => b.source === 'ocr'),
    [detectedBoxes],
  );

  const totalAuto = regexBoxes.length + ocrBoxes.length + (showNerUi ? nerBoxes.length : 0);

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
        {REGEX_CATEGORIES.map((cat) => {
          const items = regexBoxes.filter((b) => b.category === cat);
          return (
            <CategoryGroup
              key={cat}
              cat={cat}
              source="regex"
              items={items}
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
        {REGEX_CATEGORIES.map((cat) => {
          const items = ocrBoxes.filter((b) => b.category === cat);
          return (
            <CategoryGroup
              key={`ocr-${cat}`}
              cat={cat}
              source="ocr"
              items={items}
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
        {showNerUi && (
          <div className="space-y-2 pt-1">
            <div className="rounded-md border bg-muted/30 px-3 py-2">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-medium">NER 신뢰도</span>
                <span className="text-xs text-muted-foreground">
                  신뢰도 ≥ {nerThreshold.toFixed(2)}
                </span>
              </div>
              <Slider
                min={0.5}
                max={0.95}
                step={0.05}
                value={[nerThreshold]}
                onValueChange={([v]) => {
                  if (typeof v === 'number') setNerThreshold(v);
                }}
                aria-label="NER 신뢰도 임계값"
              />
            </div>
            {nerBoxes.length === 0 && (
              <div className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                NER 모델을 로드하면 사람 이름·주소·URL·날짜·시크릿 자동 검출이 추가됩니다.
              </div>
            )}
            {NER_CATEGORIES.map((cat) => {
              const items = nerBoxes.filter((b) => b.category === cat);
              return (
                <CategoryGroup
                  key={cat}
                  cat={cat}
                  source="ner"
                  items={items}
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
          </div>
        )}
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

type GroupProps = {
  cat: DetectionCategory;
  source: 'regex' | 'ner' | 'ocr';
  items: DetectedBox[];
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
  source,
  items,
  enabled,
  selectedBoxId,
  candidateById,
  onToggleCategory,
  onToggleBox,
  onGoTo,
  onFocusBox,
}: GroupProps) {
  const [open, setOpen] = useState(items.length > 0 && items.length <= 30);

  const byPage = useMemo(() => {
    const map = new Map<number, DetectedBox[]>();
    for (const b of items) {
      const arr = map.get(b.pageIndex) ?? [];
      arr.push(b);
      map.set(b.pageIndex, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [items]);

  const id = `cat-${source}-${cat}`;

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
          <SourceBadge source={source} />
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
                    const isSelected = selectedBoxId === b.id;
                    const confidence = candidateById.get(b.id)?.confidence;
                    return (
                      <li key={b.id}>
                        <button
                          type="button"
                          className={cn(
                            'flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-accent',
                            isSelected && 'bg-accent',
                          )}
                          onClick={() => onFocusBox(b.id, b.pageIndex)}
                          aria-label={`박스 #${b.id.slice(-6)} 위치로 이동`}
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
                          <span className="text-xs font-normal text-muted-foreground">
                            박스 #{b.id.slice(-6)}
                          </span>
                          {(b.source === 'ner' || b.source === 'ocr') &&
                            typeof confidence === 'number' && (
                              <span className="ml-auto text-[11px] text-muted-foreground">
                                {confidence.toFixed(2)}
                              </span>
                            )}
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

function SourceBadge({ source }: { source: 'regex' | 'ner' | 'ocr' }) {
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
