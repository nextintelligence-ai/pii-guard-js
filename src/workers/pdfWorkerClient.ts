import { wrap, type Remote } from 'comlink';
import PdfWorker from './pdf.worker.ts?worker&inline';
import { decodeMupdfWasm } from '@/wasm/decodeMupdfWasm';
import type { PdfWorkerApi } from './pdf.worker.types';

let cached: Promise<Remote<PdfWorkerApi>> | null = null;

/**
 * 워커를 1회 생성하고 init-wasm 핸드셰이크가 끝나야 comlink Remote 를 반환한다.
 *
 * 1. 새 Worker 생성 (vite `?worker&inline` ESM 워커, file:// 호환 플러그인 적용)
 * 2. base64 WASM 을 1회 디코드해 ArrayBuffer 를 transferable 로 전송 → 메인 메모리 즉시 해제
 * 3. 워커가 'wasm-ready' string 메시지를 보낼 때까지 대기
 *    - { type: 'init-error', message } 를 받으면 reject (워커 setWasmBinary/expose 가 throw 한 경우)
 *    - 워커 'error' 이벤트는 fallback (sync exception 이 globalErrorHandler 까지 도달한 경우)
 *    - 30초 타임아웃: 워커가 메시지를 묵살(예: 타입가드 실패)했을 때 메인 스레드 무한 대기 방지
 * 4. comlink wrap 후 캐시
 */
export function getPdfWorker(): Promise<Remote<PdfWorkerApi>> {
  if (cached) return cached;
  cached = (async () => {
    const w = new PdfWorker();
    const wasmBytes = decodeMupdfWasm();
    const buffer = wasmBytes.buffer;

    await new Promise<void>((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const cleanup = (): void => {
        if (timeoutId !== null) clearTimeout(timeoutId);
        w.removeEventListener('message', onMessage);
        w.removeEventListener('error', onError);
      };
      const onMessage = (e: MessageEvent): void => {
        if (e.data === 'wasm-ready') {
          cleanup();
          resolve();
          return;
        }
        if (
          typeof e.data === 'object' &&
          e.data !== null &&
          (e.data as { type?: unknown }).type === 'init-error'
        ) {
          cleanup();
          const msg = String((e.data as { message?: unknown }).message ?? 'unknown');
          reject(new Error(`pdf.worker init-error: ${msg}`));
        }
      };
      const onError = (e: ErrorEvent): void => {
        cleanup();
        reject(new Error(`pdf.worker init error: ${e.message}`));
      };
      w.addEventListener('message', onMessage);
      w.addEventListener('error', onError);
      timeoutId = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            'pdf.worker init 응답 없음 (30s 타임아웃) — 워커 환경/모듈 로딩을 확인하세요.',
          ),
        );
      }, 30_000);
      // ArrayBuffer 를 transferable 로 보내면 메인 측 wasmBytes 의 underlying buffer 가 detach
      // 되어 즉시 GC 후보가 된다. 캐시할 필요가 없으므로 의도된 동작.
      w.postMessage({ type: 'init-wasm', buffer }, [buffer]);
    });

    return wrap<PdfWorkerApi>(w);
  })();
  // init 실패 시 cached 를 null 로 리셋해 다음 호출이 새로 시도하도록 한다.
  // 현재 호출자에게는 원래의 rejection 이 그대로 전달된다 (cached 자체는 변경 안 함).
  cached.catch(() => {
    cached = null;
  });
  return cached;
}
