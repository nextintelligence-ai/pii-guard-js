import { useEffect, useRef, useState, type PointerEvent as RPE } from 'react';
import { useAppStore } from '@/state/store';
import { useBoxesForPage } from '@/state/selectors';
import { useSpansForPage } from '@/hooks/useSpansForPage';
import { pdfRectToCanvasPx, canvasPxToPdfRect, bboxesIntersect } from '@/utils/coords';
import type { Bbox, DetectionCategory, RedactionBox } from '@/types/domain';

type Props = { widthPx: number; heightPx: number; scale: number };
type OverlayCategory = DetectionCategory | 'manual';

const COLORS: Record<OverlayCategory, string> = {
  rrn: 'rgba(220,38,38,0.35)',
  phone: 'rgba(234,88,12,0.35)',
  email: 'rgba(37,99,235,0.35)',
  account: 'rgba(22,163,74,0.35)',
  businessNo: 'rgba(168,85,247,0.35)',
  card: 'rgba(202,138,4,0.35)',
  address: 'rgba(236,72,153,0.35)',
  private_person: 'transparent',
  private_address: 'transparent',
  private_url: 'transparent',
  private_date: 'transparent',
  secret: 'transparent',
  manual: 'rgba(15,23,42,0.45)',
};
const STROKE: Record<OverlayCategory, string> = {
  rrn: '#dc2626',
  phone: '#ea580c',
  email: '#2563eb',
  account: '#16a34a',
  businessNo: '#a855f7',
  card: '#ca8a04',
  address: '#ec4899',
  private_person: '#f43f5e',
  private_address: '#d946ef',
  private_url: '#06b6d4',
  private_date: '#f59e0b',
  secret: '#3f3f46',
  manual: '#0f172a',
};

const HANDLE_SIZE = 8;
// 핸들 인덱스: 0=NW, 1=N, 2=NE, 3=E, 4=SE, 5=S, 6=SW, 7=W
const HANDLE_CURSORS = [
  'nwse-resize',
  'ns-resize',
  'nesw-resize',
  'ew-resize',
  'nwse-resize',
  'ns-resize',
  'nesw-resize',
  'ew-resize',
];

type Interaction =
  | { mode: 'idle' }
  | { mode: 'drag-create'; start: [number, number]; current: Bbox; shift: boolean }
  | {
      mode: 'move';
      id: string;
      start: [number, number];
      startBbox: Bbox; // canvas px
      pending: Bbox; // canvas px
    }
  | {
      mode: 'resize';
      id: string;
      handle: number;
      start: [number, number];
      startBbox: Bbox; // canvas px
      pending: Bbox; // canvas px
    };

function handleAnchors(rect: Bbox): Array<[number, number]> {
  const [x0, y0, x1, y1] = rect;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  return [
    [x0, y0],
    [mx, y0],
    [x1, y0],
    [x1, my],
    [x1, y1],
    [mx, y1],
    [x0, y1],
    [x0, my],
  ];
}

function applyResize(start: Bbox, handle: number, dx: number, dy: number): Bbox {
  let [x0, y0, x1, y1] = start;
  switch (handle) {
    case 0: // NW
      x0 += dx;
      y0 += dy;
      break;
    case 1: // N
      y0 += dy;
      break;
    case 2: // NE
      x1 += dx;
      y0 += dy;
      break;
    case 3: // E
      x1 += dx;
      break;
    case 4: // SE
      x1 += dx;
      y1 += dy;
      break;
    case 5: // S
      y1 += dy;
      break;
    case 6: // SW
      x0 += dx;
      y1 += dy;
      break;
    case 7: // W
      x0 += dx;
      break;
  }
  // 음수 크기가 되면 좌표를 정규화한다 (반대편으로 뒤집힌 경우 처리).
  return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
}

