import { create } from 'zustand';

type State = {
  singleFile: File | null;
  batchFiles: File[];
};

type Actions = {
  setSingleFile(file: File): void;
  consumeSingleFile(): File | null;
  setBatchFiles(files: File[]): void;
  consumeBatchFiles(): File[];
  reset(): void;
};

export const usePendingFileStore = create<State & Actions>((set, get) => ({
  singleFile: null,
  batchFiles: [],
  setSingleFile(file) {
    set({ singleFile: file });
  },
  consumeSingleFile() {
    const file = get().singleFile;
    set({ singleFile: null });
    return file;
  },
  setBatchFiles(files) {
    set({ batchFiles: files });
  },
  consumeBatchFiles() {
    const files = get().batchFiles;
    set({ batchFiles: [] });
    return files;
  },
  reset() {
    set({ singleFile: null, batchFiles: [] });
  },
}));
