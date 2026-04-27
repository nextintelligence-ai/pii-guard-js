import { useAppStore } from '@/state/store';

export function PageNavigator() {
  const doc = useAppStore((s) => s.doc);
  const cur = useAppStore((s) => s.currentPage);
  const go = useAppStore((s) => s.goToPage);
  if (doc.kind !== 'ready') return null;
  return (
    <div className="flex items-center gap-2 justify-center mt-2 text-sm">
      <button
        type="button"
        className="px-2 py-1 border rounded disabled:opacity-50"
        onClick={() => go(Math.max(0, cur - 1))}
        disabled={cur === 0}
      >
        ‹
      </button>
      <span>
        {cur + 1} / {doc.pages.length}
      </span>
      <button
        type="button"
        className="px-2 py-1 border rounded disabled:opacity-50"
        onClick={() => go(Math.min(doc.pages.length - 1, cur + 1))}
        disabled={cur >= doc.pages.length - 1}
      >
        ›
      </button>
    </div>
  );
}
