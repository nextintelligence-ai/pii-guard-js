import { useNerModel } from '@/hooks/useNerModel';
import { Button } from '@/components/ui/button';

/**
 * NER 모델 로드 버튼.
 *
 * NLP 모드 진입점 (`index-nlp.html`) 에서만 렌더된다 — Toolbar 가 `import.meta.env.MODE === 'nlp'`
 * 일 때만 동적 import 로 본 모듈을 로드하므로, 기본 빌드(`dist/index.html`)에는
 * 본 컴포넌트와 그에 따른 NER 워커 / @huggingface/transformers / onnxruntime-web 번들이
 * 포함되지 않는다 (사이즈 예산 18MB 보호).
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
