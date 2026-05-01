import { create } from 'zustand';
import type {
  ApplyReport,
  Bbox,
  Candidate,
  DetectionCategory,
  OcrProgress,
  OcrRequest,
  PageMeta,
  RedactionBox,
} from '@/types/domain';
import type { NerBox } from '@/core/spanMap';
import { createId } from '@/utils/id';
import { undoStack } from './undoStack';

export type NerProgress = { done: number; total: number };

export type DocState =
  | { kind: 'empty' }
  | { kind: 'loading' }
  | { kind: 'ready'; pages: PageMeta[]; fileName: string; sourceId?: string }
  | { kind: 'applying' }
  | { kind: 'error'; message: string };

type State = {
  doc: DocState;
  docEpoch: number;
  currentPage: number;
  candidates: Candidate[];
  boxes: Record<string, RedactionBox>;
  selectedBoxId: string | null;
  focusNonce: number;
  categoryEnabled: Record<DetectionCategory, boolean>;
  applyResult: ApplyReport | null;
  nerThreshold: number;
  nerProgress: NerProgress;
  ocrProgress: OcrProgress;
  ocrRequest: OcrRequest;
};

type Actions = {
  setDoc(d: DocState): void;
  setApplyResult(r: ApplyReport | null): void;
  goToPage(i: number): void;
  setCandidates(list: Candidate[]): void;
  addAutoBox(c: Candidate): void;
  addNerCandidates(pageIndex: number, boxes: NerBox[]): void;
  addOcrNerCandidates(pageIndex: number, boxes: NerBox[]): void;
  addOcrCandidates(list: Candidate[], pageIndexes?: number[]): void;
  addManualBox(b: { pageIndex: number; bbox: Bbox; label?: string }): string;
  addTextSelectBox(b: { pageIndex: number; bbox: Bbox }): string;
  setOcrProgress(p: OcrProgress): void;
  requestOcrPage(pageIndex: number): void;
  requestOcrAll(): void;
  clearOcrRequest(nonce: number): void;
  toggleBox(id: string): void;
  toggleCategory(cat: DetectionCategory): void;
  updateBox(id: string, patch: Partial<RedactionBox>): void;
  deleteBox(id: string): void;
  selectBox(id: string | null): void;
  focusBox(id: string): void;
  setNerThreshold(v: number): void;
  setNerProgress(p: NerProgress): void;
  undo(): void;
  redo(): void;
  reset(): void;
};

const initial: State = {
  doc: { kind: 'empty' },
  docEpoch: 0,
  currentPage: 0,
  candidates: [],
  boxes: {},
  selectedBoxId: null,
  focusNonce: 0,
  categoryEnabled: {
    rrn: true,
    phone: true,
    email: true,
    account: true,
    businessNo: true,
    card: true,
    address: true,
    // 사람 이름은 기본 적용한다. 다른 NER 카테고리는 오탐 검토를 위해 사용자가 켠다.
    private_person: true,
    private_address: false,
    private_url: false,
    private_date: false,
    secret: false,
  },
  applyResult: null,
  nerThreshold: 0.7,
  nerProgress: { done: 0, total: 0 },
  ocrProgress: { done: 0, total: 0, currentPage: null, byPage: {} },
  ocrRequest: { kind: 'idle' },
};

let ocrRequestSeq = 0;

type NerSource = Extract<Candidate['source'], 'ner' | 'ocr-ner'>;

