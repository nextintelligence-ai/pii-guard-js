import * as Comlink from 'comlink';
import { pipeline } from '@huggingface/transformers';
import type { NerWorkerApi, Entity } from '@/core/nerWorkerClient';
import { configureWorkerEnv } from './nerEnv';

configureWorkerEnv();

let classifier: ((text: string, opts: { aggregation_strategy: 'simple' }) => Promise<Entity[]>) | null = null;
let labelMap: Record<number, string> = {};
let backend: 'webgpu' | 'wasm' = 'wasm';

async function tryLoad(device: 'webgpu' | 'wasm') {
  const pipe = await pipeline('token-classification', 'privacy-filter', {
    device,
    dtype: 'q4',
  } as never);
  return pipe;
}

const api: NerWorkerApi = {
  async load() {
    let pipe;
    try {
      pipe = await tryLoad('webgpu');
      backend = 'webgpu';
    } catch (e) {
      console.warn('[ner.worker] WebGPU 실패, WASM 폴백:', e);
      pipe = await tryLoad('wasm');
      backend = 'wasm';
    }
    classifier = pipe as never;
    const cfg = (pipe as unknown as { model: { config: { id2label?: Record<number, string> } } }).model
      .config;
    labelMap = cfg.id2label ?? {};
    return { labelMap, backend };
  },
  async classify(text: string): Promise<Entity[]> {
    if (!classifier) throw new Error('classifier not loaded');
    const SCORE_FLOOR = 0.5;
    const out = await classifier(text, { aggregation_strategy: 'simple' });
    return out.filter((e) => e.score >= SCORE_FLOOR);
  },
  async unload() {
    classifier = null;
    labelMap = {};
  },
};

Comlink.expose(api);
