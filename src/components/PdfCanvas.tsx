import { useCallback, useLayoutEffect, useState } from 'react';
import { useCanvasPainter } from '@/hooks/useCanvasPainter';
import { BoxOverlay } from './BoxOverlay';

type ElementSize = {
  widthPx: number;
  heightPx: number;
};

function useElementSize(element: HTMLElement | null): ElementSize | null {
  const [size, setSize] = useState<ElementSize | null>(null);

  useLayoutEffect(() => {
    if (!element) return undefined;

    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize((prev) => {
        const next = { widthPx: rect.width, heightPx: rect.height };
        return prev && prev.widthPx === next.widthPx && prev.heightPx === next.heightPx
          ? prev
          : next;
      });
    };

    update();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return size;
}

export function PdfCanvas() {
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const [viewportEl, setViewportEl] = useState<HTMLDivElement | null>(null);
  const setCanvasRef = useCallback((node: HTMLCanvasElement | null) => setCanvasEl(node), []);
  const setViewportRef = useCallback((node: HTMLDivElement | null) => setViewportEl(node), []);
  const viewport = useElementSize(viewportEl);
  const { meta } = useCanvasPainter(canvasEl, viewport);

  return (
    <div
      ref={setViewportRef}
      className="flex h-full w-full items-center justify-center overflow-hidden"
      data-testid="pdf-preview-fit-surface"
    >
      <div
        className="relative shrink-0"
        style={meta ? { width: meta.widthPx, height: meta.heightPx } : undefined}
      >
        <canvas
          ref={setCanvasRef}
          className="block bg-white shadow"
          style={meta ? { width: meta.widthPx, height: meta.heightPx } : undefined}
        />
        {meta && <BoxOverlay {...meta} />}
        {meta && (
          <div className="absolute bottom-1 right-2 text-xs text-slate-400">
            {meta.widthPx}×{meta.heightPx}px @ {meta.scale}x
          </div>
        )}
      </div>
    </div>
  );
}
