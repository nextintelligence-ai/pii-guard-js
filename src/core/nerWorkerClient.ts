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
