import { describe, it, expect, vi } from 'vitest';
import { createNerWorkerClient, type NerWorkerApi } from '@/core/nerWorkerClient';

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
});
