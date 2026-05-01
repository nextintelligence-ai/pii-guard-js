import { useNerModel } from '@/hooks/useNerModel';
import { Button } from '@/components/ui/button';

/**
 * NER 모델 로드 버튼.
 *
 * NER 모델 로드 버튼. 모델 파일은 자동 다운로드하지 않고 사용자가 선택한
 * 로컬 폴더를 OPFS 에 캐시한 뒤 NER 워커가 사용한다.
 */
export function NerLoadButton() {
  const ner = useNerModel();
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => void ner.loadFromUserDir()}
      disabled={ner.state === 'loading'}
    >
      {ner.state === 'ready' ? 'NER 로드됨' : 'NER 모델 로드'}
    </Button>
  );
}

export default NerLoadButton;
