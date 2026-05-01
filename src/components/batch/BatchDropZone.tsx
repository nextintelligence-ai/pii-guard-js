import { useRef, useState } from 'react';
import { Files, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  onFiles(files: File[]): void;
};

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export function BatchDropZone({ onFiles }: Props) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = (files: FileList | File[]): void => {
    const pdfs = Array.from(files).filter(isPdf);
    if (pdfs.length > 0) onFiles(pdfs);
  };

  return (
    <div
      className={cn(
        'flex min-h-36 cursor-pointer flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed bg-background p-6 text-center transition-colors',
        drag ? 'border-primary bg-primary/5' : 'border-muted-foreground/30',
      )}
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => {
        event.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDrag(false);
        handleFiles(event.dataTransfer.files);
      }}
    >
      {drag ? (
        <Upload className="h-8 w-8 text-primary" />
      ) : (
        <Files className="h-8 w-8 text-muted-foreground" />
      )}
      <div>
        <p className="text-sm font-medium">PDF 여러 개를 여기에 드롭하세요</p>
        <p className="mt-1 text-xs text-muted-foreground">또는 클릭해서 추가</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files) handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </div>
  );
}
