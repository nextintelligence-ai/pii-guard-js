import { useRef, useState, type PointerEvent as RPE } from 'react';
import { useAppStore } from '@/state/store';
import { useBoxesForPage } from '@/state/selectors';
import { pdfRectToCanvasPx, canvasPxToPdfRect } from '@/utils/coords';
import type { Bbox } from '@/types/domain';

type Props = { widthPx: number; heightPx: number; scale: number };

const COLORS: Record<string, string> = {
  rrn: 'rgba(220,38,38,0.35)',
  phone: 'rgba(234,88,12,0.35)',
  email: 'rgba(37,99,235,0.35)',
  account: 'rgba(22,163,74,0.35)',
  businessNo: 'rgba(168,85,247,0.35)',
  card: 'rgba(202,138,4,0.35)',
  manual: 'rgba(15,23,42,0.45)',
};
const STROKE: Record<string, string> = {
  rrn: '#dc2626',
  phone: '#ea580c',
  email: '#2563eb',
  account: '#16a34a',
  businessNo: '#a855f7',
  card: '#ca8a04',
  manual: '#0f172a',
};

export function BoxOverlay({ widthPx, heightPx, scale }: Props) {
  const page = useAppStore((s) => s.currentPage);
  const docPages = useAppStore((s) => (s.doc.kind === 'ready' ? s.doc.pages : null));
  const boxes = useBoxesForPage(page);
  const addManual = useAppStore((s) => s.addManualBox);
  const meta = docPages?.[page];

  const [dragStart, setDragStart] = useState<[number, number] | null>(null);
  const [dragRect, setDragRect] = useState<Bbox | null>(null);
  const ref = useRef<SVGSVGElement | null>(null);

  if (!meta) return null;

  const onDown = (e: RPE<SVGSVGElement>) => {
    if (e.button !== 0) return;
    if ((e.target as SVGElement).tagName === 'rect') return; // 박스 위 클릭은 박스 핸들러가 처리
    const rect = ref.current!.getBoundingClientRect();
    setDragStart([e.clientX - rect.left, e.clientY - rect.top]);
    setDragRect(null);
  };
  const onMove = (e: RPE<SVGSVGElement>) => {
    if (!dragStart) return;
    const rect = ref.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDragRect([
      Math.min(dragStart[0], x),
      Math.min(dragStart[1], y),
      Math.max(dragStart[0], x),
      Math.max(dragStart[1], y),
    ]);
  };
  const onUp = () => {
    if (dragRect && dragRect[2] - dragRect[0] > 3 && dragRect[3] - dragRect[1] > 3) {
      const pdfRect = canvasPxToPdfRect(dragRect, scale, meta.widthPt, meta.heightPt, meta.rotation);
      addManual({ pageIndex: page, bbox: pdfRect });
    }
    setDragStart(null);
    setDragRect(null);
  };

  return (
    <svg
      ref={ref}
      className="absolute left-0 top-0"
      width={widthPx}
      height={heightPx}
      style={{ cursor: 'crosshair' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
    >
      {boxes.map((b) => {
        const r = pdfRectToCanvasPx(b.bbox, scale, meta.widthPt, meta.heightPt, meta.rotation);
        const key = b.source === 'auto' && b.category ? b.category : 'manual';
        const fill = b.enabled ? COLORS[key] : 'transparent';
        const stroke = STROKE[key];
        return (
          <rect
            key={b.id}
            x={r[0]}
            y={r[1]}
            width={r[2] - r[0]}
            height={r[3] - r[1]}
            fill={fill}
            stroke={stroke}
            strokeWidth={1}
            strokeDasharray={b.enabled ? '' : '4 3'}
            strokeOpacity={b.enabled ? 0.9 : 0.5}
          />
        );
      })}
      {dragRect && (
        <rect
          x={dragRect[0]}
          y={dragRect[1]}
          width={dragRect[2] - dragRect[0]}
          height={dragRect[3] - dragRect[1]}
          fill="rgba(15,23,42,0.25)"
          stroke="#0f172a"
          strokeDasharray="4 3"
        />
      )}
    </svg>
  );
}
