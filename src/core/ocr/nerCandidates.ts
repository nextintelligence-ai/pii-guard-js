import type { NerBox } from '@/core/spanMap';
import type { Bbox, Candidate, DetectionCategory } from '@/types/domain';
import { createId } from '@/utils/id';

type SupportedOcrNerCategory = Extract<
  DetectionCategory,
  'private_person' | 'private_address' | 'private_url' | 'private_date' | 'secret'
>;

type CandidateSource = Extract<Candidate['source'], 'ner' | 'ocr-ner'>;

const MIN_BOX_SIZE = 0.25;
const DUPLICATE_IOU_THRESHOLD = 0.5;

export function filterOcrNerBoxes(input: {
  pageIndex: number;
  boxes: NerBox[];
  primaryCandidates: Candidate[];
}): NerBox[] {
  const filtered = input.boxes.filter((box) => {
    if (!isSupportedOcrNerBox(box)) return false;
    if (!hasUsableGeometry(box)) return false;
    return !input.primaryCandidates.some((candidate) =>
      isDuplicatePrimaryCandidate(input.pageIndex, box, candidate),
    );
  });

  return dedupeByRoundedGeometry(filtered);
}

export function nerBoxesToCandidates(
  pageIndex: number,
  boxes: NerBox[],
  source: CandidateSource,
): Candidate[] {
  return boxes.flatMap((box) => {
    if (!isSupportedOcrNerBox(box) || !hasUsableGeometry(box)) return [];
    const { x, y, w, h } = box.bbox;
    return [
      {
        id: createId(),
        pageIndex,
        bbox: [x, y, x + w, y + h],
        text: '',
        category: box.category,
        confidence: box.score,
        source,
      },
    ];
  });
}

function isSupportedOcrNerBox(box: NerBox): box is NerBox & { category: SupportedOcrNerCategory } {
  return isSupportedOcrNerCategory(box.category);
}

function isSupportedOcrNerCategory(category: string): category is SupportedOcrNerCategory {
  switch (category) {
    case 'private_person':
    case 'private_address':
    case 'private_url':
    case 'private_date':
    case 'secret':
      return true;
    default:
      return false;
  }
}

function hasUsableGeometry(box: NerBox): boolean {
  const { x, y, w, h } = box.bbox;
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(w) &&
    Number.isFinite(h) &&
    w >= MIN_BOX_SIZE &&
    h >= MIN_BOX_SIZE
  );
}

function isDuplicatePrimaryCandidate(
  pageIndex: number,
  box: NerBox & { category: SupportedOcrNerCategory },
  candidate: Candidate,
): boolean {
  if (candidate.pageIndex !== pageIndex) return false;
  if (candidate.source === 'ner' || candidate.source === 'ocr-ner') return false;
  if (!categoriesEquivalent(box.category, candidate.category)) return false;
  return bboxIou(nerBoxToBbox(box), candidate.bbox) >= DUPLICATE_IOU_THRESHOLD;
}

function categoriesEquivalent(
  nerCategory: SupportedOcrNerCategory,
  candidateCategory: DetectionCategory,
): boolean {
  return (
    nerCategory === candidateCategory ||
    (nerCategory === 'private_address' && candidateCategory === 'address')
  );
}

function dedupeByRoundedGeometry(boxes: NerBox[]): NerBox[] {
  const byKey = new Map<string, NerBox>();
  for (const box of boxes) {
    const key = roundedGeometryKey(box);
    const existing = byKey.get(key);
    if (!existing || box.score > existing.score) {
      byKey.set(key, box);
    }
  }
  return Array.from(byKey.values());
}

function roundedGeometryKey(box: NerBox): string {
  const { x, y, w, h } = box.bbox;
  return [box.category, x, y, w, h]
    .map((value) => (typeof value === 'number' ? roundTenths(value) : value))
    .join(':');
}

function roundTenths(value: number): number {
  return Math.round(value * 10) / 10;
}

function nerBoxToBbox(box: NerBox): Bbox {
  const { x, y, w, h } = box.bbox;
  return [x, y, x + w, y + h];
}

function bboxIou(a: Bbox, b: Bbox): number {
  const x0 = Math.max(a[0], b[0]);
  const y0 = Math.max(a[1], b[1]);
  const x1 = Math.min(a[2], b[2]);
  const y1 = Math.min(a[3], b[3]);
  const intersection = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const union = areaA + areaB - intersection;
  return union <= 0 ? 0 : intersection / union;
}
