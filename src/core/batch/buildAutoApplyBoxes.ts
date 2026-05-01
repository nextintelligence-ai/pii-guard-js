import type { Candidate, RedactionBox } from '@/types/domain';

type Options = {
  autoApplyNer: boolean;
  nerThreshold?: number;
};

export function buildAutoApplyBoxes(
  candidates: Candidate[],
  options: Options,
): RedactionBox[] {
  return candidates
    .filter((candidate) => {
      if (candidate.source === 'auto' || candidate.source === 'ocr') return true;
      if (!options.autoApplyNer) return false;
      const threshold = options.nerThreshold ?? 0.7;
      return (
        (candidate.source === 'ner' || candidate.source === 'ocr-ner') &&
        candidate.confidence >= threshold
      );
    })
    .map((candidate) => ({
      id: candidate.id,
      pageIndex: candidate.pageIndex,
      bbox: candidate.bbox,
      source: candidate.source,
      category: candidate.category,
      enabled: true,
    }));
}
