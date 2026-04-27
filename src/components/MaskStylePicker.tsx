import { useAppStore } from '@/state/store';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type MaskKind = 'blackout' | 'label' | 'pattern';

const LABELS: Record<MaskKind, string> = {
  blackout: '검은 박스',
  label: '[라벨]',
  pattern: 'XXX 패턴',
};

export function MaskStylePicker() {
  const m = useAppStore((s) => s.maskStyle);
  const set = useAppStore((s) => s.setMaskStyle);

  const onChange = (k: MaskKind): void => {
    if (k === 'blackout') set({ kind: 'blackout' });
    else if (k === 'label') set({ kind: 'label', label: '[익명]' });
    else set({ kind: 'pattern', pattern: 'XXX-XX-XXXX' });
  };

  return (
    <Select value={m.kind} onValueChange={(v) => onChange(v as MaskKind)}>
      <SelectTrigger className="h-8 w-[140px] text-xs" aria-label="마스킹 스타일">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="blackout">{LABELS.blackout}</SelectItem>
        <SelectItem value="label">{LABELS.label}</SelectItem>
        <SelectItem value="pattern">{LABELS.pattern}</SelectItem>
      </SelectContent>
    </Select>
  );
}
