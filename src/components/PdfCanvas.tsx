import { useCallback, useState } from 'react';
import { useCanvasPainter } from '@/hooks/useCanvasPainter';
import { BoxOverlay } from './BoxOverlay';

export function PdfCanvas() {
  const [el, setEl] = useState<HTMLCanvasElement | null>(null);
  const setRef = useCallback((node: HTMLCanvasElement | null) => setEl(node), []);
  const { meta } = useCanvasPainter(el);

  return (
    <div className="relative inline-block">
      <canvas ref={setRef} className="block bg-white shadow" />
      {meta && <BoxOverlay {...meta} />}
      {meta && (
        <div className="absolute bottom-1 right-2 text-xs text-slate-400">
          {meta.widthPx}×{meta.heightPx}px @ {meta.scale}x
        </div>
      )}
    </div>
  );
}
