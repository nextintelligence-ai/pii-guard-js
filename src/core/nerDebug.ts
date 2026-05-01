import type { NerEntity, StructuredLine } from '@/core/spanMap';

const DEBUG_STORAGE_KEY = 'piiGuard.debugNer';
const DEBUG_QUERY_PARAM = 'debugNer';

export type DebuggableNerEntity = NerEntity & {
  word?: string;
};

export function isNerDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;

  const queryValue = readDebugQueryValue();
  if (queryValue !== null) return isTruthyDebugValue(queryValue);

  try {
    return isTruthyDebugValue(window.localStorage.getItem(DEBUG_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function logNerDebug(label: string, payload: unknown): void {
  if (!isNerDebugEnabled()) return;
  console.info(`[NER debug] ${label}`, payload);
}

export function summarizeNerEntities(
  text: string,
  entities: DebuggableNerEntity[],
): Array<DebuggableNerEntity & { text: string }> {
  return entities.map((entity) => {
    const start = clampOffset(entity.start, text.length);
    const end = clampOffset(entity.end, text.length);
    return {
      ...entity,
      start,
      end,
      text: end > start ? text.slice(start, end) : '',
    };
  });
}

export function summarizeStructuredLines(
  lines: StructuredLine[],
): Array<{ id: number; text: string }> {
  return lines.map((line) => ({
    id: line.id,
    text: line.spans
      .flatMap((span) => span.chars.map((char) => char.ch))
      .join(''),
  }));
}

function readDebugQueryValue(): string | null {
  try {
    return new URLSearchParams(window.location.search).get(DEBUG_QUERY_PARAM);
  } catch {
    return null;
  }
}

function isTruthyDebugValue(value: string | null): boolean {
  if (value === null) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function clampOffset(value: number, length: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), length);
}
