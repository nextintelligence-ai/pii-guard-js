import { wrap, type Remote } from 'comlink';
import NerWorker from '@/workers/ner.worker.ts?worker&inline';

export interface Entity {
  entity_group: string;
  start: number;
  end: number;
  score: number;
  word: string;
}

export interface NerWorkerApi {
  load(modelHandle: FileSystemDirectoryHandle | ArrayBuffer): Promise<{
    labelMap: Record<number, string>;
    backend: 'webgpu' | 'wasm';
  }>;
  classify(text: string): Promise<Entity[]>;
  unload(): Promise<void>;
}

export function createNerWorkerClient(api: NerWorkerApi): NerWorkerApi {
  return api;
}

/**
 * 실 NER 워커를 spawn 하고 Comlink Remote 를 반환한다.
 *
 * mupdf 워커와 달리 init-wasm 핸드셰이크가 필요 없다 — 모델 로드는 클라이언트가 명시적으로
 * `api.load(...)` 를 호출할 때 워커 안의 `pipeline()` 이 처리한다. 따라서 spawn 자체는
 * 동기적으로 완료되고, 모델 로드 비용은 호출자가 통제한다.
 *
 * Vite `?worker&inline` ESM 워커 — file:// 빌드 산출과 호환.
 */
export async function spawnNerWorker(): Promise<NerWorkerApi> {
  const worker = new NerWorker();
  const remote = wrap<NerWorkerApi>(worker);
  return {
    load: (h) => remote.load(h),
    classify: (t) => remote.classify(t),
    unload: () => remote.unload(),
  };
}

// Comlink Remote 의 타입을 외부에 노출할 필요가 있을 때를 대비해 type-only re-export.
export type { Remote };
