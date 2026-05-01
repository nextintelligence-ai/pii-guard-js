import { lazy, Suspense } from 'react';
import { ScanSearch, Loader2 } from 'lucide-react';
import { ApplyResultDialog } from '@/components/ApplyResultDialog';
import { CandidatePanel } from '@/components/CandidatePanel';
import { DropZone } from '@/components/DropZone';
import { OcrStatus } from '@/components/OcrStatus';
import { PageNavigator } from '@/components/PageNavigator';
import { PdfCanvas } from '@/components/PdfCanvas';
import { Toolbar } from '@/components/Toolbar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useApply } from '@/hooks/useApply';
import { useAutoDetect } from '@/hooks/useAutoDetect';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useOcrDetect } from '@/hooks/useOcrDetect';
import { usePdfDocument } from '@/hooks/usePdfDocument';
import { useAppStore } from '@/state/store';
import { useHelpDialogStore } from '@/state/helpDialogStore';

const NerRuntime = lazy(() => import('@/components/NerRuntime'));

export function SinglePage() {
  useKeyboard();
  useAutoDetect();
  useOcrDetect();
  const { load } = usePdfDocument();
  const { apply } = useApply();
  const doc = useAppStore((s) => s.doc);
  const openHelp = useHelpDialogStore((s) => s.openHelp);

  return (
    <>
      <Toolbar onLoad={load} onApply={apply} onHelp={openHelp} />
      <main className="grid flex-1 grid-cols-[320px_1fr] gap-3 p-3">
        <Card className="flex flex-col overflow-hidden p-1 pt-3">
          {doc.kind === 'ready' ? (
            <ScrollArea className="flex-1">
              <div className="p-3">
                <div className="mb-3 flex items-center gap-2 border-b pb-3 text-xs">
                  <Badge variant="outline">{doc.fileName}</Badge>
                  <span
                    className="whitespace-nowrap text-muted-foreground"
                    style={{ minWidth: 'fit-content' }}
                  >
                    {doc.pages.length}페이지
                  </span>
                </div>
                <Suspense fallback={null}>
                  <NerRuntime />
                </Suspense>
                <OcrStatus />
                <CandidatePanel />
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-1 flex-col p-3">
              {doc.kind === 'empty' && (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                  <ScanSearch className="h-10 w-10 text-muted-foreground/60" />
                  <p className="text-sm font-medium">아직 검사할 PDF가 없습니다.</p>
                </div>
              )}
              {doc.kind === 'loading' && (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">PDF를 여는 중이에요...</p>
                </div>
              )}
              {doc.kind === 'applying' && (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">개인정보를 가리는 중이에요</p>
                    <p className="text-xs text-muted-foreground">잠시만 기다려 주세요...</p>
                  </div>
                </div>
              )}
              {doc.kind === 'error' && (
                <Alert variant="destructive">
                  <AlertDescription>
                    <span className="font-medium">처리 중 문제가 발생했어요.</span>
                    <br />
                    {doc.message}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </Card>

        <Card className="flex flex-col items-center justify-center overflow-hidden p-3">
          {doc.kind === 'empty' || doc.kind === 'loading' ? (
            <DropZone onFile={load} />
          ) : doc.kind === 'ready' ? (
            <>
              <div className="max-h-[calc(100vh-180px)] w-full overflow-auto">
                <PdfCanvas />
              </div>
              <PageNavigator />
            </>
          ) : doc.kind === 'applying' ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">개인정보를 가리는 중이에요...</p>
            </div>
          ) : (
            <div className="text-muted-foreground">상태: {doc.kind}</div>
          )}
        </Card>
      </main>
      <ApplyResultDialog />
    </>
  );
}
