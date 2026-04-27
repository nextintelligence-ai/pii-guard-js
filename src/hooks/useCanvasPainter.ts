import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/state/store';
import { getPdfWorker } from '@/workers/pdfWorkerClient';

export function useCanvasPainter(canvas: HTMLCanvasElement | null) {
  const doc = useAppStore((s) => s.doc);
  const page = useAppStore((s) => s.currentPage);
  const [scale, setScale] = useState(1.5);
  const [meta, setMeta] = useState<{ widthPx: number; heightPx: number; scale: number } | null>(
    null,
  );
  const lastJob = useRef(0);

  useEffect(() => {
    if (!canvas || doc.kind !== 'ready') return;
    const job = ++lastJob.current;
    void (async () => {
      const api = await getPdfWorker();
      const r = await api.renderPage(page, scale);
      if (job !== lastJob.current) {
        r.bitmap.close();
        return;
      }
      canvas.width = r.widthPx;
      canvas.height = r.heightPx;
      canvas.getContext('2d')!.drawImage(r.bitmap, 0, 0);
      r.bitmap.close();
      setMeta({ widthPx: r.widthPx, heightPx: r.heightPx, scale: r.scale });
    })();
  }, [canvas, doc, page, scale]);

  return { scale, setScale, meta };
}
