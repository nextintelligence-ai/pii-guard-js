import { expose, transfer } from 'comlink';
import { runDetectors } from '@/core/detectors';
import {
  applyRedactions,
  closeDocument,
  ensureMupdfReady,
  extractLines,
  extractSpans,
  openDocument,
  renderPage,
  setWasmBinary,
} from '@/core/mupdfBridge';
import type { PdfWorkerApi } from './pdf.worker.types';

const api: Partial<PdfWorkerApi> = {
  async ping() {
    await ensureMupdfReady();
    return 'pong' as const;
  },
  async open(buf, opts) {
    const pages = await openDocument(buf, opts?.password);
    return { pages };
  },
  async renderPage(pageIndex, scale) {
    const result = await renderPage(pageIndex, scale);
    return transfer(result, [result.bitmap]);
  },
  async extractSpans(pageIndex) {
    return extractSpans(pageIndex);
  },
  async detectAll(pageIndex) {
    const lines = await extractLines(pageIndex);
    return runDetectors(lines);
  },
  async apply(boxes) {
    const r = await applyRedactions(boxes);
    return transfer(r, [r.pdf.buffer]);
  },
  async close() {
    closeDocument();
  },
};

/**
 * 워커는 메인 스레드가 보낸 init-wasm 메시지를 받기 전까지 comlink expose 를 호출하지 않는다.
 *
 * 이렇게 해야:
 *   1. 메인이 큰 base64 WASM 을 1회만 디코드해 transferable buffer 로 전달 → 워커 번들 사이즈 감소.
 *   2. expose 가 늦게 attach 되므로, 메인이 wasm-ready 수신 전 RPC postMessage 를 보낼 위험이 없다.
 *
 * init-wasm 메시지 모양: { type: 'init-wasm', buffer: ArrayBuffer }
 * 응답:
 *   - 'wasm-ready' (string) → 정상. 메인은 이를 받고 comlink wrap 진행.
 *   - { type: 'init-error', message } → setWasmBinary/expose 가 throw 했을 때.
 *     메인은 이 메시지를 보고 promise 를 reject 한다.
 */
self.addEventListener(
  'message',
  function onInit(e: MessageEvent) {
    const data = e.data as unknown;
    if (
      typeof data === 'object' &&
      data !== null &&
      (data as { type?: unknown }).type === 'init-wasm' &&
      (data as { buffer?: unknown }).buffer instanceof ArrayBuffer
    ) {
      self.removeEventListener('message', onInit);
      const buffer = (data as { buffer: ArrayBuffer }).buffer;
      try {
        setWasmBinary(new Uint8Array(buffer));
        expose(api);
        // 메인에 ready 신호. 이 메시지는 plain string 이라 comlink RPC 와 충돌하지 않는다
        // (comlink 페이로드는 항상 객체).
        self.postMessage('wasm-ready');
      } catch (err) {
        // setWasmBinary / expose 가 동기적으로 throw 하면 메인 측 await 가 hang.
        // 구조화된 init-error 를 보낸 뒤 다시 던져 글로벌 에러 핸들러로도 노출한다.
        self.postMessage({ type: 'init-error', message: String(err) });
        throw err;
      }
    }
  },
);
