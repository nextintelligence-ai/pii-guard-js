import { useAppStore } from '@/state/store';
import { Toolbar } from '@/components/Toolbar';
import { DropZone } from '@/components/DropZone';
import { PdfCanvas } from '@/components/PdfCanvas';
import { CandidatePanel } from '@/components/CandidatePanel';
import { PageNavigator } from '@/components/PageNavigator';
import { ReportModal } from '@/components/ReportModal';
import { usePdfDocument } from '@/hooks/usePdfDocument';
import { useAutoDetect } from '@/hooks/useAutoDetect';
import { useApply } from '@/hooks/useApply';
import { useKeyboard } from '@/hooks/useKeyboard';

export default function App() {
  useKeyboard();
  useAutoDetect();
  const { load } = usePdfDocument();
  const { apply, download } = useApply();
  const doc = useAppStore((s) => s.doc);

  return (
    <div className="min-h-screen flex flex-col">
      <Toolbar onLoad={load} onApply={apply} onDownload={download} />
      <main className="flex-1 grid grid-cols-[300px_1fr] gap-2 p-3 bg-slate-100">
        <aside className="bg-white rounded shadow p-3 text-sm overflow-auto">
          {doc.kind === 'empty' && '파일을 업로드하면 후보가 표시됩니다.'}
          {doc.kind === 'loading' && '문서를 여는 중…'}
          {doc.kind === 'ready' && (
            <>
              <div className="mb-3 pb-3 border-b text-xs text-slate-500">
                {doc.fileName} · {doc.pages.length}페이지
              </div>
              <CandidatePanel />
            </>
          )}
          {doc.kind === 'applying' && '익명화 적용 중…'}
          {doc.kind === 'done' && (
            <span className="text-green-700">완료. 다운로드 버튼을 눌러 저장하세요.</span>
          )}
          {doc.kind === 'error' && <span className="text-red-600">에러: {doc.message}</span>}
        </aside>
        <section className="bg-white rounded shadow p-3 flex flex-col items-center justify-center overflow-auto">
          {doc.kind === 'empty' || doc.kind === 'loading' ? (
            <DropZone onFile={load} />
          ) : doc.kind === 'ready' ? (
            <>
              <div className="overflow-auto max-h-[calc(100vh-180px)]">
                <PdfCanvas />
              </div>
              <PageNavigator />
            </>
          ) : (
            <div className="text-slate-500">상태: {doc.kind}</div>
          )}
        </section>
      </main>
      <ReportModal />
    </div>
  );
}
