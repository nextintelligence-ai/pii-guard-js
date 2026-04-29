import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeModelHash,
  readModelMeta,
  writeModelMeta,
  NER_MODEL_META_KEY,
  type ModelMeta,
} from '@/core/nerModel';

describe('nerModel.computeModelHash', () => {
  it('동일한 config.json 입력은 동일한 hash 를 반환한다', async () => {
    const a = new TextEncoder().encode('{"hidden_size": 256}');
    const b = new TextEncoder().encode('{"hidden_size": 256}');
    expect(await computeModelHash(a)).toBe(await computeModelHash(b));
  });

  it('config.json 이 다르면 hash 가 다르다', async () => {
    const a = new TextEncoder().encode('{"hidden_size": 256}');
    const b = new TextEncoder().encode('{"hidden_size": 128}');
    expect(await computeModelHash(a)).not.toBe(await computeModelHash(b));
  });

  it('hash 는 64자 lowercase hex 문자열이다', async () => {
    const a = new TextEncoder().encode('{}');
    const hash = await computeModelHash(a);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('nerModel.readModelMeta / writeModelMeta', () => {
  beforeEach(() => {
    localStorage.removeItem(NER_MODEL_META_KEY);
  });

  it('write 후 read 가 동일 객체를 반환한다', () => {
    const meta: ModelMeta = {
      id: 'abc',
      modelName: 'openai/privacy-filter',
      loadedAt: 1700000000000,
      labelMap: { 0: 'O', 1: 'B-PER' },
    };
    writeModelMeta(meta);
    expect(readModelMeta()).toEqual(meta);
  });

  it('저장된 메타가 없으면 null 을 반환한다', () => {
    expect(readModelMeta()).toBeNull();
  });

  it('손상된 JSON 이 저장돼 있어도 throw 하지 않고 null 을 반환한다', () => {
    localStorage.setItem(NER_MODEL_META_KEY, '{not-json');
    expect(readModelMeta()).toBeNull();
  });
});
