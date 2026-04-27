import { useAppStore } from './store';
import type { RedactionBox } from '@/types/domain';

export const useBoxesForPage = (pageIndex: number): RedactionBox[] =>
  useAppStore((s) => Object.values(s.boxes).filter((b) => b.pageIndex === pageIndex));

export const useEnabledBoxes = (): RedactionBox[] =>
  useAppStore((s) => Object.values(s.boxes).filter((b) => b.enabled));
