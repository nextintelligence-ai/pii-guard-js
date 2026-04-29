import { useCallback, useEffect, useState } from 'react';
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

interface UseNerModel {
  state: NerModelState;
  meta: ModelMeta | null;
  worker: NerWorkerApi | null;
  loadFromUserDir(): Promise<void>;
  reset(): void;
}

export function useNerModel(): UseNerModel {
  const [state, setState] = useState<NerModelState>('idle');
  const [meta, setMeta] = useState<ModelMeta | null>(() => readModelMeta());
  const [worker, setWorker] = useState<NerWorkerApi | null>(null);

  // 첫 마운트 시 캐시 메타가 있으면 자동 로드 시도. OPFS 안에 모델 파일이 살아있음을 가정한다.
  // unmount race 방지를 위해 cancelled flag 로 cleanup 처리.
  useEffect(() => {
    let cancelled = false;
    const cachedMeta = readModelMeta();
    if (!cachedMeta) return;

    void (async () => {
      setState('loading');
      try {
        const w = await spawnNerWorker();
        const { labelMap, backend } = await w.load(new ArrayBuffer(0));
        if (cancelled) {
          void w.unload();
          return;
        }
        setWorker(w);
        setState('ready');
        console.log(
          `[useNerModel] 캐시에서 로드 (backend=${backend}, labels=${Object.keys(labelMap).length})`,
        );
      } catch (e) {
        if (cancelled) return;
        console.warn('[useNerModel] 캐시 로드 실패:', e);
        setState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const loadFromUserDir = useCallback(async (): Promise<void> => {
    setState('loading');
    try {
      const picker = (
        window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }
      ).showDirectoryPicker;
      if (!picker) {
        setState('unsupported');
        return;
      }
      const dirHandle = await picker.call(window);
      const configFile = await dirHandle.getFileHandle('config.json');
      const configBytes = new Uint8Array(await (await configFile.getFile()).arrayBuffer());
      const id = await computeModelHash(configBytes);
      await copyDirToOpfs(dirHandle, id);
      const w = await spawnNerWorker();
      const { labelMap } = await w.load(new ArrayBuffer(0));
      const newMeta: ModelMeta = {
        id,
        modelName: 'openai/privacy-filter',
        loadedAt: Date.now(),
        labelMap,
      };
      writeModelMeta(newMeta);
      setMeta(newMeta);
      setWorker(w);
      setState('ready');
    } catch (e) {
      console.error('[useNerModel] loadFromUserDir 실패:', e);
      setState('error');
    }
  }, []);

  const reset = useCallback(() => {
    void worker?.unload();
    setWorker(null);
    setMeta(null);
    setState('idle');
    localStorage.removeItem(NER_MODEL_META_KEY);
  }, [worker]);

  return { state, meta, worker, loadFromUserDir, reset };
}

async function copyDirToOpfs(
  src: FileSystemDirectoryHandle,
  modelId: string,
): Promise<void> {
  const opfs = await navigator.storage.getDirectory();
  const models = await opfs.getDirectoryHandle('models', { create: true });
  const target = await models.getDirectoryHandle(modelId, { create: true });
  await copyRecursive(src, target);
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
