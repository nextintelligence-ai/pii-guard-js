import { beforeEach, describe, expect, it, vi } from 'vitest';

const wrap = vi.fn((worker: unknown) => ({ worker }));
const WorkerCtor = vi.fn(function MockWorker(this: unknown) {});

vi.mock('comlink', () => ({ wrap }));
vi.mock('@/workers/ocr.worker.ts?worker', () => ({ default: WorkerCtor }));

describe('getOcrWorker', () => {
  beforeEach(() => {
    vi.resetModules();
    wrap.mockClear();
    WorkerCtor.mockClear();
  });

  it('creates and caches a single OCR worker remote', async () => {
    const { getOcrWorker } = await import('@/workers/ocrWorkerClient');
    const first = getOcrWorker();
    const second = getOcrWorker();

    expect(first).toBe(second);
    expect(WorkerCtor).toHaveBeenCalledTimes(1);
    expect(wrap).toHaveBeenCalledTimes(1);
  });
});
