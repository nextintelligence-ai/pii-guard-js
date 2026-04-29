/**
 * NER 페이지 큐 디스패처.
 *
 * 페이지별 NER 추론을 순차 처리하기 위한 우선순위 큐 + 진행률 + 캔슬 한 묶음.
 * 우선순위 high (예: 현재 페이지) 가 먼저, 동률이면 createdAt asc (FIFO).
 *
 * 일부러 의존성 0 — store / worker 결합은 hook 안에서.
 */

interface QueueItem {
  pageIndex: number;
  priority: number;
  createdAt: number;
}

export class NerDispatcher {
  private queue: QueueItem[] = [];
  private done = new Set<number>();
  private total = 0;
  private cancelled = false;

  enqueueAll(pageCount: number): void {
    this.total = pageCount;
    const now = Date.now();
    for (let i = 0; i < pageCount; i++) {
      this.queue.push({ pageIndex: i, priority: 0, createdAt: now + i });
    }
  }

  next(): number | null {
    if (this.cancelled) return null;
    if (this.queue.length === 0) return null;
    this.queue.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    const item = this.queue.shift();
    return item ? item.pageIndex : null;
  }

  bumpPriority(pageIndex: number): void {
    const item = this.queue.find((q) => q.pageIndex === pageIndex);
    if (item) item.priority = 10;
  }

  markDone(pageIndex: number): void {
    this.done.add(pageIndex);
  }

  cancel(): void {
    this.cancelled = true;
    this.queue = [];
    this.done.clear();
    this.total = 0;
  }

  progress(): { done: number; total: number } {
    return { done: this.done.size, total: this.total };
  }
}
