import { Link, Outlet } from '@tanstack/react-router';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { UsageGuideModal } from '@/components/UsageGuideModal';
import { useHelpDialogStore } from '@/state/helpDialogStore';
import { markUsageGuideSeen } from '@/utils/usageGuideStorage';

export function AppShell() {
  const open = useHelpDialogStore((s) => s.open);
  const doNotShowAgain = useHelpDialogStore((s) => s.doNotShowAgain);
  const openHelp = useHelpDialogStore((s) => s.openHelp);
  const closeHelp = useHelpDialogStore((s) => s.closeHelp);
  const setDoNotShowAgain = useHelpDialogStore((s) => s.setDoNotShowAgain);

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <header className="flex items-center gap-2 border-b bg-background px-4 py-2 shadow-sm">
        <Link to="/" className="mr-4 text-sm font-semibold">
          PDF 익명화 도구
        </Link>
        <Button asChild variant="ghost" size="sm">
          <Link to="/single">단일 처리</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/batch">일괄 처리</Link>
        </Button>
        <div className="flex-1" />
        <Button size="icon" variant="ghost" onClick={openHelp} aria-label="사용법">
          <HelpCircle />
        </Button>
      </header>
      <Outlet />
      <UsageGuideModal
        open={open}
        doNotShowAgain={doNotShowAgain}
        onDoNotShowAgainChange={setDoNotShowAgain}
        onClose={() => {
          if (doNotShowAgain) markUsageGuideSeen();
          closeHelp();
        }}
      />
      <Toaster position="bottom-center" />
    </div>
  );
}
