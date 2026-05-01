import { useEffect, useRef } from 'react';
import { BatchDropZone } from '@/components/batch/BatchDropZone';
import { BatchJobTable } from '@/components/batch/BatchJobTable';
import { BatchSettings } from '@/components/batch/BatchSettings';
import { BatchSummary } from '@/components/batch/BatchSummary';
import { BatchToolbar } from '@/components/batch/BatchToolbar';
import { useBatchRunner } from '@/hooks/useBatchRunner';
import { useBatchStore } from '@/state/batchStore';
import { usePendingFileStore } from '@/state/pendingFileStore';
import { buildAnonymizedFileName, downloadBlob } from '@/utils/fileIO';

export function BatchPage() {
  const jobs = useBatchStore((s) => s.jobs);
  const addFiles = useBatchStore((s) => s.addFiles);
  const reset = useBatchStore((s) => s.reset);
  const { running, start, pause } = useBatchRunner();
  const consumedPendingFiles = useRef(false);

  useEffect(() => {
    if (consumedPendingFiles.current) return;
    consumedPendingFiles.current = true;
    const files = usePendingFileStore.getState().consumeBatchFiles();
    if (files.length > 0) addFiles(files);
  }, [addFiles]);

  const doneJobs = jobs.filter((job) => job.status === 'done' && job.outputBlob);

  return (
    <main className="flex-1 space-y-4 p-4">
      <BatchToolbar
        running={running}
        hasJobs={jobs.length > 0}
        hasDoneJobs={doneJobs.length > 0}
        onAddFiles={addFiles}
        onStart={start}
        onPause={pause}
        onDownloadDone={() => {
          for (const job of doneJobs) {
            if (job.outputBlob) {
              downloadBlob(job.outputBlob, buildAnonymizedFileName(job.fileName));
            }
          }
        }}
        onClear={reset}
      />
      <BatchSettings />
      <BatchDropZone onFiles={addFiles} />
      <BatchSummary />
      <BatchJobTable jobs={jobs} />
    </main>
  );
}
