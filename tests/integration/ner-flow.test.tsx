import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNerDetect } from '@/hooks/useNerDetect';
import { useAppStore } from '@/state/store';
import { getPdfWorker } from '@/workers/pdfWorkerClient';
import type { StructuredLine } from '@/core/spanMap';

const { fakeWorker, fakePdfWorker } = vi.hoisted(() => {
  const text = 'My name is Alice Smith';
  const chars = [...text].map((ch, i) => ({
    ch,
    bbox: { x: i * 5, y: 0, w: 5, h: 10 },
  }));
  const lines: StructuredLine[] = [{ id: 0, spans: [{ id: 0, chars }] }];
  return {
    fakeWorker: {
      classify: vi.fn().mockResolvedValue([
        {
          entity_group: 'private_person',
          start: 11,
          end: 22,
          score: 0.99,
          word: 'Alice Smith',
        },
      ]),
      load: vi.fn(),
      unload: vi.fn(),
    },
    fakePdfWorker: {
      extractStructuredText: vi.fn().mockResolvedValue(lines),
    },
  };
});

vi.mock('@/hooks/useNerModel', () => ({
  useNerModel: () => ({
    state: 'ready',
    meta: null,
    worker: fakeWorker,
    loadFromUserDir: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock('@/workers/pdfWorkerClient', () => ({
  getPdfWorker: vi.fn().mockResolvedValue(fakePdfWorker),
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
  resolve(value: T): void;
  reject(reason?: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('NER 플로우 통합', () => {
  let root: Root | null = null;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useAppStore.getState().reset();
    useAppStore.getState().setDoc({
      kind: 'ready',
      fileName: 'sample.pdf',
      pages: [{ index: 0, widthPt: 100, heightPt: 100, rotation: 0 }],
    });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    useAppStore.getState().reset();
  });

  it('영문 페이지에서 mock 워커가 반환한 entity 가 store 의 NER 후보로 들어간다', async () => {
    function Probe() {
      useNerDetect(1, 0);
      return null;
    }

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });

    await waitForStore(() => useAppStore.getState().nerProgress.done === 1);

    const state = useAppStore.getState();
    const candidate = state.candidates.find((c) => c.source === 'ner');
    expect(candidate).toMatchObject({
      pageIndex: 0,
      category: 'private_person',
      confidence: 0.99,
      source: 'ner',
    });
    expect(Object.values(state.boxes)).toHaveLength(1);
    expect(Object.values(state.boxes)[0]).toMatchObject({
      source: 'ner',
      category: 'private_person',
      enabled: false,
      bbox: [55, 0, 110, 10],
    });
  });

  it('페이지 분석 완료 시 콘솔에 진단 로그를 남긴다', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    function Probe() {
      useNerDetect(1, 0);
      return null;
    }

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });

    await waitForStore(() => useAppStore.getState().nerProgress.done === 1);

    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('[useNerDetect] page 0 완료'),
      expect.objectContaining({
        boxes: 1,
        entities: 1,
        chars: 22,
      }),
    );
  });

  it('PDF 워커 문서 오픈 race 로 NO_DOCUMENT_OPEN 이 한 번 나면 재시도한다', async () => {
    fakePdfWorker.extractStructuredText
      .mockRejectedValueOnce(new Error('NO_DOCUMENT_OPEN'))
      .mockResolvedValueOnce([
        {
          id: 0,
          spans: [
            {
              id: 0,
              chars: [...'My name is Alice Smith'].map((ch, i) => ({
                ch,
                bbox: { x: i * 5, y: 0, w: 5, h: 10 },
              })),
            },
          ],
        },
      ]);

    function Probe() {
      useNerDetect(1, 0);
      return null;
    }

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });

    await waitForStore(() => useAppStore.getState().nerProgress.done === 1);

    expect(fakePdfWorker.extractStructuredText).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().candidates.some((c) => c.source === 'ner')).toBe(true);
  });

  it('컴포넌트가 해제된 뒤에는 PDF 텍스트 추출을 시작하지 않는다', async () => {
    const pendingWorker = deferred<typeof fakePdfWorker>();
    vi.mocked(getPdfWorker).mockReturnValueOnce(
      pendingWorker.promise as unknown as ReturnType<typeof getPdfWorker>,
    );

    function Probe() {
      useNerDetect(1, 0);
      return null;
    }

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });
    await act(async () => {
      root?.unmount();
    });
    root = null;

    pendingWorker.resolve(fakePdfWorker);
    await act(async () => {
      await Promise.resolve();
    });

    expect(fakePdfWorker.extractStructuredText).not.toHaveBeenCalled();
  });

  it('연락망 표는 성명 문맥으로 2차 NER 를 수행해 누락된 이름을 보강한다', async () => {
    const tableLines = [
      '분야별',
      '성명',
      '직위',
      '소속',
      '연락처',
      '사업총괄 PM',
      '박종천',
      '대표이사',
      '010-2572-9243',
      '부PM',
      '정지훈',
      '부장',
      '010-4326-2605',
      'AI 엔지니어',
      '박태순',
      '부장',
      '010-6298-9759',
      'AI 개발자',
      '허지우',
      '차장',
      '010-5659-0421',
      'FE 개발자',
      '강인찬',
      '차장',
      '010-7774-3212',
      '클라우드/QA',
      '박세림',
      '대리',
      '010-5092-5633',
    ];
    fakePdfWorker.extractStructuredText.mockResolvedValueOnce(
      tableLines.map((text, lineId) => ({
        id: lineId,
        spans: [
          {
            id: lineId,
            chars: [...text].map((ch, i) => ({
              ch,
              bbox: { x: i * 5, y: lineId * 10, w: 5, h: 10 },
            })),
          },
        ],
      })),
    );
    fakeWorker.classify.mockImplementation(async (text: string) => {
      if (text.startsWith('성명\n')) {
        return [
          {
            entity_group: 'private_person',
            start: text.indexOf('박종천'),
            end: text.indexOf('정지훈') + '정지훈'.length,
            score: 0.93,
            word: '박종천\n정지훈',
          },
          {
            entity_group: 'private_person',
            start: text.indexOf('박태순'),
            end: text.indexOf('박태순') + '박태순'.length,
            score: 0.93,
            word: '박태순',
          },
          {
            entity_group: 'private_person',
            start: text.indexOf('허지우'),
            end: text.indexOf('허지우') + '허지우'.length,
            score: 0.93,
            word: '허지우',
          },
          {
            entity_group: 'private_person',
            start: text.indexOf('강인찬'),
            end: text.indexOf('강인찬') + '강인찬'.length,
            score: 0.99,
            word: '강인찬',
          },
          {
            entity_group: 'private_person',
            start: text.indexOf('박세림'),
            end: text.indexOf('박세림') + '박세림'.length,
            score: 0.98,
            word: '박세림',
          },
        ];
      }
      return [
        {
          entity_group: 'private_person',
          start: text.indexOf('박종천'),
          end: text.indexOf('박종천') + '박종천'.length,
          score: 0.71,
          word: '박종천',
        },
      ];
    });

    function Probe() {
      useNerDetect(1, 0);
      return null;
    }

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });

    await waitForStore(() => useAppStore.getState().nerProgress.done === 1);

    const nerBoxes = Object.values(useAppStore.getState().boxes).filter(
      (box) => box.source === 'ner' && box.category === 'private_person',
    );
    expect(fakeWorker.classify).toHaveBeenCalledTimes(2);
    expect(nerBoxes).toHaveLength(6);
  });

  it('성/명 라벨이 줄바꿈으로 쪼개진 증명서는 성명 문맥으로 이름을 보강한다', async () => {
    const certificateLines = [
      '구',
      '분',
      '신청대상자',
      '성',
      '명',
      '황선영',
      '주민등록번호',
      '801026-2221311',
    ];
    fakePdfWorker.extractStructuredText.mockResolvedValueOnce(
      certificateLines.map((text, lineId) => ({
        id: lineId,
        spans: [
          {
            id: lineId,
            chars: [...text].map((ch, i) => ({
              ch,
              bbox: { x: i * 5, y: lineId * 10, w: 5, h: 10 },
            })),
          },
        ],
      })),
    );
    fakeWorker.classify.mockImplementation(async (text: string) => {
      if (text === '성명 황선영') {
        return [
          {
            entity_group: 'private_person',
            start: 0,
            end: text.length,
            score: 0.97,
            word: '성명 황선영',
          },
        ];
      }
      return [];
    });

    function Probe() {
      useNerDetect(1, 0);
      return null;
    }

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });

    await waitForStore(() => useAppStore.getState().nerProgress.done === 1);

    const nerBoxes = Object.values(useAppStore.getState().boxes).filter(
      (box) => box.source === 'ner' && box.category === 'private_person',
    );
    expect(fakeWorker.classify).toHaveBeenCalledTimes(2);
    expect(nerBoxes).toHaveLength(1);
    expect(nerBoxes[0]?.bbox).toEqual([0, 50, 15, 60]);
  });

  it('소득자 성명 다음 줄 이름은 한 줄 문맥으로 재구성해 보강한다', async () => {
    const certificateLines = [
      '소득자 성명',
      '박태순',
      '주민등록번호',
      '801129-1031511',
    ];
    fakePdfWorker.extractStructuredText.mockResolvedValueOnce(
      certificateLines.map((text, lineId) => ({
        id: lineId,
        spans: [
          {
            id: lineId,
            chars: [...text].map((ch, i) => ({
              ch,
              bbox: { x: i * 5, y: lineId * 10, w: 5, h: 10 },
            })),
          },
        ],
      })),
    );
    fakeWorker.classify.mockImplementation(async (text: string) => {
      if (text === '소득자 성명 박태순') {
        return [
          {
            entity_group: 'private_person',
            start: text.indexOf('박태순'),
            end: text.indexOf('박태순') + '박태순'.length,
            score: 0.97,
            word: ' 박태순',
          },
        ];
      }
      return [];
    });

    function Probe() {
      useNerDetect(1, 0);
      return null;
    }

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });

    await waitForStore(() => useAppStore.getState().nerProgress.done === 1);

    const nerBoxes = Object.values(useAppStore.getState().boxes).filter(
      (box) => box.source === 'ner' && box.category === 'private_person',
    );
    expect(fakeWorker.classify).toHaveBeenCalledTimes(2);
    expect(nerBoxes).toHaveLength(1);
    expect(nerBoxes[0]?.bbox).toEqual([0, 10, 15, 20]);
  });

  it('번호가 붙은 성명 라벨과 제출자 서명란 이름을 문맥 NER 로 보강한다', async () => {
    const certificateLines = [
      '① 성 명',
      '박태순',
      '② 주민등록번호',
      '801129-1031511',
      '제출자',
      '박태순  (서명 또는 인)',
      '세무서장',
    ];
    fakePdfWorker.extractStructuredText.mockResolvedValueOnce(
      certificateLines.map((text, lineId) => ({
        id: lineId,
        spans: [
          {
            id: lineId,
            chars: [...text].map((ch, i) => ({
              ch,
              bbox: { x: i * 5, y: lineId * 10, w: 5, h: 10 },
            })),
          },
        ],
      })),
    );
    fakeWorker.classify.mockImplementation(async (text: string) => {
      if (text === '① 성 명 박태순') {
        return [
          {
            entity_group: 'private_person',
            start: 0,
            end: text.length,
            score: 0.91,
            word: ' 성 명 박태순',
          },
        ];
      }
      if (text === '제출자 박태순  (서명 또는 인)') {
        return [
          {
            entity_group: 'private_person',
            start: 0,
            end: text.length,
            score: 0.99,
            word: ' 박태순  (서명 또는 인)',
          },
        ];
      }
      return [];
    });

    function Probe() {
      useNerDetect(1, 0);
      return null;
    }

    root = createRoot(document.createElement('div'));
    await act(async () => {
      root?.render(<Probe />);
    });

    await waitForStore(() => useAppStore.getState().nerProgress.done === 1);

    const nerBoxes = Object.values(useAppStore.getState().boxes)
      .filter((box) => box.source === 'ner' && box.category === 'private_person')
      .sort((a, b) => a.bbox[1] - b.bbox[1]);
    expect(fakeWorker.classify).toHaveBeenCalledTimes(3);
    expect(nerBoxes).toHaveLength(2);
    expect(nerBoxes[0]?.bbox).toEqual([0, 10, 15, 20]);
    expect(nerBoxes[1]?.bbox).toEqual([0, 50, 15, 60]);
  });
});
