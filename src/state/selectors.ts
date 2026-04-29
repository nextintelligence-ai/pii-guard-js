import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from './store';
import type { Candidate, RedactionBox } from '@/types/domain';
import type { NerProgress } from './store';

export const useBoxesForPage = (pageIndex: number): RedactionBox[] =>
  useAppStore(
    useShallow((s) =>
      Object.values(s.boxes).filter((b) => b.pageIndex === pageIndex),
    ),
  );

export const useEnabledBoxes = (): RedactionBox[] =>
  useAppStore(useShallow((s) => Object.values(s.boxes).filter((b) => b.enabled)));

export const useNerCandidates = (): Candidate[] =>
  useAppStore(useShallow((s) => s.candidates.filter((c) => c.source === 'ner')));

export const useNerProgress = (): NerProgress =>
  useAppStore(useShallow((s) => s.nerProgress));
