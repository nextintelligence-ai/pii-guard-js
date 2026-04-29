import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/state/store';

/**
 * NER 페이지별 추론 진행률 인디케이터.
 *
 * - total === 0 → 분석을 시작하지 않은 상태이므로 아무것도 그리지 않는다.
 * - done === total → 완료 메시지.
 * - 그 외 → 진행 카운트.
 */
export function NerProgress() {
  const { done, total } = useAppStore(useShallow((s) => s.nerProgress));
  if (total === 0) return null;
  if (done >= total) {
    return (
      <div className="text-xs text-muted-foreground">
        NER 분석 완료 ({total}/{total})
      </div>
    );
  }
  return (
    <div className="text-xs text-muted-foreground">
      NER 분석 중 {done} / {total}
    </div>
  );
}
