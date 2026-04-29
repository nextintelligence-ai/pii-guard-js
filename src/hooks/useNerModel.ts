import { useEffect } from 'react';
import { create } from 'zustand';
import { spawnNerWorker, type NerWorkerApi } from '@/core/nerWorkerClient';
import {
  computeModelHash,
  readModelMeta,
  writeModelMeta,
  NER_MODEL_META_KEY,
  type ModelMeta,
} from '@/core/nerModel';

/**
 * NER 모델 로드 상태 머신.
 *
 * - `idle`        — 초기 상태. 캐시 메타도 없고 워커도 없다.
 * - `loading`     — 로드 중 (캐시 자동 로드 또는 사용자 디렉토리 복사 중).
 * - `ready`       — 워커가 spawn 되고 모델이 메모리에 올라간 상태. `worker` 사용 가능.
 * - `error`       — 캐시 로드 실패 또는 사용자 디렉토리 복사 실패.
 * - `unsupported` — 브라우저에 `showDirectoryPicker` 가 없어 사용자 디렉토리 로드 불가.
 */
export type NerModelState = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';

export interface UseNerModel {
  state: NerModelState;
  meta: ModelMeta | null;
  worker: NerWorkerApi | null;
  loadFromUserDir(): Promise<void>;
  reset(): void;
}

let cachedLoadStarted = false;

export const useNerModelStore = create<UseNerModel>((set, get) => ({
  state: 'idle',
  meta: readModelMeta(),
  worker: null,
  async loadFromUserDir(): Promise<void> {
    const startedAt = performance.now();
    console.info('[useNerModel] 사용자 모델 로드 시작');
    set({ state: 'loading' });
    try {
      const picker = (
        window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }
      ).showDirectoryPicker;
      if (!picker) {
        console.warn('[useNerModel] showDirectoryPicker 미지원 — 모델 폴더를 선택할 수 없습니다.');
        set({ state: 'unsupported' });
        return;
      }
      const dirHandle = await picker.call(window);
      console.info('[useNerModel] 모델 폴더 선택 완료', { name: dirHandle.name });
      const configFile = await dirHandle.getFileHandle('config.json');
      const configBytes = new Uint8Array(await (await configFile.getFile()).arrayBuffer());
      const id = await computeModelHash(configBytes);
      console.info('[useNerModel] 모델 config hash 계산 완료', { id });
      const modelDir = await copyDirToOpfs(dirHandle, id);
      console.info('[useNerModel] 모델 OPFS 복사 완료', { id });
      const w = await spawnNerWorker();
      console.info('[useNerModel] NER worker spawn 완료');
      const { labelMap } = await w.load(modelDir);
      const newMeta: ModelMeta = {
        id,
        modelName: 'openai/privacy-filter',
        loadedAt: Date.now(),
        labelMap,
      };
      const prevWorker = get().worker;
      if (prevWorker && prevWorker !== w) {
        void prevWorker.unload();
      }
      writeModelMeta(newMeta);
      set({ meta: newMeta, worker: w, state: 'ready' });
      console.info('[useNerModel] 사용자 모델 로드 완료', {
        id,
        labels: Object.keys(labelMap).length,
        ms: elapsedMs(startedAt),
      });
    } catch (e) {
      console.error('[useNerModel] loadFromUserDir 실패:', e);
      set({ state: 'error' });
    }
  },
  reset(): void {
    const worker = get().worker;
    void worker?.unload();
    cachedLoadStarted = false;
    set({ worker: null, meta: null, state: 'idle' });
    localStorage.removeItem(NER_MODEL_META_KEY);
  },
}));

export function useNerModel(): UseNerModel {
  const session = useNerModelStore();

  // 첫 마운트 시 캐시 메타가 있으면 자동 로드 시도. OPFS 안에 모델 파일이 살아있음을 가정한다.
  useEffect(() => {
    const cachedMeta = readModelMeta();
    if (!cachedMeta || cachedLoadStarted) return;
    cachedLoadStarted = true;

    void (async () => {
      useNerModelStore.setState({ state: 'loading', meta: cachedMeta });
      const startedAt = performance.now();
      console.info('[useNerModel] 캐시 모델 자동 로드 시작', { id: cachedMeta.id });
      try {
        const modelDir = await getCachedModelDir(cachedMeta.id);
        const w = await spawnNerWorker();
        const { labelMap, backend } = await w.load(modelDir);
        useNerModelStore.setState({ worker: w, state: 'ready' });
        console.log(
          `[useNerModel] 캐시에서 로드 (backend=${backend}, labels=${Object.keys(labelMap).length})`,
        );
        console.info('[useNerModel] 캐시 모델 자동 로드 완료', {
          id: cachedMeta.id,
          backend,
          labels: Object.keys(labelMap).length,
          ms: elapsedMs(startedAt),
        });
      } catch (e) {
        cachedLoadStarted = false;
        console.warn('[useNerModel] 캐시 로드 실패:', e);
        useNerModelStore.setState({ state: 'error', worker: null });
      }
    })();
  }, []);

  return session;
}

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

async function copyDirToOpfs(
  src: FileSystemDirectoryHandle,
  modelId: string,
): Promise<FileSystemDirectoryHandle> {
  const target = await getCachedModelDir(modelId, true);
  await copyRecursive(src, target);
  return target;
}

async function getCachedModelDir(
  modelId: string,
  create = false,
): Promise<FileSystemDirectoryHandle> {
  const opfs = await navigator.storage.getDirectory();
  const models = await opfs.getDirectoryHandle('models', { create: true });
  return models.getDirectoryHandle(modelId, { create });
}

async function copyRecursive(
  src: FileSystemDirectoryHandle,
  dst: FileSystemDirectoryHandle,
): Promise<void> {
  for await (const entry of (
    src as unknown as { values(): AsyncIterable<FileSystemHandle> }
  ).values()) {
    if (entry.kind === 'file') {
      const f = await (entry as FileSystemFileHandle).getFile();
      const wf = await dst.getFileHandle(entry.name, { create: true });
      const writable = await (
        wf as unknown as { createWritable(): Promise<WritableStream> }
      ).createWritable();
      await f.stream().pipeTo(writable as unknown as WritableStream);
    } else if (entry.kind === 'directory') {
      const sub = await dst.getDirectoryHandle(entry.name, { create: true });
      await copyRecursive(entry as FileSystemDirectoryHandle, sub);
    }
  }
}
