import { useCallback, useRef, useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

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
      onClick={() => inputRef.current?.click()}
      className={cn(
        'flex w-full max-w-md cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-12 text-center transition-colors',
        drag
          ? 'border-primary bg-primary/5'
          : 'border-muted-foreground/30 bg-background hover:border-primary/50 hover:bg-accent/30',
      )}
    >
      {drag ? (
        <Upload className="h-10 w-10 text-primary" />
      ) : (
        <FileText className="h-10 w-10 text-muted-foreground" />
      )}
      <div>
        <p className="font-medium text-foreground">PDF 파일을 여기에 드롭하세요</p>
        <p className="mt-1 text-sm text-muted-foreground">또는 클릭해서 선택</p>
      </div>
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
