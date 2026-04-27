import type { RedactionBox } from '@/types/domain';

type Snap = { boxes: Record<string, RedactionBox>; selectedBoxId: string | null };

const past: Snap[] = [];
const future: Snap[] = [];
const LIMIT = 100;

export const undoStack = {
  push(s: Snap) {
    past.push(structuredClone(s));
    if (past.length > LIMIT) past.shift();
    future.length = 0;
  },
  pushPast(s: Snap) {
    past.push(structuredClone(s));
    if (past.length > LIMIT) past.shift();
  },
  popPast(): Snap | null {
    return past.pop() ?? null;
  },
  pushFuture(s: Snap) {
    future.push(structuredClone(s));
  },
  popFuture(): Snap | null {
    return future.pop() ?? null;
  },
  clear() {
    past.length = 0;
    future.length = 0;
  },
};
