import type { NerEntity } from '@/core/spanMap';

const KOREAN_TAX_FORM_PAGE_REFERENCE_RE = /이\s*서식\s*제\s*\d+\s*쪽/g;

export function filterNerEntitiesForText<T extends NerEntity>(
  text: string,
  entities: T[],
): T[] {
  return entities.filter((entity) => !isKoreanTaxFormPageReferencePerson(text, entity));
}

function isKoreanTaxFormPageReferencePerson(text: string, entity: NerEntity): boolean {
  if (entity.entity_group !== 'private_person') return false;

  const start = clampOffset(entity.start, text.length);
  const end = clampOffset(entity.end, text.length);
  if (end <= start) return false;

  if (isFullReferenceText(text.slice(start, end))) return true;

  for (const match of text.matchAll(KOREAN_TAX_FORM_PAGE_REFERENCE_RE)) {
    const matchStart = match.index ?? 0;
    const matchEnd = matchStart + match[0].length;
    if (rangesOverlap(start, end, matchStart, matchEnd)) return true;
  }

  return false;
}

function isFullReferenceText(value: string): boolean {
  return /^이\s*서식\s*제\s*\d+\s*쪽(?:의)?$/.test(value.trim());
}

function clampOffset(value: number, length: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), length);
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
