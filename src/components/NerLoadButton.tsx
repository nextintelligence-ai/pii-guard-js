import { useNerModel } from '@/hooks/useNerModel';
import { useAppStore } from '@/state/store';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

/**
 * NER 모델 로드 버튼.
 *
 * NER 모델 로드 버튼. 모델 파일은 자동 다운로드하지 않고 사용자가 선택한
 * 로컬 폴더를 OPFS 에 캐시한 뒤 NER 워커가 사용한다.
 */
export function NerLoadButton() {
  const ner = useNerModel();
  const nerThreshold = useAppStore((s) => s.nerThreshold);
  const setNerThreshold = useAppStore((s) => s.setNerThreshold);
  const label =
    ner.state === 'ready'
      ? 'NER 로드됨'
      : ner.state === 'loading'
        ? 'NER 로드 중...'
        : ner.state === 'error'
          ? 'NER 다시 로드'
          : 'NER 모델 로드';

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => void ner.loadFromUserDir()}
        disabled={ner.state === 'loading'}
      >
        {label}
      </Button>
      {ner.state === 'ready' && (
        <div className="flex min-w-[190px] items-center gap-2">
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            NER 신뢰도 {nerThreshold.toFixed(2)}
          </span>
          <Slider
            className="w-24"
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
      )}
    </div>
  );
}

export default NerLoadButton;
