import { useCallback, useState } from 'react';
import { DropZone } from '@/components/DropZone';

export default function App() {
  const [picked, setPicked] = useState<string>('');

  const handleFile = useCallback((f: File) => {
    setPicked(`${f.name} (${f.size} bytes)`);
  }, []);

  return (
    <main className="min-h-screen p-6 text-slate-700">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">PDF 익명화 도구</h1>
        <p className="mt-1 text-sm text-slate-500">M2: 셸 구축 중</p>
      </header>

      <section className="rounded-lg border border-slate-300 bg-white p-4">
        <h2 className="mb-2 font-semibold">파일 선택</h2>
        <DropZone onFile={handleFile} />
        {picked && <p className="mt-3 text-sm">선택된 파일: {picked}</p>}
      </section>
    </main>
  );
}
