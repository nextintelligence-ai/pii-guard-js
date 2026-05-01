import { lazy, Suspense, useRef } from 'react';
import {
  Files,
  FolderOpen,
  HelpCircle,
  Redo2,
  ScanText,
  Shield,
  Undo2,
} from 'lucide-react';
import { useAppStore } from '@/state/store';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const NerLoadButton = lazy(() => import('@/components/NerLoadButton'));

type Props = {
  onLoad(f: File): void;
  onApply(): void;
  onHelp(): void;
  showFileOpen?: boolean;
  showApply?: boolean;
};

export function Toolbar({
  onLoad,
  onApply,
  onHelp,
  showFileOpen = true,
  showApply = true,
}: Props) {
  const docKind = useAppStore((s) => s.doc.kind);
  const nerProgress = useAppStore((s) => s.nerProgress);
  const currentPage = useAppStore((s) => s.currentPage);
  const requestOcrPage = useAppStore((s) => s.requestOcrPage);
  const requestOcrAll = useAppStore((s) => s.requestOcrAll);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isNerRunning = nerProgress.total > 0 && nerProgress.done < nerProgress.total;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-2 border-b bg-background px-4 py-2 shadow-sm">
        {showFileOpen && (
          <>
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
          </>
        )}

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

        <Separator orientation="vertical" className="h-6" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              onClick={() => requestOcrPage(currentPage)}
              disabled={docKind !== 'ready'}
              aria-label="현재 페이지 OCR"
            >
              <ScanText />
            </Button>
          </TooltipTrigger>
          <TooltipContent>현재 페이지 OCR</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              onClick={() => requestOcrAll()}
              disabled={docKind !== 'ready'}
              aria-label="전체 문서 OCR"
            >
              <Files />
            </Button>
          </TooltipTrigger>
          <TooltipContent>전체 문서 OCR</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-6" />
        <Suspense fallback={null}>
          <NerLoadButton />
        </Suspense>

        <div className="flex-1" />

        {showApply && (
          <Button
            size="sm"
            variant="destructive"
            onClick={onApply}
            disabled={docKind !== 'ready' || isNerRunning}
          >
            <Shield />
            익명화 적용
          </Button>
        )}
      </div>
    </TooltipProvider>
  );
}