export const useAppStore = create<State & Actions>((set, get) => ({
  ...initial,
  setDoc(d) {
    set({ doc: d });
  },
  setApplyResult(r) {
    set({ applyResult: r });
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
  addNerCandidates(pageIndex, boxes) {
    if (boxes.length === 0) return;
    const { candidates: newCandidates, boxes: newBoxes } = buildNerRecords(
      get(),
      pageIndex,
      boxes,
      'ner',
    );
    set((s) => ({
      candidates: [...s.candidates, ...newCandidates],
      boxes: { ...s.boxes, ...newBoxes },
    }));
  },
  addOcrNerCandidates(pageIndex, boxes) {
    set((s) => {
      const nextBoxes: Record<string, RedactionBox> = { ...s.boxes };
      for (const id in nextBoxes) {
        const box = nextBoxes[id]!;
        if (box.source === 'ocr-ner' && box.pageIndex === pageIndex) {
          delete nextBoxes[id];
        }
      }
      const { candidates: newCandidates, boxes: newBoxes } = buildNerRecords(
        s,
        pageIndex,
        boxes,
        'ocr-ner',
      );
      return {
        candidates: [
          ...s.candidates.filter(
            (candidate) =>
              !(candidate.source === 'ocr-ner' && candidate.pageIndex === pageIndex),
          ),
          ...newCandidates,
        ],
        boxes: { ...nextBoxes, ...newBoxes },
      };
    });
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
  addOcrCandidates(list, pageIndexes) {
    if (list.length === 0 && pageIndexes === undefined) return;
    set((s) => ({
      ...mergeOcrCandidates(s, list, pageIndexes),
    }));
  },
  setOcrProgress(p) {
    set({ ocrProgress: p });
  },
  requestOcrPage(pageIndex) {
    set(() => ({
      ocrRequest: { kind: 'page', pageIndex, nonce: nextOcrRequestNonce() },
    }));
  },
  requestOcrAll() {
    set(() => ({ ocrRequest: { kind: 'all', nonce: nextOcrRequestNonce() } }));
  },
  clearOcrRequest(nonce) {
    set((s) =>
      s.ocrRequest.kind !== 'idle' && s.ocrRequest.nonce === nonce
        ? { ocrRequest: { kind: 'idle' } }
        : s,
    );
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
      const confidenceById = buildNerConfidenceMap(s.candidates);
      for (const id in updated) {
        const box = updated[id]!;
        if ((box.source === 'auto' || box.source === 'ocr') && box.category === cat) {
          updated[id] = { ...box, enabled: next };
        } else if (isNerSource(box.source) && box.category === cat) {
          updated[id] = {
            ...box,
            enabled: next && isNerBoxAboveThreshold(box, confidenceById, s.nerThreshold),
          };
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
  focusBox(id) {
    // 사이드바 행 클릭 같은 외부 트리거에서 사용. 같은 박스 재클릭 시에도
    // BoxOverlay 의 스크롤/강조 effect 가 다시 발화하도록 nonce 를 증가시킨다.
    set((s) => ({ selectedBoxId: id, focusNonce: s.focusNonce + 1 }));
  },
  setNerThreshold(v) {
    set((s) => {
      const confidenceById = buildNerConfidenceMap(s.candidates);
      const boxes: Record<string, RedactionBox> = {};
      for (const id in s.boxes) {
        const box = s.boxes[id]!;
        boxes[id] =
          isNerSource(box.source) && !isNerBoxAboveThreshold(box, confidenceById, v)
            ? { ...box, enabled: false }
            : box;
      }
      return { nerThreshold: v, boxes };
    });
  },
  setNerProgress(p) {
    set({ nerProgress: p });
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
    set({ ...initial, docEpoch: get().docEpoch + 1 });
  },
}));

function mergeOcrCandidates(
  s: State,
  list: Candidate[],
  pageIndexes?: number[],
): Pick<State, 'candidates' | 'boxes'> {
  const pages = new Set(pageIndexes ?? list.map((candidate) => candidate.pageIndex));
  const boxes: Record<string, RedactionBox> = { ...s.boxes };

  for (const id in boxes) {
    const box = boxes[id]!;
    if (box.source === 'ocr' && pages.has(box.pageIndex)) {
      delete boxes[id];
    }
  }

  for (const candidate of list) {
    boxes[candidate.id] = {
      id: candidate.id,
      pageIndex: candidate.pageIndex,
      bbox: candidate.bbox,
      source: 'ocr',
      category: candidate.category,
      enabled: s.categoryEnabled[candidate.category] ?? true,
    };
  }

  return {
    candidates: [
      ...s.candidates.filter(
        (candidate) => !(candidate.source === 'ocr' && pages.has(candidate.pageIndex)),
      ),
      ...list,
    ],
    boxes,
  };
}

function nextOcrRequestNonce(): number {
  ocrRequestSeq += 1;
  return ocrRequestSeq;
}

function buildNerRecords(
  s: State,
  pageIndex: number,
  boxes: NerBox[],
  source: NerSource,
): { candidates: Candidate[]; boxes: Record<string, RedactionBox> } {
  const newCandidates: Candidate[] = [];
  const newBoxes: Record<string, RedactionBox> = {};
  for (const b of boxes) {
    const id = createId();
    const category = b.category as DetectionCategory;
    const bbox: Bbox = [
      b.bbox.x,
      b.bbox.y,
      b.bbox.x + b.bbox.w,
      b.bbox.y + b.bbox.h,
    ];
    newCandidates.push({
      id,
      pageIndex,
      bbox,
      text: '',
      category,
      confidence: b.score,
      source,
    });
    // NER 카테고리가 켜져 있어도 신뢰도 기준을 통과해야 한다.
    const enabled = (s.categoryEnabled[category] ?? false) && b.score >= s.nerThreshold;
    newBoxes[id] = {
      id,
      pageIndex,
      bbox,
      source,
      category,
      enabled,
    };
  }
  return { candidates: newCandidates, boxes: newBoxes };
}

function isNerSource(source: Candidate['source'] | RedactionBox['source']): source is NerSource {
  return source === 'ner' || source === 'ocr-ner';
}

function buildNerConfidenceMap(candidates: Candidate[]): Map<string, number> {
  return new Map(
    candidates
      .filter((candidate) => isNerSource(candidate.source))
      .map((candidate) => [candidate.id, candidate.confidence]),
  );
}

function isNerBoxAboveThreshold(
  box: RedactionBox,
  confidenceById: Map<string, number>,
  threshold: number,
): boolean {
  if (!isNerSource(box.source)) return true;
  return (confidenceById.get(box.id) ?? 0) >= threshold;
}
