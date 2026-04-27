import { useCallback, useRef, useState } from 'react';

type Props = { onFile(file: File): void };

export function DropZone({ onFile }: Props) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const f = e.dataTransfer.files?.[0];
      if (f && f.type === 'application/pdf') onFile(f);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      className={`border-2 border-dashed rounded p-12 text-center cursor-pointer transition
        ${drag ? 'border-slate-900 bg-slate-50' : 'border-slate-300 bg-white'}`}
      onClick={() => inputRef.current?.click()}
    >
      <p className="text-slate-600">PDF 파일을 여기에 드롭하거나 클릭해서 선택하세요</p>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
