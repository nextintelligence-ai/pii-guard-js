import { useAppStore } from '@/state/store';

export function MaskStylePicker() {
  const m = useAppStore((s) => s.maskStyle);
  const set = useAppStore((s) => s.setMaskStyle);
  return (
    <select
      className="px-2 py-1 border rounded text-sm"
      value={m.kind}
      onChange={(e) => {
        const k = e.target.value as 'blackout' | 'label' | 'pattern';
        if (k === 'blackout') set({ kind: 'blackout' });
        else if (k === 'label') set({ kind: 'label', label: '[익명]' });
        else set({ kind: 'pattern', pattern: 'XXX-XX-XXXX' });
      }}
      aria-label="마스킹 스타일"
    >
      <option value="blackout">검은 박스</option>
      <option value="label">[라벨]</option>
      <option value="pattern">XXX 패턴</option>
    </select>
  );
}
