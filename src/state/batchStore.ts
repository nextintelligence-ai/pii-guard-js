import { create } from 'zustand';
import type { ApplyReport } from '@/types/domain';
import { createId } from '@/utils/id';

export type BatchJobStatus =
  | 'queued'
  | 'opening'
  | 'detecting'
  | 'ocr'
  | 'applying'
  | 'done'
  | 'warning'
  | 'failed'
  | 'cancelled';

export type BatchJob = {
  id: string;
  file: File;
  fileName: string;
  status: BatchJobStatus;
  candidateCount: number;
  enabledBoxCount: number;
  report: ApplyReport | null;
  outputBlob: Blob | null;
  errorMessage: string | null;
  needsReview: boolean;
};

export type BatchSettings = {
  useOcr: boolean;
  autoApplyNer: boolean;
};

export type BatchSummary = {
  total: number;
  queued: number;
  running: number;
  done: number;
  warning: number;
  failed: number;
  cancelled: number;
};

type State = {
  jobs: BatchJob[];
  settings: BatchSettings;
};

type Actions = {
  addFiles(files: File[]): void;
  updateJob(id: string, patch: Partial<BatchJob>): void;
  removeJob(id: string): void;
  clearCompleted(): void;
  setSettings(patch: Partial<BatchSettings>): void;
  getSummary(): BatchSummary;
  reset(): void;
};

const initialSettings: BatchSettings = {
  useOcr: true,
  autoApplyNer: false,
};

function createJob(file: File): BatchJob {
  return {
    id: createId(),
    file,
    fileName: file.name,
    status: 'queued',
    candidateCount: 0,
    enabledBoxCount: 0,
    report: null,
    outputBlob: null,
    errorMessage: null,
    needsReview: false,
  };
}

function isRunning(status: BatchJobStatus): boolean {
  return status === 'opening' || status === 'detecting' || status === 'ocr' || status === 'applying';
}

export const useBatchStore = create<State & Actions>((set, get) => ({
  jobs: [],
  settings: initialSettings,
  addFiles(files) {
    set((state) => ({ jobs: [...state.jobs, ...files.map(createJob)] }));
  },
  updateJob(id, patch) {
    set((state) => ({
      jobs: state.jobs.map((job) => (job.id === id ? { ...job, ...patch } : job)),
    }));
  },
  removeJob(id) {
    set((state) => ({ jobs: state.jobs.filter((job) => job.id !== id) }));
  },
  clearCompleted() {
    set((state) => ({ jobs: state.jobs.filter((job) => job.status !== 'done') }));
  },
  setSettings(patch) {
    set((state) => ({ settings: { ...state.settings, ...patch } }));
  },
  getSummary() {
    const jobs = get().jobs;
    return {
      total: jobs.length,
      queued: jobs.filter((job) => job.status === 'queued').length,
      running: jobs.filter((job) => isRunning(job.status)).length,
      done: jobs.filter((job) => job.status === 'done').length,
      warning: jobs.filter((job) => job.status === 'warning').length,
      failed: jobs.filter((job) => job.status === 'failed').length,
      cancelled: jobs.filter((job) => job.status === 'cancelled').length,
    };
  },
  reset() {
    set({ jobs: [], settings: initialSettings });
  },
}));
