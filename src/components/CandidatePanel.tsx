import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/state/store';
import type { DetectionCategory, RedactionBox } from '@/types/domain';

const LABELS: Record<DetectionCategory, string> = {
  rrn: '주민등록번호',
  phone: '전화번호',
  email: '이메일',
  account: '계좌번호',
  businessNo: '사업자번호',
  card: '카드번호',
};

const CATS: DetectionCategory[] = ['rrn', 'phone', 'email', 'account', 'businessNo', 'card'];

export function CandidatePanel() {
  const boxes = useAppStore(
    useShallow((s) =>
      Object.values(s.boxes).filter(
        (b): b is RedactionBox & { category: DetectionCategory } =>
          b.source === 'auto' && b.category !== undefined,
      ),
    ),
  );
  const cats = useAppStore((s) => s.categoryEnabled);
  const toggle = useAppStore((s) => s.toggleBox);
  const toggleCat = useAppStore((s) => s.toggleCategory);
  const goToPage = useAppStore((s) => s.goToPage);

  return (
    <div className="text-sm">
      <h2 className="font-semibold mb-2">자동 탐지 결과</h2>
      {CATS.map((cat) => {
        const items = boxes.filter((b) => b.category === cat);
        return (
          <div key={cat} className="mb-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={cats[cat]} onChange={() => toggleCat(cat)} />
              <span className="font-medium">{LABELS[cat]}</span>
              <span className="text-slate-500">({items.length})</span>
            </label>
            <ul className="ml-6 mt-1 space-y-1">
              {items.map((b) => (
                <li key={b.id} className="flex items-center gap-2">
                  <input type="checkbox" checked={b.enabled} onChange={() => toggle(b.id)} />
                  <button
                    type="button"
                    className="text-slate-700 hover:text-slate-900 hover:underline"
                    onClick={() => goToPage(b.pageIndex)}
                  >
                    p{b.pageIndex + 1}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
