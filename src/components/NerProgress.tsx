import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/state/store';
import { useNerModel } from '@/hooks/useNerModel';

/**
 * NER 페이지별 추론 진행률 인디케이터.
 *
 * - 모델 미로드/로드 중/오류 상태도 표시한다.
 * - ready + total === 0 → 분석 대기 상태.
 * - done === total → 완료 메시지.
 * - 그 외 → 진행 카운트.
 */
export function NerProgress() {
  const { done, total } = useAppStore(useShallow((s) => s.nerProgress));
  const ner = useNerModel();
  const label = getNerStatusLabel(ner.state, done, total);

  return (
    <div className="mb-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{label}</span>
    </div>
  );
}

function getNerStatusLabel(
  state: ReturnType<typeof useNerModel>['state'],
  done: number,
  total: number,
): string {
  if (state === 'loading') return 'NER 모델 로드 중';
  if (state === 'error') return 'NER 모델 오류';
  if (state === 'unsupported') return 'NER 모델 미지원';
  if (state !== 'ready') return 'NER 모델 미로드';
  if (total === 0) return 'NER 분석 대기';
  if (done >= total) return `NER 분석 완료 (${total}/${total})`;
  return `NER 분석 중 ${done} / ${total}`;
}
