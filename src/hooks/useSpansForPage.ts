import { useEffect, useState } from 'react';
import { getPdfWorker } from '@/workers/pdfWorkerClient';
import type { TextSpan } from '@/types/domain';

export function useSpansForPage(pageIndex: number, ready: boolean) {
  const [spans, setSpans] = useState<TextSpan[]>([]);
  useEffect(() => {
    if (!ready) {
      setSpans([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const v = await getPdfWorker().extractSpans(pageIndex);
      if (!cancelled) setSpans(v);
    })();
    return () => {
      cancelled = true;
    };
  }, [pageIndex, ready]);
  return spans;
}
