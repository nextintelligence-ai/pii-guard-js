import { useAppStore } from '@/state/store';
import { MaskStylePicker } from './MaskStylePicker';

type Props = {
  onLoad(f: File): void;
  onApply(): void;
  onDownload(): void;
};

export function Toolbar({ onLoad, onApply, onDownload }: Props) {
  const docKind = useAppStore((s) => s.doc.kind);
  return (
    <div className="flex items-center gap-2 bg-white border-b px-4 py-2">
      <label className="px-3 py-1 rounded bg-slate-900 text-white cursor-pointer">
        업로드
        <input
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onLoad(f);
            e.target.value = '';
          }}
        />
      </label>
      <button
        type="button"
        className="px-3 py-1 rounded border"
        onClick={() => useAppStore.getState().undo()}
      >
        Undo
      </button>
      <button
        type="button"
        className="px-3 py-1 rounded border"
        onClick={() => useAppStore.getState().redo()}
      >
        Redo
      </button>
      <MaskStylePicker />
      <div className="flex-1" />
      <button
        type="button"
        className="px-3 py-1 rounded bg-red-600 text-white disabled:opacity-50"
        onClick={onApply}
        disabled={docKind !== 'ready'}
      >
        익명화 적용
      </button>
      <button
        type="button"
        className="px-3 py-1 rounded bg-slate-700 text-white disabled:opacity-50"
        onClick={onDownload}
        disabled={docKind !== 'done'}
      >
        다운로드
      </button>
    </div>
  );
}