export function BoxOverlay({ widthPx, heightPx, scale }: Props) {
  const page = useAppStore((s) => s.currentPage);
  const docPages = useAppStore((s) => (s.doc.kind === 'ready' ? s.doc.pages : null));
  const boxes = useBoxesForPage(page);
  const selectedBoxId = useAppStore((s) => s.selectedBoxId);
  const focusNonce = useAppStore((s) => s.focusNonce);
  const meta = docPages?.[page];
  const spans = useSpansForPage(page, !!meta);

  const [interaction, setInteraction] = useState<Interaction>({ mode: 'idle' });
  const ref = useRef<SVGSVGElement | null>(null);
  const selectedRectRef = useRef<SVGRectElement | null>(null);

  // 사이드바 행 클릭 등으로 focusNonce 가 증가하면 선택된 박스로 스크롤.
  useEffect(() => {
    if (!selectedBoxId || !meta) return;
    const onPage = boxes.some((b) => b.id === selectedBoxId);
    if (!onPage) return;
    selectedRectRef.current?.scrollIntoView({
      block: 'center',
      inline: 'center',
      behavior: 'smooth',
    });
  }, [focusNonce, selectedBoxId, page, meta, scale, boxes]);

  if (!meta) return null;

  const pointerPos = (e: RPE<SVGElement>): [number, number] => {
    // SVG 가 CSS 로 리스케일될 수 있으므로 viewBox user-units 로 환산한다.
    const rect = ref.current!.getBoundingClientRect();
    const sx = rect.width > 0 ? widthPx / rect.width : 1;
    const sy = rect.height > 0 ? heightPx / rect.height : 1;
    return [(e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy];
  };

  const commitBboxToPdf = (id: string, canvasBbox: Bbox) => {
    const pdfRect = canvasPxToPdfRect(canvasBbox, scale, meta.widthPt, meta.heightPt, meta.rotation);
    useAppStore.getState().updateBox(id, { bbox: pdfRect });
  };

  const onSvgDown = (e: RPE<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const target = e.target as SVGElement;
    // rect/핸들에 대한 다운 이벤트는 각자의 핸들러가 처리한다.
    if (target !== ref.current) return;
    // 빈 영역 클릭: 선택 해제 + 드래그-생성 시작.
    if (selectedBoxId) useAppStore.getState().selectBox(null);
    const p = pointerPos(e);
    setInteraction({
      mode: 'drag-create',
      start: p,
      current: [p[0], p[1], p[0], p[1]],
      shift: e.shiftKey,
    });
    ref.current?.setPointerCapture(e.pointerId);
  };

  const onSvgMove = (e: RPE<SVGSVGElement>) => {
    if (interaction.mode === 'idle') return;
    const p = pointerPos(e);
    if (interaction.mode === 'drag-create') {
      const s = interaction.start;
      setInteraction({
        ...interaction,
        current: [
          Math.min(s[0], p[0]),
          Math.min(s[1], p[1]),
          Math.max(s[0], p[0]),
          Math.max(s[1], p[1]),
        ],
      });
    } else if (interaction.mode === 'move') {
      const dx = p[0] - interaction.start[0];
      const dy = p[1] - interaction.start[1];
      const s = interaction.startBbox;
      setInteraction({
        ...interaction,
        pending: [s[0] + dx, s[1] + dy, s[2] + dx, s[3] + dy],
      });
    } else if (interaction.mode === 'resize') {
      const dx = p[0] - interaction.start[0];
      const dy = p[1] - interaction.start[1];
      setInteraction({
        ...interaction,
        pending: applyResize(interaction.startBbox, interaction.handle, dx, dy),
      });
    }
  };

  const onSvgUp = (e: RPE<SVGSVGElement>) => {
    if (interaction.mode === 'idle') return;
    if (interaction.mode === 'drag-create') {
      const r = interaction.current;
      if (r[2] - r[0] > 3 && r[3] - r[1] > 3) {
        const pdfRect = canvasPxToPdfRect(r, scale, meta.widthPt, meta.heightPt, meta.rotation);
        if (interaction.shift) {
          // 텍스트 드래그 선택: 드래그 영역과 교차하는 스팬들의 합집합 bbox 를 박스로 추가.
          const hits = spans.filter((sp) => bboxesIntersect(sp.bbox, pdfRect));
          if (hits.length > 0) {
            let x0 = Infinity;
            let y0 = Infinity;
            let x1 = -Infinity;
            let y1 = -Infinity;
            for (const h of hits) {
              if (h.bbox[0] < x0) x0 = h.bbox[0];
              if (h.bbox[1] < y0) y0 = h.bbox[1];
              if (h.bbox[2] > x1) x1 = h.bbox[2];
              if (h.bbox[3] > y1) y1 = h.bbox[3];
            }
            useAppStore.getState().addTextSelectBox({
              pageIndex: page,
              bbox: [x0, y0, x1, y1],
            });
          }
        } else {
          useAppStore.getState().addManualBox({ pageIndex: page, bbox: pdfRect });
        }
      }
    } else if (interaction.mode === 'move' || interaction.mode === 'resize') {
      const r = interaction.pending;
      // 너무 작은 박스는 커밋하지 않고 원래 상태 유지.
      if (r[2] - r[0] > 1 && r[3] - r[1] > 1) {
        commitBboxToPdf(interaction.id, r);
      }
    }
    if (ref.current?.hasPointerCapture(e.pointerId)) {
      ref.current.releasePointerCapture(e.pointerId);
    }
    setInteraction({ mode: 'idle' });
  };

  const onBoxDown = (e: RPE<SVGRectElement>, b: RedactionBox, canvasRect: Bbox) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p = pointerPos(e);
    if (selectedBoxId !== b.id) {
      useAppStore.getState().selectBox(b.id);
      // 선택만 하고 드래그는 시작하지 않는다 (의도치 않은 미세 이동을 막기 위해).
      return;
    }
    setInteraction({
      mode: 'move',
      id: b.id,
      start: p,
      startBbox: canvasRect,
      pending: canvasRect,
    });
    ref.current?.setPointerCapture(e.pointerId);
  };

  const onHandleDown = (e: RPE<SVGRectElement>, idx: number, canvasRect: Bbox) => {
    if (e.button !== 0 || !selectedBoxId) return;
    e.stopPropagation();
    const p = pointerPos(e);
    setInteraction({
      mode: 'resize',
      id: selectedBoxId,
      handle: idx,
      start: p,
      startBbox: canvasRect,
      pending: canvasRect,
    });
    ref.current?.setPointerCapture(e.pointerId);
  };

  // 현재 상호작용 중인 박스의 캔버스 px bbox 를 반환 (없으면 null)
  const pendingFor = (id: string): Bbox | null => {
    if ((interaction.mode === 'move' || interaction.mode === 'resize') && interaction.id === id) {
      return interaction.pending;
    }
    return null;
  };

  return (
    <svg
      ref={ref}
      className="absolute left-0 top-0 h-full w-full"
      viewBox={`0 0 ${widthPx} ${heightPx}`}
      preserveAspectRatio="xMinYMin meet"
      style={{ cursor: interaction.mode === 'idle' ? 'crosshair' : 'default' }}
      onPointerDown={onSvgDown}
      onPointerMove={onSvgMove}
      onPointerUp={onSvgUp}
      onPointerCancel={onSvgUp}
    >
      {boxes.map((b) => {
        const baseRect = pdfRectToCanvasPx(
          b.bbox,
          scale,
          meta.widthPt,
          meta.heightPt,
          meta.rotation,
        );
        const r = pendingFor(b.id) ?? baseRect;
        const key: OverlayCategory =
          (b.source === 'auto' || b.source === 'ner' || b.source === 'ocr') && b.category
            ? b.category
            : 'manual';
        const fill = b.enabled ? COLORS[key] : 'transparent';
        const stroke = STROKE[key];
        const isSelected = selectedBoxId === b.id;
        return (
          <rect
            key={b.id}
            ref={isSelected ? selectedRectRef : null}
            x={r[0]}
            y={r[1]}
            width={r[2] - r[0]}
            height={r[3] - r[1]}
            fill={fill}
            stroke={isSelected ? '#0ea5e9' : stroke}
            strokeWidth={isSelected ? 2 : 1}
            strokeDasharray={b.enabled ? '' : '4 3'}
            strokeOpacity={b.enabled ? 0.9 : 0.5}
            style={{ cursor: isSelected ? 'move' : 'pointer' }}
            onPointerDown={(e) => onBoxDown(e, b, r)}
          />
        );
      })}

      {/* 선택된 박스의 핸들 */}
      {(() => {
        if (!selectedBoxId) return null;
        const sel = boxes.find((b) => b.id === selectedBoxId);
        if (!sel) return null;
        const baseRect = pdfRectToCanvasPx(
          sel.bbox,
          scale,
          meta.widthPt,
          meta.heightPt,
          meta.rotation,
        );
        const r = pendingFor(sel.id) ?? baseRect;
        const anchors = handleAnchors(r);
        return anchors.map(([ax, ay], idx) => (
          <rect
            key={`h${idx}`}
            x={ax - HANDLE_SIZE / 2}
            y={ay - HANDLE_SIZE / 2}
            width={HANDLE_SIZE}
            height={HANDLE_SIZE}
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth={1}
            style={{ cursor: HANDLE_CURSORS[idx] }}
            onPointerDown={(e) => onHandleDown(e, idx, r)}
          />
        ));
      })()}

      {/* 드래그-생성 중 미리보기. shift+드래그 시에는 텍스트 선택 모드를 시각적으로 구분. */}
      {interaction.mode === 'drag-create' && (
        <rect
          x={interaction.current[0]}
          y={interaction.current[1]}
          width={interaction.current[2] - interaction.current[0]}
          height={interaction.current[3] - interaction.current[1]}
          fill={interaction.shift ? 'rgba(37,99,235,0.18)' : 'rgba(15,23,42,0.25)'}
          stroke={interaction.shift ? '#2563eb' : '#0f172a'}
          strokeDasharray="4 3"
          pointerEvents="none"
        />
      )}
    </svg>
  );
}
