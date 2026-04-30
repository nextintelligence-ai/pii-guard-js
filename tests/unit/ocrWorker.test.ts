import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OcrWorkerApi } from '@/workers/ocr.worker.types';

const captured = vi.hoisted(() => ({
  api: null as unknown,
}));

const paddle = vi.hoisted(() => ({
  predict: vi.fn(),
  dispose: vi.fn(),
  create: vi.fn(async () => ({
    predict: paddle.predict,
    dispose: paddle.dispose,
  })),
}));

const ort = vi.hoisted(() => ({
  env: { logLevel: 'warning' as 'warning' | 'error' },
}));

vi.mock('comlink', () => ({
  expose: vi.fn((api: unknown) => {
    captured.api = api;
  }),
}));

vi.mock('onnxruntime-common', () => ({
  env: ort.env,
}));

vi.mock('@paddleocr/paddleocr-js', () => ({
  PaddleOCR: {
    create: paddle.create,
  },
}));

function exposedApi(): OcrWorkerApi {
  if (!captured.api) throw new Error('OCR worker API was not exposed');
  return captured.api as OcrWorkerApi;
}

describe('ocr.worker', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    captured.api = null;
    ort.env.logLevel = 'warning';
    paddle.predict.mockResolvedValue([
      {
        items: [],
      },
    ]);
  });

  it('uses PaddleOCR own ONNX Runtime dist prefix in dev so worker mode loads matching runtime files', async () => {
    await import('@/workers/ocr.worker');

    await exposedApi().warmup('wasm');

    expect(paddle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ortOptions: expect.objectContaining({
          backend: 'wasm',
          wasmPaths: '/node_modules/@paddleocr/paddleocr-js/node_modules/onnxruntime-web/dist/',
        }),
      }),
    );
  });

  it('suppresses noisy ONNX Runtime graph partition warnings without importing the app-level ORT package', async () => {
    await import('@/workers/ocr.worker');

    await exposedApi().warmup('auto');

    expect(ort.env.logLevel).toBe('warning');
    expect(paddle.create).toHaveBeenCalled();
  });

  it('defaults to the WebGPU-capable auto backend', async () => {
    await import('@/workers/ocr.worker');

    await exposedApi().warmup();

    expect(paddle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ortOptions: expect.objectContaining({
          backend: 'auto',
        }),
      }),
    );
  });

  it('runs PaddleOCR in worker mode with an explicit same-origin worker asset', async () => {
    await import('@/workers/ocr.worker');

    await exposedApi().warmup();

    const [options] = paddle.create.mock.calls[0] as unknown as [
      { worker?: { createWorker?: () => Worker } },
    ];
    expect(options.worker?.createWorker).toEqual(expect.any(Function));

    const RealWorker = globalThis.Worker;
    const WorkerCtor = vi.fn(function MockWorker(this: unknown) {});
    vi.stubGlobal('Worker', WorkerCtor);
    try {
      options.worker?.createWorker?.();
      expect(WorkerCtor).toHaveBeenCalledWith('/paddleocr/worker-entry.js', {
        type: 'module',
      });
    } finally {
      vi.stubGlobal('Worker', RealWorker);
    }
  });

  it('passes only the active PNG byte range to PaddleOCR', async () => {
    await import('@/workers/ocr.worker');

    const realBlob = globalThis.Blob;
    let blobParts: BlobPart[] = [];
    class CapturingBlob {
      constructor(parts: BlobPart[]) {
        blobParts = parts;
      }
    }
    vi.stubGlobal('Blob', CapturingBlob);

    const backing = new Uint8Array([99, 88, 1, 2, 3, 77]);
    try {
      await exposedApi().recognizePng({
        pageIndex: 0,
        png: backing.subarray(2, 5),
      });

      expect(blobParts).toHaveLength(1);
      const actualBytes =
        blobParts[0] instanceof Uint8Array
          ? Array.from(blobParts[0])
          : Array.from(new Uint8Array(blobParts[0] as ArrayBuffer));
      expect(actualBytes).toEqual([1, 2, 3]);
    } finally {
      vi.stubGlobal('Blob', realBlob);
    }
  });

  it('treats empty OCR output as a successful page with no lines', async () => {
    paddle.predict.mockResolvedValueOnce([]);

    await import('@/workers/ocr.worker');

    await expect(
      exposedApi().recognizePng({
        pageIndex: 3,
        png: new Uint8Array([1, 2, 3]),
      }),
    ).resolves.toEqual({ lines: [] });
  });

  it('falls back to wasm when the WebGPU-capable path fails with wasm memory bounds', async () => {
    const autoDispose = vi.fn();
    const wasmPredict = vi.fn().mockResolvedValueOnce([
      {
        items: [
          {
            text: '010-1234-5678',
            score: 0.9,
            poly: [
              [0, 0],
              [100, 0],
              [100, 20],
              [0, 20],
            ],
          },
        ],
      },
    ]);
    paddle.create
      .mockResolvedValueOnce({
        predict: vi.fn().mockRejectedValueOnce(new Error('memory access out of bounds')),
        dispose: autoDispose,
      })
      .mockResolvedValueOnce({
        predict: wasmPredict,
        dispose: vi.fn(),
      });

    await import('@/workers/ocr.worker');

    await expect(
      exposedApi().recognizePng({
        pageIndex: 0,
        png: new Uint8Array([1, 2, 3]),
      }),
    ).resolves.toMatchObject({
      lines: [{ text: '010-1234-5678' }],
    });
    expect(autoDispose).toHaveBeenCalled();
    expect(paddle.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        ortOptions: expect.objectContaining({ backend: 'wasm' }),
      }),
    );
  });

  it('evicts a rejected engine promise before falling back to wasm', async () => {
    const wasmPredict = vi.fn().mockResolvedValueOnce([
      {
        items: [
          {
            text: '홍길동',
            score: 0.92,
            poly: [
              [0, 0],
              [60, 0],
              [60, 20],
              [0, 20],
            ],
          },
        ],
      },
    ]);
    paddle.create
      .mockRejectedValueOnce(new Error('memory access out of bounds'))
      .mockResolvedValueOnce({
        predict: wasmPredict,
        dispose: vi.fn(),
      });

    await import('@/workers/ocr.worker');

    await expect(
      exposedApi().recognizePng({
        pageIndex: 0,
        png: new Uint8Array([1, 2, 3]),
      }),
    ).resolves.toMatchObject({
      lines: [{ text: '홍길동' }],
    });
    expect(paddle.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        ortOptions: expect.objectContaining({ backend: 'wasm' }),
      }),
    );
  });
});
