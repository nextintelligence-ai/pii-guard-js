import { useCallback, useState } from 'react';
import { getPdfWorker } from '@/workers/pdfWorkerClient';

export default function App() {
  const [pingResult, setPingResult] = useState<string>('');

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

  return (
    <main className="min-h-screen p-6 text-slate-700">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">PDF 익명화 도구</h1>
        <p className="mt-1 text-sm text-slate-500">PoC: 워커 + MuPDF</p>
      </header>

      <section className="rounded-lg border border-slate-300 bg-white p-4">
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
    </main>
  );
}
