import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/state/store';
import {
  calculatePdfPreviewFitScale,
  DEFAULT_PDF_PREVIEW_SCALE,
} from '@/utils/pdfPreviewFit';
import { getPdfWorker } from '@/workers/pdfWorkerClient';

type PreviewViewport = {
  widthPx: number;
  heightPx: number;
} | null;

export function useCanvasPainter(canvas: HTMLCanvasElement | null, viewport: PreviewViewport) {
  const doc = useAppStore((s) => s.doc);
  const page = useAppStore((s) => s.currentPage);
  const pageMeta = doc.kind === 'ready' ? doc.pages[page] : null;
  const scale = pageMeta
    ? calculatePdfPreviewFitScale({
        pageWidthPt: pageMeta.widthPt,
        pageHeightPt: pageMeta.heightPt,
        viewportWidthPx: viewport?.widthPx ?? 0,
        viewportHeightPx: viewport?.heightPx ?? 0,
      })
    : DEFAULT_PDF_PREVIEW_SCALE;
  const [meta, setMeta] = useState<{ widthPx: number; heightPx: number; scale: number } | null>(
    null,
  );
  const lastJob = useRef(0);

  useEffect(() => {
    if (!canvas || !pageMeta) return;
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
  }, [canvas, page, pageMeta, scale]);

  return { meta };
}
