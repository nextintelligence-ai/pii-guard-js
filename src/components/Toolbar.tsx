import { useRef } from 'react';
import { FolderOpen, Undo2, Redo2, HelpCircle, Shield, Save } from 'lucide-react';
import { useAppStore } from '@/state/store';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type Props = {
  onLoad(f: File): void;
  onApply(): void;
  onDownload(): void;
  onHelp(): void;
};

export function Toolbar({ onLoad, onApply, onDownload, onHelp }: Props) {
  const docKind = useAppStore((s) => s.doc.kind);
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-2 border-b bg-background px-4 py-2 shadow-sm">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onLoad(f);
            e.target.value = '';
          }}
        />
        <Button size="sm" onClick={() => inputRef.current?.click()}>
          <FolderOpen />
          PDF 열기
        </Button>

        <Separator orientation="vertical" className="h-6" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              onClick={() => useAppStore.getState().undo()}
              aria-label="되돌리기"
            >
              <Undo2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>되돌리기 (⌘Z)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              onClick={() => useAppStore.getState().redo()}
              aria-label="다시 실행"
            >
              <Redo2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>다시 실행 (⇧⌘Z)</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-6" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" onClick={onHelp} aria-label="사용법">
              <HelpCircle />
            </Button>
          </TooltipTrigger>
          <TooltipContent>사용법 안내</TooltipContent>
        </Tooltip>

        <div className="flex-1" />

        <Button
          size="sm"
          variant="destructive"
          onClick={onApply}
          disabled={docKind !== 'ready'}
        >
          <Shield />
          익명화 적용
        </Button>
        <Button size="sm" onClick={onDownload} disabled={docKind !== 'done'}>
          <Save />
          PDF 저장
        </Button>
      </div>
    </TooltipProvider>
  );
}
