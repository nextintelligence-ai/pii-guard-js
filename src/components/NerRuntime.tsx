import { useAppStore } from '@/state/store';
import { useNerDetect } from '@/hooks/useNerDetect';
import { NerProgress } from '@/components/NerProgress';

/**
 * NLP 모드 전용 런타임.
 *
 * App.tsx 에서 lazy import 해 기본 빌드가 NER 워커 / transformers.js /
 * onnxruntime-web 번들을 정적으로 끌어오지 않게 유지한다.
 */
export function NerRuntime() {
  const doc = useAppStore((s) => s.doc);
  const currentPage = useAppStore((s) => s.currentPage);
  const pageCount = doc.kind === 'ready' ? doc.pages.length : 0;
  useNerDetect(pageCount, currentPage);
  return <NerProgress />;
}

export default NerRuntime;
