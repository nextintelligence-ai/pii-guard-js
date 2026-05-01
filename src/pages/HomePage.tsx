import { useRef, useState } from 'react';
import { FileText, Files, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { usePendingFileStore } from '@/state/pendingFileStore';

type Mode = 'single' | 'batch';

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function navigateTo(to: '/single' | '/batch'): void {
  void import('@/router').then(({ router }) => {
    void router.navigate({ to });
  });
}

type StartPanelProps = {
  mode: Mode;
  title: string;
  description: string;
  action: string;
  onFiles(files: File[]): void;
};

function StartPanel({ mode, title, description, action, onFiles }: StartPanelProps) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const multiple = mode === 'batch';
  const Icon = multiple ? Files : FileText;

  const handleFiles = (files: FileList | File[]): void => {
    const pdfs = Array.from(files).filter(isPdf);
    const selected = multiple ? pdfs : pdfs.slice(0, 1);
    if (selected.length > 0) onFiles(selected);
  };

  return (
    <Card
      className={cn(
        'flex min-h-[280px] flex-col justify-between gap-6 border-dashed p-6 transition-colors',
        drag ? 'border-primary bg-primary/5' : 'bg-background',
      )}
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
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple={multiple}
        hidden
        onChange={(event) => {
          if (event.target.files) handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <div className="space-y-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => inputRef.current?.click()}>
          <Upload />
          {action}
        </Button>
        <p className="text-xs text-muted-foreground">
          {multiple ? '여러 PDF를 드롭할 수 있습니다' : 'PDF 1개를 드롭할 수 있습니다'}
        </p>
      </div>
    </Card>
  );
}

export function HomePage() {
  return (
    <main className="flex-1 p-4">
      <div className="mx-auto grid h-full max-w-6xl gap-4 md:grid-cols-2">
        <StartPanel
          mode="single"
          title="단일 PDF 처리"
          description="PDF 한 개를 열어 자동 탐지 후보를 검수하고 필요한 영역을 직접 보강한 뒤 익명화를 적용합니다."
          action="PDF 1개 선택"
          onFiles={(files) => {
            usePendingFileStore.getState().setSingleFile(files[0]!);
            navigateTo('/single');
          }}
        />
        <StartPanel
          mode="batch"
          title="여러 PDF 자동 처리"
          description="여러 PDF를 큐에 넣고 자동 탐지, 자동 익명화 적용, 적용 후 검증을 순차적으로 실행합니다."
          action="PDF 여러 개 선택"
          onFiles={(files) => {
            usePendingFileStore.getState().setBatchFiles(files);
            navigateTo('/batch');
          }}
        />
      </div>
    </main>
  );
}
