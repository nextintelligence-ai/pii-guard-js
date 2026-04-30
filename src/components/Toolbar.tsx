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

// NLP 모드에서만 NER 버튼을 렌더한다. lazy + 동적 import 로 기본 빌드(`dist/index.html`)
// 에 NER 워커 / @huggingface/transformers / onnxruntime-web 번들이 포함되지 않도록 한다.
// `import.meta.env.MODE` 는 빌드 시점에 literal 로 치환되므로 default 모드에서는 아래
// `lazy(...)` 호출 자체가 dead code 가 되어 chunk 가 emit 되지 않는다.
const NerLoadButton =
  import.meta.env.MODE === 'nlp'
    ? lazy(() => import('@/components/NerLoadButton'))
    : null;

type Props = {
  onLoad(f: File): void;
  onApply(): void;
  onHelp(): void;
};

export function Toolbar({ onLoad, onApply, onHelp }: Props) {
  const docKind = useAppStore((s) => s.doc.kind);
  const currentPage = useAppStore((s) => s.currentPage);
  const requestOcrPage = useAppStore((s) => s.requestOcrPage);
  const requestOcrAll = useAppStore((s) => s.requestOcrAll);
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

        {NerLoadButton && (
          <>
            <Separator orientation="vertical" className="h-6" />
            <Suspense fallback={null}>
              <NerLoadButton />
            </Suspense>
          </>
        )}

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
      </div>
    </TooltipProvider>
  );
}
