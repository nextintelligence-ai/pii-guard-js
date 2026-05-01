import { useRef } from 'react';
import { Download, FolderPlus, Pause, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  running: boolean;
  hasJobs: boolean;
  hasDoneJobs: boolean;
  onAddFiles(files: File[]): void;
  onStart(): void;
  onPause(): void;
  onDownloadDone(): void;
  onClear(): void;
};

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export function BatchToolbar({
  running,
  hasJobs,
  hasDoneJobs,
  onAddFiles,
  onStart,
  onPause,
  onDownloadDone,
  onClear,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple
        hidden
        onChange={(event) => {
          const files = event.target.files
            ? Array.from(event.target.files).filter(isPdf)
            : [];
          if (files.length > 0) onAddFiles(files);
          event.target.value = '';
        }}
      />
      <Button variant="outline" onClick={() => inputRef.current?.click()}>
        <FolderPlus />
        PDF 추가
      </Button>
      <Button onClick={onStart} disabled={!hasJobs || running}>
        <Play />
        처리 시작
      </Button>
      <Button variant="outline" onClick={onPause} disabled={!running}>
        <Pause />
        일시정지
      </Button>
      <Button variant="outline" onClick={onDownloadDone} disabled={!hasDoneJobs}>
        <Download />
        성공 파일 저장
      </Button>
      <Button variant="ghost" onClick={onClear} disabled={!hasJobs}>
        <Trash2 />
        목록 비우기
      </Button>
    </div>
  );
}
