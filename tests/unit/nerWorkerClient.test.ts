import { describe, it, expect, vi } from 'vitest';
import {
  createNerWorkerClient,
  spawnNerWorker,
  type NerWorkerApi,
} from '@/core/nerWorkerClient';

const workerHarness = vi.hoisted(() => {
  const instances: Array<EventTarget & { terminate: ReturnType<typeof vi.fn> }> = [];
  const remote: NerWorkerApi = {
    load: vi.fn().mockResolvedValue({ labelMap: { 0: 'O' }, backend: 'wasm' }),
    classify: vi.fn().mockResolvedValue([]),
    unload: vi.fn().mockResolvedValue(undefined),
  };

  class FakeWorker extends EventTarget {
    readonly terminate = vi.fn();

    constructor() {
      super();
      instances.push(this);
    }
  }

  return {
    FakeWorker,
    instances,
    remote,
    wrap: vi.fn(() => remote),
  };
});

vi.mock('@/workers/ner.worker.ts?worker', () => ({
  default: workerHarness.FakeWorker,
}));

vi.mock('comlink', () => ({
  wrap: workerHarness.wrap,
}));

describe('nerWorkerClient', () => {
  it('classify 호출이 워커의 classify 로 전달된다', async () => {
    const fakeApi: NerWorkerApi = {
      load: vi.fn().mockResolvedValue({ labelMap: { 0: 'O' }, backend: 'wasm' }),
      classify: vi.fn().mockResolvedValue([
        { entity_group: 'private_person', start: 0, end: 5, score: 0.99, word: 'Alice' },
      ]),
      unload: vi.fn().mockResolvedValue(undefined),
    };
    const client = createNerWorkerClient(fakeApi);
    const out = await client.classify('hello');
    expect(out[0].entity_group).toBe('private_person');
    expect(fakeApi.classify).toHaveBeenCalledWith('hello');
  });

  it('spawnNerWorker 는 worker ready 신호를 받은 뒤 remote 를 반환한다', async () => {
    const promise = spawnNerWorker();
    const worker = workerHarness.instances.at(-1);
    expect(worker).toBeDefined();
    expect(workerHarness.wrap).not.toHaveBeenCalled();

    worker!.dispatchEvent(new MessageEvent('message', { data: 'ner-worker-ready' }));

    const client = await promise;
    expect(workerHarness.wrap).toHaveBeenCalledWith(worker);
    await client.classify('hello');
    expect(workerHarness.remote.classify).toHaveBeenCalledWith('hello');
  });

  it('worker 로그 메시지를 메인 콘솔로 전달한다', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const promise = spawnNerWorker();
    const worker = workerHarness.instances.at(-1)!;

    worker.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'ner-worker-log',
          level: 'info',
          args: ['[ner.worker] worker module ready'],
        },
      }),
    );
    worker.dispatchEvent(new MessageEvent('message', { data: 'ner-worker-ready' }));
    await promise;

    expect(info).toHaveBeenCalledWith('[ner.worker] worker module ready');
    info.mockRestore();
  });

  it('worker init error 에 message 가 없어도 unknown 대신 구조화 로그를 남긴다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const promise = spawnNerWorker();
    const worker = workerHarness.instances.at(-1)!;

    worker.dispatchEvent(new ErrorEvent('error'));

    await expect(promise).rejects.toThrow('ner.worker init error: unknown worker error');
    expect(error).toHaveBeenCalledWith(
      '[nerWorkerClient] NER worker 초기화 실패',
      expect.objectContaining({
        type: 'error',
        message: 'unknown worker error',
      }),
    );
    error.mockRestore();
  });
});
