import { useCallback, useRef, useState } from 'react';
import { getPdfWorker } from '@/workers/pdfWorkerClient';
import type { PageMeta, TextSpan } from '@/types/domain';

type PocStatus =
  | { kind: 'idle' }
  | { kind: 'busy'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; message: string };

export default function App() {
  const [pingResult, setPingResult] = useState<string>('');
  const [status, setStatus] = useState<PocStatus>({ kind: 'idle' });
  const [pages, setPages] = useState<PageMeta[]>([]);
  const [spans, setSpans] = useState<TextSpan[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const handlePing = useCallback(async () => {
    setPingResult('호출 중...');
    try {
      const t0 = performance.now();
      const r = await getPdfWorker().ping();
      const dt = (performance.now() - t0).toFixed(0);
      setPingResult(`응답: ${r} (${dt}ms)`);
    } catch (e) {
      setPingResult(`오류: ${(e as Error).message}`);
    }
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setStatus({ kind: 'busy', message: 'PDF 열기 중...' });
    setSpans([]);
    setPages([]);
    try {
      const buf = await file.arrayBuffer();
      const worker = getPdfWorker();
      const { pages: openedPages } = await worker.open(buf);
      setPages(openedPages);
      if (openedPages.length === 0) {
        setStatus({ kind: 'error', message: '페이지가 없습니다.' });
        return;
      }
      setStatus({ kind: 'busy', message: '페이지 렌더링 중...' });
      const scale = 1.5;
      const rendered = await worker.renderPage(0, scale);
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = rendered.widthPx;
        canvas.height = rendered.heightPx;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(rendered.bitmap, 0, 0);
        rendered.bitmap.close();
      }
      setStatus({ kind: 'busy', message: '텍스트 스팬 추출 중...' });
      const extracted = await worker.extractSpans(0);
      setSpans(extracted);
      setStatus({
        kind: 'ok',
        message: `완료: ${openedPages.length}쪽, page0 spans ${extracted.length}개`,
      });
    } catch (e) {
      setStatus({ kind: 'error', message: (e as Error).message });
    }
  }, []);

  return (
    <main className="min-h-screen p-6 text-slate-700">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">PDF 익명화 도구</h1>
        <p className="mt-1 text-sm text-slate-500">PoC: 워커 + MuPDF</p>
      </header>

      <section className="mb-6 rounded-lg border border-slate-300 bg-white p-4">
        <h2 className="mb-2 font-semibold">워커 핑</h2>
        <button
          type="button"
          onClick={handlePing}
          className="rounded bg-slate-800 px-4 py-2 text-white hover:bg-slate-700"
        >
          워커 ping
        </button>
        <p className="mt-2 text-sm">{pingResult}</p>
      </section>

      <section className="mb-6 rounded-lg border border-slate-300 bg-white p-4">
        <h2 className="mb-2 font-semibold">PDF 열기 + 렌더 + 스팬</h2>
        <input
          type="file"
          accept="application/pdf"
          onChange={(ev) => {
            const f = ev.target.files?.[0];
            if (f) void handleFile(f);
          }}
          className="block"
        />
        <p className="mt-2 text-sm">
          상태: <span className="font-mono">{statusToString(status)}</span>
        </p>
        {pages.length > 0 && (
          <p className="text-sm">
            페이지 수: {pages.length} / 첫 페이지 크기: {pages[0]?.widthPt.toFixed(1)} ×{' '}
            {pages[0]?.heightPt.toFixed(1)} pt (rot {pages[0]?.rotation}°)
          </p>
        )}
        {spans.length > 0 && (
          <details className="mt-2 text-xs">
            <summary>스팬 미리보기 ({spans.length}개)</summary>
            <ul className="mt-1 max-h-40 overflow-auto font-mono">
              {spans.slice(0, 20).map((s, i) => (
                <li key={i} className="truncate">
                  [{s.bbox.map((n) => n.toFixed(1)).join(', ')}] {s.text}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="rounded-lg border border-slate-300 bg-white p-4">
        <h2 className="mb-2 font-semibold">렌더 캔버스 (page 0)</h2>
        <div className="overflow-auto border border-slate-200">
          <canvas ref={canvasRef} className="block" />
        </div>
      </section>
    </main>
  );
}

function statusToString(s: PocStatus): string {
  switch (s.kind) {
    case 'idle':
      return '대기';
    case 'busy':
      return s.message;
    case 'error':
      return `오류: ${s.message}`;
    case 'ok':
      return s.message;
  }
}
