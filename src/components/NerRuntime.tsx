import { useAppStore } from '@/state/store';
import { useNerDetect } from '@/hooks/useNerDetect';
import { NerProgress } from '@/components/NerProgress';

/**
 * NER 런타임.
 *
 * App.tsx 에서 lazy import 해 초기 화면 렌더링과 NER 워커 로딩을 분리한다.
 */
export function NerRuntime() {
  const doc = useAppStore((s) => s.doc);
  const currentPage = useAppStore((s) => s.currentPage);
  const pageCount = doc.kind === 'ready' ? doc.pages.length : 0;
  useNerDetect(pageCount, currentPage);
  return <NerProgress />;
}

export default NerRuntime;
