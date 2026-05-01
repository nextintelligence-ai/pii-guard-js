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

  it('tries a rotated image and maps OCR polygons back when the original image has no text', async () => {
    paddle.predict
      .mockResolvedValueOnce([{ items: [] }])
      .mockResolvedValueOnce([
        {
          items: [
            {
              text: '010-1234-5678',
              score: 0.91,
              poly: [
                [10, 20],
                [30, 20],
                [30, 40],
                [10, 40],
              ],
            },
          ],
          runtime: { requestedBackend: 'auto' },
        },
      ]);

    const bitmap = { width: 100, height: 60, close: vi.fn() };
    const context = {
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
    };
    class MockOffscreenCanvas {
      constructor(
        public width: number,
        public height: number,
      ) {}

      getContext(type: string) {
        return type === '2d' ? context : null;
      }

      async convertToBlob() {
        return new Blob([new Uint8Array([9, 8, 7])], { type: 'image/png' });
      }
    }

    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
    vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);

    try {
      await import('@/workers/ocr.worker');

      await expect(
        exposedApi().recognizePng({
          pageIndex: 0,
          png: new Uint8Array([1, 2, 3]),
        }),
      ).resolves.toMatchObject({
        lines: [
          {
            text: '010-1234-5678',
            poly: [
              { x: 20, y: 50 },
              { x: 20, y: 30 },
              { x: 40, y: 30 },
              { x: 40, y: 50 },
            ],
          },
        ],
        runtime: expect.objectContaining({
          rotationApplied: 90,
        }),
      });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(paddle.predict).toHaveBeenCalledTimes(2);
    expect(context.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('probes rotations when the original OCR result is only weakly acceptable', async () => {
    paddle.predict
      .mockResolvedValueOnce([
        {
          items: [
            {
              text: 'O1O-I234-5678',
              score: 0.45,
              poly: [
                [0, 0],
                [100, 0],
                [100, 20],
                [0, 20],
              ],
            },
          ],
          runtime: { requestedBackend: 'auto' },
        },
      ])
      .mockResolvedValueOnce([
        {
          items: [
            {
              text: '010-1234-5678',
              score: 0.93,
              poly: [
                [10, 20],
                [30, 20],
                [30, 40],
                [10, 40],
              ],
            },
          ],
          runtime: { requestedBackend: 'auto' },
        },
      ]);

    const bitmap = { width: 100, height: 60, close: vi.fn() };
    const context = {
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
    };
    class MockOffscreenCanvas {
      constructor(
        public width: number,
        public height: number,
      ) {}

      getContext(type: string) {
        return type === '2d' ? context : null;
      }

      async convertToBlob() {
        return new Blob([new Uint8Array([9, 8, 7])], { type: 'image/png' });
      }
    }

    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
    vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);

    try {
      await import('@/workers/ocr.worker');

      await expect(
        exposedApi().recognizePng({
          pageIndex: 2,
          png: new Uint8Array([1, 2, 3]),
        }),
      ).resolves.toMatchObject({
        lines: [{ text: '010-1234-5678' }],
        runtime: expect.objectContaining({
          rotationApplied: 90,
          rotationDiagnostics: expect.objectContaining({
            pageIndex: 2,
            selectedRotation: 90,
            candidates: [
              expect.objectContaining({ rotation: 0 }),
              expect.objectContaining({ rotation: 90 }),
            ],
          }),
        }),
      });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(paddle.predict).toHaveBeenCalledTimes(2);
    expect(context.rotate).toHaveBeenCalledWith(Math.PI / 2);
  });
});
