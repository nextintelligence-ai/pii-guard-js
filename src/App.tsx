import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/state/store';
import { Toolbar } from '@/components/Toolbar';
import { DropZone } from '@/components/DropZone';
import { PdfCanvas } from '@/components/PdfCanvas';
import { CandidatePanel } from '@/components/CandidatePanel';
import { PageNavigator } from '@/components/PageNavigator';
import { ReportModal } from '@/components/ReportModal';
import { UsageGuideModal } from '@/components/UsageGuideModal';
import { ScanSearch, Loader2, ShieldCheck, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Toaster } from '@/components/ui/sonner';
import { usePdfDocument } from '@/hooks/usePdfDocument';
import { useAutoDetect } from '@/hooks/useAutoDetect';
import { useApply } from '@/hooks/useApply';
import { useKeyboard } from '@/hooks/useKeyboard';
import { hasSeenUsageGuide, markUsageGuideSeen } from '@/utils/usageGuideStorage';

export default function App() {
  useKeyboard();
  useAutoDetect();
  const { load } = usePdfDocument();
  const { apply, download } = useApply();
  const doc = useAppStore((s) => s.doc);
  const [usageGuideOpen, setUsageGuideOpen] = useState(false);
  const [doNotShowUsageGuideAgain, setDoNotShowUsageGuideAgain] = useState(false);

  useEffect(() => {
    if (!hasSeenUsageGuide()) {
      setDoNotShowUsageGuideAgain(false);
      setUsageGuideOpen(true);
    }
  }, []);

  const openUsageGuide = useCallback(() => {
    setDoNotShowUsageGuideAgain(false);
    setUsageGuideOpen(true);
  }, []);

  const closeUsageGuide = useCallback(() => {
    if (doNotShowUsageGuideAgain) {
      markUsageGuideSeen();
    }
    setUsageGuideOpen(false);
  }, [doNotShowUsageGuideAgain]);

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <Toolbar onLoad={load} onApply={apply} onDownload={download} onHelp={openUsageGuide} />
      <main className="flex-1 grid grid-cols-[320px_1fr] gap-3 p-3">
        <Card className="flex flex-col overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="p-3">
              {doc.kind === 'empty' && (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <ScanSearch className="h-10 w-10 text-muted-foreground/60" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">아직 검사할 PDF가 없어요</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      오른쪽에 PDF를 올리면
                      <br />
                      주민번호·전화번호 같은 개인정보를
                      <br />
                      자동으로 찾아드릴게요
                    </p>
                  </div>
                  <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground/80">
                    여기서 시작 <ArrowRight className="h-3 w-3" />
                  </div>
                </div>
              )}
              {doc.kind === 'loading' && (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">PDF를 여는 중이에요…</p>
                </div>
              )}
              {doc.kind === 'ready' && (
                <>
                  <div className="mb-3 flex items-center gap-2 border-b pb-3 text-xs">
                    <Badge variant="outline">{doc.fileName}</Badge>
                    <span className="text-muted-foreground">{doc.pages.length}페이지</span>
                  </div>
                  <CandidatePanel />
                </>
              )}
              {doc.kind === 'applying' && (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">개인정보를 가리는 중이에요</p>
                    <p className="text-xs text-muted-foreground">잠시만 기다려 주세요…</p>
                  </div>
                </div>
              )}
              {doc.kind === 'done' && (
                <Alert>
                  <ShieldCheck className="h-4 w-4" />
                  <AlertDescription>
                    <span className="font-medium text-foreground">익명화가 끝났어요!</span>
                    <br />
                    상단의 다운로드 버튼을 눌러 저장하세요.
                  </AlertDescription>
                </Alert>
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
          </ScrollArea>
        </Card>

        <Card className="flex flex-col items-center justify-center overflow-hidden p-3">
          {doc.kind === 'empty' || doc.kind === 'loading' ? (
            <DropZone onFile={load} />
          ) : doc.kind === 'ready' ? (
            <>
              <div className="overflow-auto max-h-[calc(100vh-180px)]">
                <PdfCanvas />
              </div>
              <PageNavigator />
            </>
          ) : (
            <div className="text-muted-foreground">상태: {doc.kind}</div>
          )}
        </Card>
      </main>
      <ReportModal />
      <UsageGuideModal
        open={usageGuideOpen}
        doNotShowAgain={doNotShowUsageGuideAgain}
        onDoNotShowAgainChange={setDoNotShowUsageGuideAgain}
        onClose={closeUsageGuide}
      />
      <Toaster position="top-right" />
    </div>
  );
}
