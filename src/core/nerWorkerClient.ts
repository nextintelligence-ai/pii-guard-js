import { wrap, type Remote } from 'comlink';
import NerWorker from '@/workers/ner.worker.ts?worker';

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
 * Vite `?worker` ESM 워커. 일반 dev/server 빌드에서는 별도 worker 자산으로 띄워
 * worker module init 오류와 source map 을 브라우저가 더 잘 보고하게 한다.
 */
export async function spawnNerWorker(): Promise<NerWorkerApi> {
  const worker = new NerWorker();
  worker.addEventListener('message', forwardWorkerLog);
  await waitForWorkerReady(worker);
  const remote = wrap<NerWorkerApi>(worker);
  return {
    load: (h) => remote.load(h),
    classify: (t) => remote.classify(t),
    unload: () => remote.unload(),
  };
}

type WorkerLogMessage = {
  type: 'ner-worker-log';
  level: 'info' | 'warn' | 'error';
  args: unknown[];
};

function waitForWorkerReady(worker: Worker): Promise<void> {
  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let warningId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = (): void => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (warningId !== null) clearTimeout(warningId);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.removeEventListener('messageerror', onMessageError);
    };
    const fail = (error: Error): void => {
      cleanup();
      worker.removeEventListener('message', forwardWorkerLog);
      worker.terminate();
      reject(error);
    };
    const onMessage = (event: MessageEvent): void => {
      if (event.data === 'ner-worker-ready') {
        cleanup();
        resolve();
      }
    };
    const onError = (event: ErrorEvent): void => {
      const details = describeWorkerError(event);
      console.error('[nerWorkerClient] NER worker 초기화 실패', details);
      fail(new Error(`ner.worker init error: ${details.message}`));
    };
    const onMessageError = (): void => {
      fail(new Error('ner.worker messageerror — worker 메시지를 deserialize 하지 못했습니다.'));
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.addEventListener('messageerror', onMessageError);
    warningId = setTimeout(() => {
      console.warn('[nerWorkerClient] NER worker 초기화 대기 중', { ms: 10_000 });
    }, 10_000);
    timeoutId = setTimeout(() => {
      fail(new Error('ner.worker init 응답 없음 (30s 타임아웃) — worker 모듈 로딩을 확인하세요.'));
    }, 30_000);
  });
}

function describeWorkerError(event: ErrorEvent): {
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  error?: string;
  type: string;
} {
  const error =
    event.error instanceof Error
      ? `${event.error.name}: ${event.error.message}`
      : event.error == null
        ? undefined
        : String(event.error);
  const details: {
    message: string;
    filename?: string;
    lineno?: number;
    colno?: number;
    error?: string;
    type: string;
  } = {
    type: event.type,
    message: event.message || error || 'unknown worker error',
  };
  if (event.filename) details.filename = event.filename;
  if (event.lineno) details.lineno = event.lineno;
  if (event.colno) details.colno = event.colno;
  if (error) details.error = error;
  return details;
}

function forwardWorkerLog(event: MessageEvent): void {
  if (!isWorkerLogMessage(event.data)) return;
  console[event.data.level](...event.data.args);
}

function isWorkerLogMessage(value: unknown): value is WorkerLogMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WorkerLogMessage>;
  return (
    candidate.type === 'ner-worker-log' &&
    (candidate.level === 'info' ||
      candidate.level === 'warn' ||
      candidate.level === 'error') &&
    Array.isArray(candidate.args)
  );
}

// Comlink Remote 의 타입을 외부에 노출할 필요가 있을 때를 대비해 type-only re-export.
export type { Remote };
