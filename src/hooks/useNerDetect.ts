import { useEffect, useRef } from 'react';
import { useAppStore } from '@/state/store';
import { NerDispatcher } from '@/core/nerDispatcher';
import { serialize, entitiesToBoxes } from '@/core/spanMap';
import { useNerModel } from './useNerModel';
import { getPdfWorker } from '@/workers/pdfWorkerClient';

/**
 * NER 디스패처를 페이지 큐와 NER 워커, store 에 연결한다.
 *
 * - NER 모델이 ready 가 아니면 아무것도 하지 않는다 (기본 빌드에서는 항상 idle).
 * - 모델이 ready 되면 NerDispatcher 로 전 페이지 큐를 만들고 한 페이지씩 순차 처리.
 * - currentPage 가 바뀌면 해당 페이지의 우선순위를 끌어올려 사용자가 보고 있는
 *   페이지를 먼저 분석한다.
 * - cleanup 시 dispatcher 를 cancel + cancelled flag 로 진행 중 await 의 결과를 무시.
 */
export function useNerDetect(pageCount: number, currentPage: number): void {
  const ner = useNerModel();
  const setProgress = useAppStore((s) => s.setNerProgress);
  const addCandidates = useAppStore((s) => s.addNerCandidates);
  const dispatcherRef = useRef<NerDispatcher | null>(null);
  const nerWorker = ner.worker;
  const nerState = ner.state;

  useEffect(() => {
    if (nerState !== 'ready' || !nerWorker || pageCount === 0) return;
    const d = new NerDispatcher();
    d.enqueueAll(pageCount);
    dispatcherRef.current = d;
    setProgress(d.progress());
    let cancelled = false;

    void (async () => {
      while (!cancelled) {
        const p = d.next();
        if (p === null) break;
        try {
          const api = await getPdfWorker();
          const lines = await api.extractStructuredText(p);
          if (cancelled) return;
          const map = serialize(lines);
          const ents = await nerWorker.classify(map.pageText);
          if (cancelled) return;
          const boxes = entitiesToBoxes(map, ents);
          addCandidates(p, boxes);
          d.markDone(p);
          setProgress(d.progress());
        } catch (e) {
          if (cancelled) return;
          // 한 페이지 실패가 전체 파이프라인을 죽이지 않도록 markDone 처리.
          console.warn(`[useNerDetect] page ${p} 실패:`, e);
          d.markDone(p);
          setProgress(d.progress());
        }
      }
    })();

    return () => {
      cancelled = true;
      d.cancel();
      dispatcherRef.current = null;
    };
  }, [nerState, nerWorker, pageCount, addCandidates, setProgress]);

  useEffect(() => {
    dispatcherRef.current?.bumpPriority(currentPage);
  }, [currentPage]);
}
