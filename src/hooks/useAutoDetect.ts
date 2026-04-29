import { useEffect } from 'react';
import { useAppStore } from '@/state/store';
import { getPdfWorker } from '@/workers/pdfWorkerClient';
import type { RedactionBox } from '@/types/domain';

export function useAutoDetect() {
  const doc = useAppStore((s) => s.doc);
  const page = useAppStore((s) => s.currentPage);

  useEffect(() => {
    if (doc.kind !== 'ready') return;
    let cancelled = false;
    void (async () => {
      const api = await getPdfWorker();
      const candidates = await api.detectAll(page);
      if (cancelled) return;
      const s = useAppStore.getState();
      const remaining: Record<string, RedactionBox> = {};
      for (const id in s.boxes) {
        const b = s.boxes[id]!;
        if (!(b.source === 'auto' && b.pageIndex === page)) remaining[id] = b;
      }
      for (const c of candidates) {
        const enabled = s.categoryEnabled[c.category];
        const box: RedactionBox = {
          id: c.id,
          pageIndex: c.pageIndex,
          bbox: c.bbox,
          source: 'auto',
          category: c.category,
          enabled,
        };
        remaining[c.id] = box;
      }
      useAppStore.setState({
        candidates: [...s.candidates.filter((c) => c.source === 'ner'), ...candidates],
        boxes: remaining,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, page]);
}
