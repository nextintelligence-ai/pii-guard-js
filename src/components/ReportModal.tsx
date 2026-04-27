import { useAppStore } from '@/state/store';
import { useApply } from '@/hooks/useApply';

export function ReportModal() {
  const doc = useAppStore((s) => s.doc);
  const dismissed = useAppStore((s) => s.reportDismissed);
  const { download } = useApply();
  if (doc.kind !== 'done' || dismissed) return null;
  const r = doc.report;
  const close = (): void => {
    // 결과 blob/리포트는 유지한 채 모달만 숨겨 다운로드 버튼이 계속 활성 상태가 되도록 한다.
    useAppStore.getState().dismissReport();
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
          <button
            type="button"
            className="px-3 py-1 rounded bg-slate-700 text-white"
            onClick={download}
          >
            다운로드
          </button>
        </div>
      </div>
    </div>
  );
}
