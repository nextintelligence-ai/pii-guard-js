import { useAppStore } from '@/state/store';
import { useBoxesForPage } from '@/state/selectors';
import { pdfRectToCanvasPx } from '@/utils/coords';

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
  const meta = docPages?.[page];
  if (!meta) return null;
  return (
    <svg
      className="absolute left-0 top-0 pointer-events-none"
      width={widthPx}
      height={heightPx}
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
    </svg>
  );
}
