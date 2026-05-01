import { act } from 'react';
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNerModel, useNerModelStore, type UseNerModel } from '@/hooks/useNerModel';
import type { NerWorkerApi } from '@/core/nerWorkerClient';
import { NER_MODEL_META_KEY, type ModelMeta } from '@/core/nerModel';

const { fakeWorker } = vi.hoisted(() => ({
  fakeWorker: {
    load: vi.fn().mockResolvedValue({ labelMap: { 0: 'O' }, backend: 'wasm' }),
    classify: vi.fn().mockResolvedValue([]),
    unload: vi.fn().mockResolvedValue(undefined),
  } satisfies NerWorkerApi,
}));

vi.mock('@/core/nerWorkerClient', () => ({
  spawnNerWorker: vi.fn().mockResolvedValue(fakeWorker),
}));

class FakeFileHandle {
  readonly kind = 'file';
  constructor(readonly name: string) {}

  async getFile(): Promise<File> {
    const bytes = new TextEncoder().encode('{"model_type":"bert"}');
    return {
      name: this.name,
      arrayBuffer: async () => bytes.buffer.slice(0),
      stream: () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
    } as unknown as File;
  }

  async createWritable(): Promise<WritableStream<Uint8Array>> {
    return new WritableStream<Uint8Array>();
  }
}

class FakeDirectoryHandle {
  readonly kind = 'directory';
  readonly name = 'privacy-filter';
  private readonly config = new FakeFileHandle('config.json');

  async getFileHandle(): Promise<FakeFileHandle> {
    return this.config;
  }

  async getDirectoryHandle(): Promise<FakeDirectoryHandle> {
    return this;
  }

  async *values(): AsyncIterable<FakeFileHandle> {
    yield this.config;
  }
}

function requireSession(session: UseNerModel | null): UseNerModel {
  if (!session) throw new Error('useNerModel session was not captured');
  return session;
}

describe('useNerModel', () => {
  let root: Root | null = null;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    localStorage.clear();
    vi.clearAllMocks();
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: vi.fn().mockResolvedValue(new FakeDirectoryHandle()),
    });
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        getDirectory: vi.fn().mockResolvedValue(new FakeDirectoryHandle()),
      },
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    useNerModelStore.getState().reset();
    root = null;
  });

  it('동일 화면의 여러 hook 인스턴스가 모델 로드 상태를 공유한다', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    let first: UseNerModel | null = null;
    let second: UseNerModel | null = null;

    function Probe() {
      first = useNerModel();
      second = useNerModel();
      return null;
    }

    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root?.render(<Probe />);
    });

    expect(requireSession(first).state).toBe('idle');
    expect(requireSession(second).state).toBe('idle');

    await act(async () => {
      await requireSession(first).loadFromUserDir();
    });

    expect(requireSession(first).state).toBe('ready');
    expect(requireSession(second).state).toBe('ready');
    expect(info).toHaveBeenCalledWith(
      '[useNerModel] NER worker 모델 로드 호출 시작',
      expect.objectContaining({ id: expect.any(String) }),
    );
    expect(fakeWorker.load).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'directory' }),
    );
  });

  it('캐시된 모델이 없으면 수동 로드가 필요하다는 로그를 한 번 남긴다', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    function Probe() {
      useNerModel();
      return null;
    }

    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root?.render(<Probe />);
    });

    expect(info).toHaveBeenCalledWith(
      '[useNerModel] 캐시 모델 없음 — NER 모델 로드 버튼으로 모델 폴더를 선택해야 합니다.',
    );
  });

  it('StrictMode 의 첫 effect cleanup 이후에도 캐시 자동 로드를 ready 로 완료한다', async () => {
    const cachedMeta: ModelMeta = {
      id: 'cached-model',
      modelName: 'openai/privacy-filter',
      loadedAt: Date.now(),
      labelMap: { 0: 'O' },
    };
    localStorage.setItem(NER_MODEL_META_KEY, JSON.stringify(cachedMeta));
    let session: UseNerModel | null = null;

    function Probe() {
      session = useNerModel();
      return null;
    }

    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <StrictMode>
          <Probe />
        </StrictMode>,
      );
    });

    for (let i = 0; i < 20 && requireSession(session).state !== 'ready'; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    expect(requireSession(session).state).toBe('ready');
    expect(fakeWorker.load).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'directory' }),
    );
  });
});
