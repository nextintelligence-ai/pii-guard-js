import { useEffect } from 'react';
import { useAppStore } from '@/state/store';
import { getPdfWorker } from '@/workers/pdfWorkerClient';
import type { Candidate, RedactionBox } from '@/types/domain';

export function useAutoDetect() {
  const doc = useAppStore((s) => s.doc);
  const docEpoch = useAppStore((s) => s.docEpoch);
  const page = useAppStore((s) => s.currentPage);

  useEffect(() => {
    if (doc.kind !== 'ready') return;
    let cancelled = false;
    const isStaleJob = (): boolean =>
      cancelled ||
      useAppStore.getState().docEpoch !== docEpoch ||
      useAppStore.getState().doc.kind !== 'ready';

    void (async () => {
      try {
        const api = await getPdfWorker();
        if (isStaleJob()) return;
        const candidates = await detectAllWithRetry(api, page, isStaleJob);
        if (candidates === null || isStaleJob()) return;
        const s = useAppStore.getState();
        const remaining: Record<string, RedactionBox> = {};
        for (const id in s.boxes) {
          const b = s.boxes[id]!;
          if (!(b.source === 'auto' && b.pageIndex === page)) remaining[id] = b;
        }
        for (const c of candidates) {
          const enabled = s.categoryEnabled[c.category];
          const box: RedactionBox = {
            id: c.id,
            pageIndex: c.pageIndex,
            bbox: c.bbox,
            source: 'auto',
            category: c.category,
            enabled,
          };
          remaining[c.id] = box;
        }
        useAppStore.setState({
          candidates: [...s.candidates.filter((c) => c.source === 'ner'), ...candidates],
          boxes: remaining,
        });
        console.info('[useAutoDetect] 정규식 자동탐지 완료', {
          page,
          candidates: candidates.length,
        });
      } catch (e) {
        if (isStaleJob()) return;
        console.warn(`[useAutoDetect] page ${page} 정규식 자동탐지 실패:`, e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, docEpoch, page]);
}

async function detectAllWithRetry(
  api: Awaited<ReturnType<typeof getPdfWorker>>,
  page: number,
  isStaleJob: () => boolean,
): Promise<Candidate[] | null> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (isStaleJob()) return null;
    try {
      return await api.detectAll(page);
    } catch (e) {
      if (isStaleJob()) return null;
      if (!isNoDocumentOpenError(e) || attempt === maxAttempts) throw e;
      console.info(`[useAutoDetect] page ${page} PDF 문서가 아직 열리지 않아 재시도합니다.`, {
        attempt,
        maxAttempts,
      });
      await delay(100 * attempt);
    }
  }
  throw new Error('unreachable');
}

function isNoDocumentOpenError(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e);
  return message.includes('NO_DOCUMENT_OPEN');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
