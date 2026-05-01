import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NerWorkerApi } from '@/core/nerWorkerClient';

const captured = vi.hoisted(() => ({
  api: null as unknown,
}));

const moduleOrder = vi.hoisted(() => ({
  transformersSawFilterInstalled: false,
}));

const hf = vi.hoisted(() => {
  type PipelineOptions = { device?: 'webgpu' | 'wasm'; dtype?: 'q4' | 'fp16' | 'fp32' };

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

  const modelFileForDtype = (dtype: PipelineOptions['dtype']): string => {
    if (dtype === 'fp32' || !dtype) return 'model.onnx';
    return `model_${dtype}.onnx`;
  };

  const loadLocalPipeline = async (
    _task: string,
    _model: string,
    opts?: PipelineOptions,
  ) => {
    const config = await env.fetch('/models/privacy-filter/config.json');
    if (config.status !== 200) {
      throw new Error(`config.json fetch failed: ${config.status}`);
    }
    const modelFile = modelFileForDtype(opts?.dtype);
    const weights = await env.fetch(`/models/privacy-filter/onnx/${modelFile}`);
    if (weights.status !== 200) {
      throw new Error(`${modelFile} fetch failed: ${weights.status}`);
    }
    return classifier;
  };

  return {
    env,
    classifier,
    loadLocalPipeline,
    pipeline: vi.fn(loadLocalPipeline),
  };
});

const ortRuntime = vi.hoisted(() => ({
  installWarnFilter: vi.fn(),
  wasmFilePaths: {
    mjs: '/ort/ort-wasm-simd-threaded.asyncify.mjs',
    wasm: '/ort/ort-wasm-simd-threaded.asyncify.wasm',
  },
}));

vi.mock('comlink', () => ({
  expose: vi.fn((api: unknown) => {
    captured.api = api;
  }),
}));

vi.mock('@huggingface/transformers', () => {
  moduleOrder.transformersSawFilterInstalled =
    ortRuntime.installWarnFilter.mock.calls.length > 0;
  return {
    env: hf.env,
    pipeline: hf.pipeline,
  };
});

vi.mock('@/workers/ortRuntimePaths', () => ({
  ORT_WASM_FILE_PATHS: ortRuntime.wasmFilePaths,
  installOrtWarningFilter: ortRuntime.installWarnFilter,
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

function modelDirectory(onnxFiles = ['model_q4.onnx']): FileSystemDirectoryHandle {
  const encoder = new TextEncoder();
  const onnxEntries = Object.fromEntries(
    onnxFiles.map((fileName, index) => [
      fileName,
      new FakeFileHandle(fileName, new Uint8Array([index + 1, index + 2, index + 3])),
    ]),
  );
  return new FakeDirectoryHandle('privacy-filter', {
    'config.json': new FakeFileHandle(
      'config.json',
      encoder.encode(JSON.stringify({ model_type: 'bert' })),
      'application/json',
    ),
    onnx: new FakeDirectoryHandle('onnx', onnxEntries),
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
    hf.env.allowRemoteModels = true;
    hf.env.allowLocalModels = false;
    hf.env.localModelPath = '';
    hf.env.backends.onnx.wasm = {};
    hf.pipeline.mockImplementation(hf.loadLocalPipeline);
    ortRuntime.installWarnFilter.mockClear();
    moduleOrder.transformersSawFilterInstalled = false;
  });

  it('transformers 모듈 평가 전에 ORT warning filter 를 설치한다', async () => {
    await import('@/workers/ner.worker');

    expect(moduleOrder.transformersSawFilterInstalled).toBe(true);
  });

  it('ONNX Runtime 은 같은 asyncify 계열 mjs/wasm 을 /ort 에서 fetch 하도록 설정한다', async () => {
    await import('@/workers/ner.worker');

    expect((hf.env.backends.onnx.wasm as { wasmPaths?: unknown }).wasmPaths).toEqual({
      mjs: '/ort/ort-wasm-simd-threaded.asyncify.mjs',
      wasm: '/ort/ort-wasm-simd-threaded.asyncify.wasm',
    });
    expect((hf.env.backends.onnx.wasm as { numThreads?: unknown }).numThreads).toBe(1);
    expect(ortRuntime.installWarnFilter).toHaveBeenCalled();
  });

  it('q4 모델은 WebGPU backend 로 로드한다', async () => {
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
    expect(hf.pipeline).not.toHaveBeenCalledWith(
      'token-classification',
      'privacy-filter',
      { device: 'wasm', dtype: 'q4' },
    );
  });

  it('WebGPU q4 로드가 실패하면 fp32 모델을 WASM 으로 fallback 한다', async () => {
    await import('@/workers/ner.worker');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    hf.pipeline.mockImplementation(async (task, model, opts) => {
      if (opts?.device === 'webgpu' && opts.dtype === 'q4') {
        throw new Error('WebGPU init failed');
      }
      return hf.loadLocalPipeline(task, model, opts);
    });

    try {
      const result = await exposedApi().load(modelDirectory(['model_q4.onnx', 'model.onnx']));

      expect(result).toEqual({
        backend: 'wasm',
        labelMap: { 0: 'O', 1: 'private_person' },
      });
      expect(hf.pipeline).toHaveBeenCalledWith(
        'token-classification',
        'privacy-filter',
        { device: 'webgpu', dtype: 'q4' },
      );
      expect(hf.pipeline).toHaveBeenCalledWith(
        'token-classification',
        'privacy-filter',
        { device: 'wasm', dtype: 'fp32' },
      );
      expect(warn).toHaveBeenCalledWith(
        '[ner.worker] NER backend 로드 실패',
        expect.objectContaining({ backend: 'webgpu', dtype: 'q4' }),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('q4 모델만 있고 WebGPU 로드가 실패하면 WASM 비호환 원인을 설명한다', async () => {
    await import('@/workers/ner.worker');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    hf.pipeline.mockImplementation(async (_task, _model, opts) => {
      if (opts?.device === 'webgpu' && opts.dtype === 'q4') {
        throw new Error('WebGPU init failed');
      }
      return hf.loadLocalPipeline(_task, _model, opts);
    });

    try {
      await expect(exposedApi().load(modelDirectory())).rejects.toThrow(
        /q4.*GatherBlockQuantized.*WASM.*model\.onnx/s,
      );
      expect(hf.pipeline).toHaveBeenCalledWith(
        'token-classification',
        'privacy-filter',
        { device: 'webgpu', dtype: 'q4' },
      );
      expect(hf.pipeline).not.toHaveBeenCalledWith(
        'token-classification',
        'privacy-filter',
        { device: 'wasm', dtype: 'q4' },
      );
      expect(warn).toHaveBeenCalledWith(
        '[ner.worker] NER backend 로드 실패',
        expect.objectContaining({ backend: 'webgpu', dtype: 'q4' }),
      );
    } finally {
      warn.mockRestore();
    }
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
