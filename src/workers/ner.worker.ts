import * as Comlink from 'comlink';
import type { NerWorkerApi, Entity } from '@/core/nerWorkerClient';

const api: NerWorkerApi = {
  async load() {
    throw new Error('not implemented yet');
  },
  async classify(): Promise<Entity[]> {
    throw new Error('not implemented yet');
  },
  async unload() {
    // no-op
  },
};

Comlink.expose(api);
