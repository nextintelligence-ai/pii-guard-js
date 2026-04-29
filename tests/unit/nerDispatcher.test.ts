import { describe, it, expect } from 'vitest';
import { NerDispatcher } from '@/core/nerDispatcher';

describe('NerDispatcher', () => {
  it('enqueueAll 후 next 가 priority desc / createdAt asc 로 작업을 반환한다', () => {
    const d = new NerDispatcher();
    d.enqueueAll(3); // pages 0,1,2 priority=0
    expect(d.next()).toBe(0);
    expect(d.next()).toBe(1);
    expect(d.next()).toBe(2);
    expect(d.next()).toBe(null);
  });

  it('bumpPriority 가 큐 안의 작업을 즉시 다음으로 끌어올린다', () => {
    const d = new NerDispatcher();
    d.enqueueAll(5);
    expect(d.next()).toBe(0); // 0 처리 시작
    d.markDone(0);
    d.bumpPriority(3);
    expect(d.next()).toBe(3);
  });

  it('cancel 후 next 는 null 을 돌려준다', () => {
    const d = new NerDispatcher();
    d.enqueueAll(3);
    d.cancel();
    expect(d.next()).toBe(null);
  });

  it('progress 는 done/total 을 보고한다', () => {
    const d = new NerDispatcher();
    d.enqueueAll(4);
    expect(d.progress()).toEqual({ done: 0, total: 4 });
    d.markDone(0);
    d.markDone(1);
    expect(d.progress()).toEqual({ done: 2, total: 4 });
  });

  it('빈 큐에서 next 는 null 을 반환한다', () => {
    const d = new NerDispatcher();
    expect(d.next()).toBe(null);
  });

  it('이미 처리한 pageIndex 의 bumpPriority 는 무시된다', () => {
    const d = new NerDispatcher();
    d.enqueueAll(3);
    expect(d.next()).toBe(0);
    d.markDone(0);
    // 큐에 0 은 더 이상 없음. bump 가 throw 하지 않고 영향 없어야 함.
    d.bumpPriority(0);
    expect(d.next()).toBe(1);
  });
});
