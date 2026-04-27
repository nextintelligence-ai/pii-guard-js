import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/state/store';
import { Toolbar } from '@/components/Toolbar';
import { DropZone } from '@/components/DropZone';
import { PdfCanvas } from '@/components/PdfCanvas';
import { CandidatePanel } from '@/components/CandidatePanel';
import { PageNavigator } from '@/components/PageNavigator';
import { ReportModal } from '@/components/ReportModal';
import { UsageGuideModal } from '@/components/UsageGuideModal';
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
                <p className="text-sm text-muted-foreground">
                  파일을 업로드하면 후보가 표시됩니다.
                </p>
              )}
              {doc.kind === 'loading' && (
                <p className="text-sm text-muted-foreground">문서를 여는 중…</p>
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
                <p className="text-sm text-muted-foreground">익명화 적용 중…</p>
              )}
              {doc.kind === 'done' && (
                <Alert>
                  <AlertDescription>
                    완료. 다운로드 버튼을 눌러 저장하세요.
                  </AlertDescription>
                </Alert>
              )}
              {doc.kind === 'error' && (
                <Alert variant="destructive">
                  <AlertDescription>에러: {doc.message}</AlertDescription>
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
