import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NerWorkerApi } from '@/core/nerWorkerClient';

const captured = vi.hoisted(() => ({
  api: null as unknown,
}));

const hf = vi.hoisted(() => {
  const fallbackFetch = async (
    _input: RequestInfo | URL,
    _init?: RequestInit,
  ): Promise<Response> => new Response(null, { status: 418 });

  const env = {
    allowRemoteModels: true,
    allowLocalModels: false,
    localModelPath: '',
    fetch: vi.fn(fallbackFetch),
    backends: { onnx: { wasm: {} } },
  };

  const classifier = Object.assign(vi.fn().mockResolvedValue([]), {
    model: {
      config: {
        id2label: { 0: 'O', 1: 'private_person' },
      },
    },
  });

  return {
    env,
    classifier,
    pipeline: vi.fn(async () => {
      const config = await env.fetch('/models/privacy-filter/config.json');
      if (config.status !== 200) {
        throw new Error(`config.json fetch failed: ${config.status}`);
      }
      const weights = await env.fetch('/models/privacy-filter/onnx/model_q4.onnx');
      if (weights.status !== 200) {
        throw new Error(`model_q4.onnx fetch failed: ${weights.status}`);
      }
      return classifier;
    }),
  };
});

vi.mock('comlink', () => ({
  expose: vi.fn((api: unknown) => {
    captured.api = api;
  }),
}));

vi.mock('@huggingface/transformers', () => ({
  env: hf.env,
  pipeline: hf.pipeline,
}));

class FakeFileHandle {
  readonly kind = 'file';

  constructor(
    readonly name: string,
    private readonly bytes: Uint8Array,
    private readonly type = 'application/octet-stream',
  ) {}

  async getFile(): Promise<File> {
    const bytes = this.bytes;
    return {
      name: this.name,
      size: bytes.byteLength,
      type: this.type,
      stream: () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
    } as unknown as File;
  }
}

class FakeDirectoryHandle {
  readonly kind = 'directory';

  constructor(
    readonly name: string,
    private readonly entries: Record<string, FakeDirectoryHandle | FakeFileHandle>,
  ) {}

  async getFileHandle(name: string): Promise<FakeFileHandle> {
    const entry = this.entries[name];
    if (entry instanceof FakeFileHandle) return entry;
    throw new DOMException(`파일을 찾을 수 없습니다: ${name}`, 'NotFoundError');
  }

  async getDirectoryHandle(name: string): Promise<FakeDirectoryHandle> {
    const entry = this.entries[name];
    if (entry instanceof FakeDirectoryHandle) return entry;
    throw new DOMException(`디렉토리를 찾을 수 없습니다: ${name}`, 'NotFoundError');
  }
}

function modelDirectory(): FileSystemDirectoryHandle {
  const encoder = new TextEncoder();
  return new FakeDirectoryHandle('privacy-filter', {
    'config.json': new FakeFileHandle(
      'config.json',
      encoder.encode(JSON.stringify({ model_type: 'bert' })),
      'application/json',
    ),
    onnx: new FakeDirectoryHandle('onnx', {
      'model_q4.onnx': new FakeFileHandle(
        'model_q4.onnx',
        new Uint8Array([1, 2, 3]),
      ),
    }),
  }) as unknown as FileSystemDirectoryHandle;
}

function exposedApi(): NerWorkerApi {
  if (!captured.api) throw new Error('NER worker API was not exposed');
  return captured.api as NerWorkerApi;
}

describe('ner.worker', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    captured.api = null;
  });

  it('선택한 모델 디렉토리 handle 로 transformers 로컬 fetch 를 해소한다', async () => {
    await import('@/workers/ner.worker');

    const result = await exposedApi().load(modelDirectory());

    expect(result).toEqual({
      backend: 'webgpu',
      labelMap: { 0: 'O', 1: 'private_person' },
    });
    expect(hf.pipeline).toHaveBeenCalledWith(
      'token-classification',
      'privacy-filter',
      { device: 'webgpu', dtype: 'q4' },
    );
  });

  it('transformers 출력에 char offset 이 없으면 word 로 start/end 를 보강한다', async () => {
    await import('@/workers/ner.worker');

    await exposedApi().load(modelDirectory());
    hf.classifier.mockResolvedValueOnce([
      {
        entity_group: 'private_person',
        score: 0.99,
        word: ' Alice Smith',
      },
    ]);

    const out = await exposedApi().classify('My name is Alice Smith.');

    expect(out).toEqual([
      {
        entity_group: 'private_person',
        score: 0.99,
        word: ' Alice Smith',
        start: 11,
        end: 22,
      },
    ]);
  });

  it('PDF 줄바꿈과 모델 word 공백이 달라도 char offset 을 복원한다', async () => {
    await import('@/workers/ner.worker');

    await exposedApi().load(modelDirectory());
    hf.classifier.mockResolvedValueOnce([
      {
        entity_group: 'private_address',
        score: 0.97,
        word: '서울특별시 강남구',
      },
    ]);

    const out = await exposedApi().classify('주소: 서울특별시\n강남구 역삼동');

    expect(out).toEqual([
      {
        entity_group: 'private_address',
        score: 0.97,
        word: '서울특별시 강남구',
        start: 4,
        end: 13,
      },
    ]);
  });

  it('복원할 수 없는 entity 는 경고 스택 없이 정보 로그로만 집계한다', async () => {
    await import('@/workers/ner.worker');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await exposedApi().load(modelDirectory());
    hf.classifier.mockResolvedValueOnce([
      {
        entity_group: 'private_person',
        score: 0.99,
        word: '문서에없는문자열',
      },
    ]);

    const out = await exposedApi().classify('문서 본문');

    expect(out).toEqual([]);
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining('char offset 을 복원하지 못한 entity'),
      expect.anything(),
    );
    expect(info).toHaveBeenCalledWith(
      '[ner.worker] char offset 을 복원하지 못한 entity 가 있습니다.',
      expect.objectContaining({ skippedWithoutOffsets: 1 }),
    );
  });
});
