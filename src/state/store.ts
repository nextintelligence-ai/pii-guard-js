import { create } from 'zustand';
import type {
  ApplyReport,
  Bbox,
  Candidate,
  DetectionCategory,
  PageMeta,
  RedactionBox,
} from '@/types/domain';
import { createId } from '@/utils/id';
import { undoStack } from './undoStack';

export type DocState =
  | { kind: 'empty' }
  | { kind: 'loading' }
  | { kind: 'ready'; pages: PageMeta[]; fileName: string }
  | { kind: 'applying' }
  | { kind: 'done'; outputBlob: Blob; report: ApplyReport }
  | { kind: 'error'; message: string };

type State = {
  doc: DocState;
  currentPage: number;
  candidates: Candidate[];
  boxes: Record<string, RedactionBox>;
  selectedBoxId: string | null;
  categoryEnabled: Record<DetectionCategory, boolean>;
  reportDismissed: boolean;
};

type Actions = {
  setDoc(d: DocState): void;
  dismissReport(): void;
  goToPage(i: number): void;
  setCandidates(list: Candidate[]): void;
  addAutoBox(c: Candidate): void;
  addManualBox(b: { pageIndex: number; bbox: Bbox; label?: string }): string;
  addTextSelectBox(b: { pageIndex: number; bbox: Bbox }): string;
  toggleBox(id: string): void;
  toggleCategory(cat: DetectionCategory): void;
  updateBox(id: string, patch: Partial<RedactionBox>): void;
  deleteBox(id: string): void;
  selectBox(id: string | null): void;
  undo(): void;
  redo(): void;
  reset(): void;
};

const initial: State = {
  doc: { kind: 'empty' },
  currentPage: 0,
  candidates: [],
  boxes: {},
  selectedBoxId: null,
  categoryEnabled: {
    rrn: true,
    phone: true,
    email: true,
    account: true,
    businessNo: true,
    card: true,
    address: true,
  },
  reportDismissed: false,
};

export const useAppStore = create<State & Actions>((set, get) => ({
  ...initial,
  setDoc(d) {
    // 새 done 상태로 전환할 때마다 모달 dismiss 플래그를 초기화한다.
    // 그 외 상태(empty/loading/ready/applying/error)는 reportDismissed 를 그대로 둔다.
    if (d.kind === 'done') {
      set({ doc: d, reportDismissed: false });
    } else {
      set({ doc: d });
    }
  },
  dismissReport() {
    set({ reportDismissed: true });
  },
  goToPage(i) {
    set({ currentPage: i });
  },
  setCandidates(list) {
    set({ candidates: list });
  },
  addAutoBox(c) {
    undoStack.push({ boxes: get().boxes, selectedBoxId: get().selectedBoxId });
    const id = c.id;
    set((s) => ({
      boxes: {
        ...s.boxes,
        [id]: {
          id,
          pageIndex: c.pageIndex,
          bbox: c.bbox,
          source: 'auto',
          category: c.category,
          enabled: true,
        },
      },
    }));
  },
  addManualBox(b) {
    undoStack.push({ boxes: get().boxes, selectedBoxId: get().selectedBoxId });
    const id = createId();
    const box: RedactionBox =
      b.label !== undefined
        ? {
            id,
            pageIndex: b.pageIndex,
            bbox: b.bbox,
            source: 'manual-rect',
            label: b.label,
            enabled: true,
          }
        : {
            id,
            pageIndex: b.pageIndex,
            bbox: b.bbox,
            source: 'manual-rect',
            enabled: true,
          };
    set((s) => ({ boxes: { ...s.boxes, [id]: box } }));
    return id;
  },
  addTextSelectBox(b) {
    undoStack.push({ boxes: get().boxes, selectedBoxId: get().selectedBoxId });
    const id = createId();
    set((s) => ({
      boxes: {
        ...s.boxes,
        [id]: {
          id,
          pageIndex: b.pageIndex,
          bbox: b.bbox,
          source: 'text-select',
          enabled: true,
        },
      },
    }));
    return id;
  },
  toggleBox(id) {
    undoStack.push({ boxes: get().boxes, selectedBoxId: get().selectedBoxId });
    set((s) => {
      const b = s.boxes[id];
      if (!b) return s;
      return { boxes: { ...s.boxes, [id]: { ...b, enabled: !b.enabled } } };
    });
  },
  toggleCategory(cat) {
    undoStack.push({ boxes: get().boxes, selectedBoxId: get().selectedBoxId });
    const next = !get().categoryEnabled[cat];
    set((s) => {
      const updated: Record<string, RedactionBox> = { ...s.boxes };
      for (const id in updated) {
        const box = updated[id]!;
        if (box.source === 'auto' && box.category === cat) {
          updated[id] = { ...box, enabled: next };
        }
      }
      return {
        categoryEnabled: { ...s.categoryEnabled, [cat]: next },
        boxes: updated,
      };
    });
  },
  updateBox(id, patch) {
    undoStack.push({ boxes: get().boxes, selectedBoxId: get().selectedBoxId });
    set((s) => {
      const b = s.boxes[id];
      if (!b) return s;
      return { boxes: { ...s.boxes, [id]: { ...b, ...patch } } };
    });
  },
  deleteBox(id) {
    undoStack.push({ boxes: get().boxes, selectedBoxId: get().selectedBoxId });
    set((s) => {
      const c = { ...s.boxes };
      delete c[id];
      return {
        boxes: c,
        selectedBoxId: s.selectedBoxId === id ? null : s.selectedBoxId,
      };
    });
  },
  selectBox(id) {
    set({ selectedBoxId: id });
  },
  undo() {
    const cur = { boxes: get().boxes, selectedBoxId: get().selectedBoxId };
    const prev = undoStack.popPast();
    if (!prev) return;
    undoStack.pushFuture(cur);
    set(prev);
  },
  redo() {
    const cur = { boxes: get().boxes, selectedBoxId: get().selectedBoxId };
    const next = undoStack.popFuture();
    if (!next) return;
    undoStack.pushPast(cur);
    set(next);
  },
  reset() {
    undoStack.clear();
    set({ ...initial });
  },
}));
