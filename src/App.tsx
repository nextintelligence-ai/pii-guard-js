import { useAppStore } from '@/state/store';
import { Toolbar } from '@/components/Toolbar';
import { DropZone } from '@/components/DropZone';
import { PdfCanvas } from '@/components/PdfCanvas';
import { usePdfDocument } from '@/hooks/usePdfDocument';

export default function App() {
  const { load } = usePdfDocument();
  const doc = useAppStore((s) => s.doc);

  return (
    <div className="min-h-screen flex flex-col">
      <Toolbar
        onLoad={load}
        onApply={() => {
          /* M5 */
        }}
        onDownload={() => {
          /* M5 */
        }}
      />
      <main className="flex-1 grid grid-cols-[300px_1fr] gap-2 p-3 bg-slate-100">
        <aside className="bg-white rounded shadow p-3 text-sm">
          {doc.kind === 'empty' && '파일을 업로드하면 후보가 표시됩니다.'}
          {doc.kind === 'loading' && '문서를 여는 중…'}
          {doc.kind === 'ready' && `파일: ${doc.fileName} · ${doc.pages.length}페이지`}
          {doc.kind === 'error' && <span className="text-red-600">에러: {doc.message}</span>}
        </aside>
        <section className="bg-white rounded shadow p-3 flex items-center justify-center">
          {doc.kind === 'empty' || doc.kind === 'loading' ? (
            <DropZone onFile={load} />
          ) : doc.kind === 'ready' ? (
            <div className="overflow-auto max-h-[calc(100vh-100px)]">
              <PdfCanvas />
            </div>
          ) : (
            <div className="text-slate-500">상태: {doc.kind}</div>
          )}
        </section>
      </main>
    </div>
  );
}
