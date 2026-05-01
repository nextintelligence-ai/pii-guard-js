import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOcrDetect } from '@/hooks/useOcrDetect';
import { useAppStore } from '@/state/store';
import { getOcrWorker } from '@/workers/ocrWorkerClient';

const { fakePdfWorker, fakeOcrWorker, fakeNerWorker } = vi.hoisted(() => ({
  fakePdfWorker: {
    inspectPageContent: vi.fn(),
    renderPagePng: vi.fn(),
  },
  fakeOcrWorker: {
    recognizePng: vi.fn(),
  },
  fakeNerWorker: {
    classify: vi.fn(),
  },
}));

vi.mock('@/workers/pdfWorkerClient', () => ({
  getPdfWorker: vi.fn().mockResolvedValue(fakePdfWorker),
}));

vi.mock('@/workers/ocrWorkerClient', () => ({
  getOcrWorker: vi.fn(() => fakeOcrWorker),
}));

vi.mock('@/hooks/useNerModel', () => ({
  useNerModel: () => ({
    state: 'ready',
    meta: null,
    worker: fakeNerWorker,
    loadFromUserDir: vi.fn(),
    reset: vi.fn(),
  }),
}));

async function waitForStore(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('store condition was not met');
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('OCR 탐지 플로우', () => {
  let root: Root | null = null;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    localStorage.clear();
    useAppStore.getState().reset();
    vi.clearAllMocks();
    fakePdfWorker.inspectPageContent.mockResolvedValue({
      pageIndex: 0,
      pageAreaPt: 10000,
      textCharCount: 0,
      textLineCount: 0,
      textAreaRatio: 0,
      imageBlocks: [{ bbox: [0, 0, 100, 100], widthPx: 1000, heightPx: 1000, areaRatio: 1 }],
      hasLargeImage: true,
      shouldAutoOcr: true,
    });
    fakePdfWorker.renderPagePng.mockResolvedValue({
      png: new Uint8Array([1, 2, 3]),
      widthPx: 200,
      heightPx: 100,
      scale: 2,
    });
    fakeOcrWorker.recognizePng.mockResolvedValue({
      lines: [
        {
          id: 'line-1',
          pageIndex: 0,
          text: '주민번호 000000-0000001',
          score: 0.93,
          poly: [
            { x: 0, y: 0 },
            { x: 220, y: 0 },
            { x: 220, y: 20 },
            { x: 0, y: 20 },
          ],
        },
      ],
    });
    fakeNerWorker.classify.mockResolvedValue([]);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    localStorage.clear();
    useAppStore.getState().reset();
    (console.info as typeof console.info & { mockRestore?: () => void }).mockRestore?.();
    (console.warn as typeof console.warn & { mockRestore?: () => void }).mockRestore?.();
  });

  it('이미지 기반 페이지는 자동 OCR 을 실행해 OCR 후보를 저장한다', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    function Probe() {
      useOcrDetect();
      return null;
    }

    useAppStore.getState().setDoc({
      kind: 'ready',
      fileName: 'scan.pdf',
      pages: [{ index: 0, widthPt: 100, heightPt: 100, rotation: 0 }],
    });

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });

    await waitForStore(() => useAppStore.getState().candidates.some((c) => c.source === 'ocr'));

    const state = useAppStore.getState();
    const candidate = state.candidates.find((c) => c.source === 'ocr');
    expect(fakePdfWorker.inspectPageContent).toHaveBeenCalledWith(0);
    expect(fakePdfWorker.renderPagePng).toHaveBeenCalledWith(0, 2);
    expect(fakeOcrWorker.recognizePng).toHaveBeenCalledWith({
      pageIndex: 0,
      png: new Uint8Array([1, 2, 3]),
    });
    expect(candidate).toMatchObject({
      source: 'ocr',
      category: 'rrn',
      confidence: 0.93,
    });
    expect(state.boxes[candidate!.id]).toMatchObject({
      source: 'ocr',
      category: 'rrn',
      enabled: true,
    });
    expect(state.ocrProgress.byPage[0]?.status).toBe('done');
    expect(consoleInfo).toHaveBeenCalledWith(
      '[useOcrDetect] OCR 성공',
      expect.objectContaining({
        page: 1,
        lines: 1,
        candidates: 1,
        renderScale: 2,
        textLines: ['주민번호 000000-0000001'],
        text: '주민번호 000000-0000001',
      }),
    );
  });

  it('OCR worker 콘솔이 보이지 않아도 메인 스레드에 회전 진단을 남긴다', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    fakeOcrWorker.recognizePng.mockResolvedValue({
      lines: [
        {
          id: 'line-1',
          pageIndex: 0,
          text: '고객명 홍길동',
          score: 0.93,
          poly: [
            { x: 0, y: 0 },
            { x: 220, y: 0 },
            { x: 220, y: 20 },
            { x: 0, y: 20 },
          ],
        },
      ],
      runtime: {
        requestedBackend: 'auto',
        rotationApplied: 90,
        rotationDiagnostics: {
          pageIndex: 0,
          selectedRotation: 90,
          reason: 'rotated-selected-after-rotation-probe',
          probeReasons: ['noisy-text'],
          candidates: [
            {
              rotation: 0,
              shortLineRatio: 0.625,
              symbolRatio: 0.3768,
              textQualityScore: 0.3721,
            },
            {
              rotation: 90,
              shortLineRatio: 0,
              symbolRatio: 0.0714,
              textQualityScore: 1,
            },
          ],
        },
      },
    });

    function Probe() {
      useOcrDetect();
      return null;
    }

    useAppStore.getState().setDoc({
      kind: 'ready',
      fileName: 'scan.pdf',
      pages: [{ index: 0, widthPt: 100, heightPt: 100, rotation: 0 }],
    });

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });

    await waitForStore(() => useAppStore.getState().ocrProgress.byPage[0]?.status === 'done');

    expect(consoleInfo).toHaveBeenCalledWith(
      '[useOcrDetect] OCR 회전 진단',
      expect.objectContaining({
        page: 1,
        pageIndex: 0,
        rotationApplied: 90,
        hasDiagnostics: true,
        diagnostics: expect.objectContaining({
          selectedRotation: 90,
          probeReasons: ['noisy-text'],
        }),
      }),
    );
    expect(consoleInfo).toHaveBeenCalledWith(
      '[useOcrDetect] OCR 성공',
      expect.objectContaining({
        rotationDiagnostics: expect.objectContaining({
          selectedRotation: 90,
        }),
      }),
    );
  });

  it('auto 옵션이 꺼져 있으면 화면 진입만으로 OCR 대상을 검사하지 않는다', async () => {
    function Probe() {
      useOcrDetect({ auto: false });
      return null;
    }

    useAppStore.getState().setDoc({
      kind: 'ready',
      fileName: 'scan.pdf',
      pages: [{ index: 0, widthPt: 100, heightPt: 100, rotation: 0 }],
    });

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(fakePdfWorker.inspectPageContent).not.toHaveBeenCalled();
    expect(fakePdfWorker.renderPagePng).not.toHaveBeenCalled();
    expect(getOcrWorker).not.toHaveBeenCalled();
    expect(useAppStore.getState().candidates).toEqual([]);
  });

  it('auto 옵션이 꺼져 있어도 현재 페이지 OCR 요청은 실행한다', async () => {
    function Probe() {
      useOcrDetect({ auto: false });
      return null;
    }

    useAppStore.getState().setDoc({
      kind: 'ready',
      fileName: 'scan.pdf',
      pages: [{ index: 0, widthPt: 100, heightPt: 100, rotation: 0 }],
    });

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });
    await act(async () => {
      useAppStore.getState().requestOcrPage(0);
    });

    await waitForStore(() => useAppStore.getState().candidates.some((c) => c.source === 'ocr'));

    expect(fakePdfWorker.inspectPageContent).not.toHaveBeenCalled();
    expect(fakePdfWorker.renderPagePng).toHaveBeenCalledWith(0, 2);
    expect(useAppStore.getState().ocrRequest).toEqual({ kind: 'idle' });
  });

  it('OCR 텍스트도 NER 로 분석해 비정형 PII 후보를 저장한다', async () => {
    fakeOcrWorker.recognizePng.mockResolvedValue({
      lines: [
        {
          id: 'line-name',
          pageIndex: 0,
          text: '담당자 Alice Smith',
          score: 0.96,
          poly: [
            { x: 0, y: 0 },
            { x: 220, y: 0 },
            { x: 220, y: 20 },
            { x: 0, y: 20 },
          ],
        },
      ],
    });
    fakeNerWorker.classify.mockResolvedValue([
      {
        entity_group: 'private_person',
        start: 4,
        end: 15,
        score: 0.98,
        word: 'Alice Smith',
      },
    ]);

    function Probe() {
      useOcrDetect();
      return null;
    }

    useAppStore.getState().setDoc({
      kind: 'ready',
      fileName: 'scan.pdf',
      pages: [{ index: 0, widthPt: 100, heightPt: 100, rotation: 0 }],
    });

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });

    await waitForStore(() =>
      useAppStore.getState().candidates.some((c) => c.source === 'ocr-ner'),
    );

    const state = useAppStore.getState();
    const candidate = state.candidates.find((c) => c.source === 'ocr-ner');
    expect(fakeNerWorker.classify).toHaveBeenCalledWith('담당자 Alice Smith');
    expect(candidate).toMatchObject({
      pageIndex: 0,
      category: 'private_person',
      confidence: 0.98,
      source: 'ocr-ner',
    });
    expect(state.boxes[candidate!.id]).toMatchObject({
      source: 'ocr-ner',
      category: 'private_person',
      enabled: true,
    });
    expect(state.boxes[candidate!.id]?.bbox[0]).toBeGreaterThan(0);
  });

  it('OCR-NER 는 정규식 탐지 영역의 structured NER category 를 저장하지 않는다', async () => {
    fakeOcrWorker.recognizePng.mockResolvedValue({
      lines: [
        {
          id: 'line-email',
          pageIndex: 0,
          text: '이메일 alice@example.com',
          score: 0.96,
          poly: [
            { x: 0, y: 0 },
            { x: 220, y: 0 },
            { x: 220, y: 20 },
            { x: 0, y: 20 },
          ],
        },
      ],
    });
    fakeNerWorker.classify.mockResolvedValue([
      {
        entity_group: 'private_email',
        start: 4,
        end: 21,
        score: 0.99,
        word: 'alice@example.com',
      },
    ]);

    function Probe() {
      useOcrDetect();
      return null;
    }

    useAppStore.getState().setDoc({
      kind: 'ready',
      fileName: 'scan.pdf',
      pages: [{ index: 0, widthPt: 100, heightPt: 100, rotation: 0 }],
    });

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });

    await waitForStore(() => useAppStore.getState().ocrProgress.byPage[0]?.status === 'done');

    const state = useAppStore.getState();
    expect(state.candidates.some((candidate) => candidate.source === 'ocr')).toBe(true);
    expect(state.candidates.some((candidate) => candidate.source === 'ocr-ner')).toBe(false);
    expect(
      Object.values(state.boxes).some((box) => box.source === 'ocr-ner'),
    ).toBe(false);
  });

  it('known OCR-NER 런타임 오류는 경고를 반복하지 않고 OCR 후보 저장을 막지 않는다', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    fakeNerWorker.classify.mockRejectedValue(
      new Error(
        "failed to call OrtRun(). ERROR_CODE: 1, ERROR_MESSAGE: Non-zero status code returned while running GatherBlockQuantized node. Name:'/model/embed_tokens/Gather_Quant' Status Message: program_manager.cc:22 NormalizeDispatchGroupSize Invalid dispatch group size (0, 1, 1)",
      ),
    );
    fakePdfWorker.inspectPageContent.mockImplementation((pageIndex: number) =>
      Promise.resolve({
        pageIndex,
        pageAreaPt: 10000,
        textCharCount: 0,
        textLineCount: 0,
        textAreaRatio: 0,
        imageBlocks: [{ bbox: [0, 0, 100, 100], widthPx: 1000, heightPx: 1000, areaRatio: 1 }],
        hasLargeImage: true,
        shouldAutoOcr: true,
      }),
    );

    function Probe() {
      useOcrDetect();
      return null;
    }

    useAppStore.getState().setDoc({
      kind: 'ready',
      fileName: 'scan.pdf',
      pages: [
        { index: 0, widthPt: 100, heightPt: 100, rotation: 0 },
        { index: 1, widthPt: 100, heightPt: 100, rotation: 0 },
      ],
    });

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });

    await waitForStore(() => useAppStore.getState().ocrProgress.done === 2);

    const state = useAppStore.getState();
    expect(fakeNerWorker.classify).toHaveBeenCalledTimes(1);
    expect(state.candidates.filter((candidate) => candidate.source === 'ocr')).toHaveLength(2);
    expect(state.candidates.some((candidate) => candidate.source === 'ocr-ner')).toBe(false);
    expect(consoleWarn).not.toHaveBeenCalledWith(
      '[useOcrDetect] OCR-NER 실패',
      expect.anything(),
    );
    expect(consoleInfo).toHaveBeenCalledWith(
      '[useOcrDetect] OCR-NER 비활성화',
      expect.objectContaining({
        page: 1,
        pageIndex: 0,
        message: expect.stringContaining('GatherBlockQuantized'),
      }),
    );
  });

  it('OCR 진행 중 페이지 이동은 진행 중인 OCR job 을 재시작하지 않는다', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const page0Recognition = deferred<{
      lines: Array<{
        id: string;
        pageIndex: number;
        text: string;
        score: number;
        poly: Array<{ x: number; y: number }>;
      }>;
    }>();
    fakePdfWorker.inspectPageContent.mockImplementation((pageIndex: number) =>
      Promise.resolve({
        pageIndex,
        pageAreaPt: 10000,
        textCharCount: 0,
        textLineCount: 0,
        textAreaRatio: 0,
        imageBlocks: [{ bbox: [0, 0, 100, 100], widthPx: 1000, heightPx: 1000, areaRatio: 1 }],
        hasLargeImage: true,
        shouldAutoOcr: true,
      }),
    );
    fakeOcrWorker.recognizePng.mockImplementation(({ pageIndex }: { pageIndex: number }) => {
      if (pageIndex === 0) return page0Recognition.promise;
      return Promise.resolve({
        lines: [
          {
            id: `line-${pageIndex}`,
            pageIndex,
            text: '주민번호 000000-0000001',
            score: 0.93,
            poly: [
              { x: 0, y: 0 },
              { x: 220, y: 0 },
              { x: 220, y: 20 },
              { x: 0, y: 20 },
            ],
          },
        ],
      });
    });

    function Probe() {
      useOcrDetect();
      return null;
    }

    useAppStore.getState().setDoc({
      kind: 'ready',
      fileName: 'scan.pdf',
      pages: [
        { index: 0, widthPt: 100, heightPt: 100, rotation: 0 },
        { index: 1, widthPt: 100, heightPt: 100, rotation: 0 },
      ],
    });

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });
    await waitForStore(() => fakeOcrWorker.recognizePng.mock.calls.length === 1);

    await act(async () => {
      useAppStore.getState().goToPage(1);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(useAppStore.getState().ocrProgress.currentPage).toBe(0);
    expect(fakePdfWorker.renderPagePng).toHaveBeenCalledTimes(1);
    expect(fakeOcrWorker.recognizePng).toHaveBeenCalledTimes(1);

    page0Recognition.resolve({
      lines: [
        {
          id: 'line-0',
          pageIndex: 0,
          text: '주민번호 000000-0000001',
          score: 0.93,
          poly: [
            { x: 0, y: 0 },
            { x: 220, y: 0 },
            { x: 220, y: 20 },
            { x: 0, y: 20 },
          ],
        },
      ],
    });

    await waitForStore(() => useAppStore.getState().ocrProgress.done === 2);

    expect(fakePdfWorker.renderPagePng).toHaveBeenCalledTimes(2);
    expect(fakeOcrWorker.recognizePng).toHaveBeenCalledTimes(2);
    expect(consoleInfo).toHaveBeenCalledWith(
      '[useOcrDetect] OCR 성공',
      expect.objectContaining({ page: 2 }),
    );
  });

  it('OCR-NER 디버그 플래그가 켜지면 OCR 원문과 NER 결과를 남긴다', async () => {
    localStorage.setItem('piiGuard.debugNer', '1');
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    fakeOcrWorker.recognizePng.mockResolvedValue({
      lines: [
        {
          id: 'line-name',
          pageIndex: 0,
          text: '담당자 Alice Smith',
          score: 0.96,
          poly: [
            { x: 0, y: 0 },
            { x: 220, y: 0 },
            { x: 220, y: 20 },
            { x: 0, y: 20 },
          ],
        },
      ],
    });
    fakeNerWorker.classify.mockResolvedValue([
      {
        entity_group: 'private_person',
        start: 4,
        end: 15,
        score: 0.98,
        word: 'Alice Smith',
      },
    ]);

    function Probe() {
      useOcrDetect();
      return null;
    }

    useAppStore.getState().setDoc({
      kind: 'ready',
      fileName: 'scan.pdf',
      pages: [{ index: 0, widthPt: 100, heightPt: 100, rotation: 0 }],
    });

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });

    await waitForStore(() =>
      useAppStore.getState().candidates.some((c) => c.source === 'ocr-ner'),
    );

    expect(consoleInfo).toHaveBeenCalledWith(
      '[NER debug] ocr classify result',
      expect.objectContaining({
        pageIndex: 0,
        pageText: '담당자 Alice Smith',
        rawEntities: [
          expect.objectContaining({
            entity_group: 'private_person',
            word: 'Alice Smith',
            text: 'Alice Smith',
          }),
        ],
        filteredEntities: [
          expect.objectContaining({
            entity_group: 'private_person',
            word: 'Alice Smith',
            text: 'Alice Smith',
          }),
        ],
        boxes: [
          expect.objectContaining({
            category: 'private_person',
          }),
        ],
      }),
    );
  });

  it('NER 준비 후 기존 OCR 후보만 있는 페이지도 OCR-NER 대상으로 다시 처리한다', async () => {
    fakePdfWorker.inspectPageContent.mockResolvedValue({
      pageIndex: 0,
      pageAreaPt: 10000,
      textCharCount: 500,
      textLineCount: 20,
      textAreaRatio: 0.8,
      imageBlocks: [],
      hasLargeImage: false,
      shouldAutoOcr: false,
    });
    fakeOcrWorker.recognizePng.mockResolvedValue({
      lines: [
        {
          id: 'line-name',
          pageIndex: 0,
          text: '담당자 Alice Smith',
          score: 0.96,
          poly: [
            { x: 0, y: 0 },
            { x: 220, y: 0 },
            { x: 220, y: 20 },
            { x: 0, y: 20 },
          ],
        },
      ],
    });
    fakeNerWorker.classify.mockResolvedValue([
      {
        entity_group: 'private_person',
        start: 4,
        end: 15,
        score: 0.98,
        word: 'Alice Smith',
      },
    ]);

    function Probe() {
      useOcrDetect();
      return null;
    }

    useAppStore.getState().setDoc({
      kind: 'ready',
      fileName: 'text.pdf',
      pages: [{ index: 0, widthPt: 100, heightPt: 100, rotation: 0 }],
    });
    useAppStore.getState().addOcrCandidates([
      {
        id: 'ocr-prev',
        pageIndex: 0,
        bbox: [0, 0, 10, 10],
        text: '이전 OCR 결과',
        category: 'rrn',
        confidence: 0.9,
        source: 'ocr',
      },
    ]);

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });

    await waitForStore(() =>
      useAppStore.getState().candidates.some((c) => c.source === 'ocr-ner'),
    );

    expect(fakePdfWorker.renderPagePng).toHaveBeenCalledWith(0, 2);
    expect(fakeNerWorker.classify).toHaveBeenCalledWith('담당자 Alice Smith');
    expect(useAppStore.getState().candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'ocr-ner',
          category: 'private_person',
          confidence: 0.98,
        }),
      ]),
    );
  });

  it('자동 대상이 아니어도 현재 페이지 OCR 요청은 엔진을 실행한다', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    fakePdfWorker.inspectPageContent.mockResolvedValue({
      pageIndex: 0,
      pageAreaPt: 10000,
      textCharCount: 500,
      textLineCount: 20,
      textAreaRatio: 0.8,
      imageBlocks: [],
      hasLargeImage: false,
      shouldAutoOcr: false,
    });

    function Probe() {
      useOcrDetect();
      return null;
    }

    useAppStore.getState().setDoc({
      kind: 'ready',
      fileName: 'text.pdf',
      pages: [{ index: 0, widthPt: 100, heightPt: 100, rotation: 0 }],
    });

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });
    await act(async () => {
      useAppStore.getState().requestOcrPage(0);
    });

    await waitForStore(() => useAppStore.getState().candidates.some((c) => c.source === 'ocr'));

    expect(fakePdfWorker.renderPagePng).toHaveBeenCalledWith(0, 2);
    expect(fakeOcrWorker.recognizePng).toHaveBeenCalledWith({
      pageIndex: 0,
      png: new Uint8Array([1, 2, 3]),
    });
    expect(useAppStore.getState().ocrProgress.byPage[0]).toEqual({ status: 'done' });
    expect(useAppStore.getState().ocrRequest).toEqual({ kind: 'idle' });
    expect(consoleInfo).toHaveBeenCalledWith(
      '[useOcrDetect] OCR 성공',
      expect.objectContaining({
        page: 1,
        lines: 1,
        candidates: 1,
        renderScale: 2,
      }),
    );
  });

  it('OCR 런타임 메모리 오류는 성공으로 기록하지 않고 실패로 표시한다', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fakePdfWorker.inspectPageContent.mockResolvedValue({
      pageIndex: 0,
      pageAreaPt: 10000,
      textCharCount: 0,
      textLineCount: 0,
      textAreaRatio: 0,
      imageBlocks: [{ bbox: [0, 0, 100, 100], widthPx: 1000, heightPx: 1000, areaRatio: 1 }],
      hasLargeImage: true,
      shouldAutoOcr: true,
    });
    fakeOcrWorker.recognizePng.mockRejectedValue(new Error('memory access out of bounds'));

    function Probe() {
      useOcrDetect();
      return null;
    }

    useAppStore.getState().setDoc({
      kind: 'ready',
      fileName: 'text.pdf',
      pages: [{ index: 0, widthPt: 100, heightPt: 100, rotation: 0 }],
    });

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });
    await act(async () => {
      useAppStore.getState().requestOcrPage(0);
    });

    await waitForStore(() => useAppStore.getState().ocrProgress.byPage[0]?.status === 'failed');

    expect(fakePdfWorker.renderPagePng).toHaveBeenCalledWith(0, 2);
    expect(fakeOcrWorker.recognizePng).toHaveBeenCalled();
    expect(useAppStore.getState().ocrProgress.byPage[0]).toEqual({
      status: 'failed',
      message: 'memory access out of bounds',
    });
    expect(useAppStore.getState().ocrRequest).toEqual({ kind: 'idle' });
    expect(consoleInfo).not.toHaveBeenCalledWith(
      '[useOcrDetect] OCR 성공',
      expect.anything(),
    );
    expect(consoleWarn).toHaveBeenCalledWith(
      '[useOcrDetect] OCR 실패',
      expect.objectContaining({
        page: 1,
        message: 'memory access out of bounds',
      }),
    );
  });

  it('자동 OCR 대상이 없으면 OCR 워커를 생성하지 않는다', async () => {
    fakePdfWorker.inspectPageContent.mockResolvedValue({
      pageIndex: 0,
      pageAreaPt: 10000,
      textCharCount: 500,
      textLineCount: 20,
      textAreaRatio: 0.8,
      imageBlocks: [],
      hasLargeImage: false,
      shouldAutoOcr: false,
    });

    function Probe() {
      useOcrDetect();
      return null;
    }

    useAppStore.getState().setDoc({
      kind: 'ready',
      fileName: 'text.pdf',
      pages: [{ index: 0, widthPt: 100, heightPt: 100, rotation: 0 }],
    });

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });

    await waitForStore(() => fakePdfWorker.inspectPageContent.mock.calls.length > 0);

    expect(getOcrWorker).not.toHaveBeenCalled();
    expect(fakePdfWorker.renderPagePng).not.toHaveBeenCalled();
    expect(useAppStore.getState().ocrProgress.total).toBe(0);
  });
});
