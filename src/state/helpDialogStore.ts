import { create } from 'zustand';

type State = {
  open: boolean;
  doNotShowAgain: boolean;
};

type Actions = {
  openHelp(): void;
  closeHelp(): void;
  setDoNotShowAgain(v: boolean): void;
};

export const useHelpDialogStore = create<State & Actions>((set) => ({
  open: false,
  doNotShowAgain: false,
  openHelp() {
    set({ open: true, doNotShowAgain: false });
  },
  closeHelp() {
    set({ open: false });
  },
  setDoNotShowAgain(v) {
    set({ doNotShowAgain: v });
  },
}));
