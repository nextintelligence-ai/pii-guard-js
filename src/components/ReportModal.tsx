import { useAppStore } from '@/state/store';

export function ReportModal() {
  const doc = useAppStore((s) => s.doc);
  if (doc.kind !== 'done') return null;
  const r = doc.report;
  const close = (): void => {
    useAppStore.getState().setDoc({ kind: 'empty' });
  };
  const categoryLine =
    Object.entries(r.byCategory)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}=${n}`)
      .join(', ') || '없음';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded p-6 w-[420px] shadow-xl">
        <h2 className="text-lg font-bold">익명화 완료</h2>
        <ul className="mt-3 text-sm space-y-1">
          <li>총 적용: {r.totalBoxes}건</li>
          <li>영향 페이지: {r.pagesAffected.length}페이지</li>
          <li className={r.postCheckLeaks > 0 ? 'text-red-600' : 'text-green-700'}>
            검증 누수: {r.postCheckLeaks}건{' '}
            {r.postCheckLeaks === 0 ? '(통과)' : '(주의)'}
          </li>
          <li className="text-xs text-slate-500 mt-2">카테고리별: {categoryLine}</li>
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="px-3 py-1 border rounded" onClick={close}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
