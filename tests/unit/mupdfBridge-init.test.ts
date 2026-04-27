import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('mupdfBridge WASM 외부 주입', () => {
  beforeEach(() => {
    // 모듈 캐시를 매 테스트마다 리셋해 ensureMupdfReady 의 단발 promise 가
    // 다른 케이스로 누수되지 않게 한다.
    vi.resetModules();
    delete (globalThis as { $libmupdf_wasm_Module?: unknown }).$libmupdf_wasm_Module;
  });

  it('setWasmBinary 호출 전에는 ensureMupdfReady 가 대기한다', async () => {
    const bridge = await import('@/core/mupdfBridge');
    let resolved = false;
    const p = bridge.ensureMupdfReady().then(() => {
      resolved = true;
    });
    // 한 마이크로태스크 진행해도 아직 resolved 가 아니어야 한다.
    await Promise.resolve();
    expect(resolved).toBe(false);
    // 이제 주입한다.
    const { decodeMupdfWasm } = await import('@/wasm/decodeMupdfWasm');
    bridge.setWasmBinary(decodeMupdfWasm());
    await p;
    expect(resolved).toBe(true);
  });

  it('setWasmBinary 가 ensureMupdfReady 보다 먼저 호출돼도 동작한다', async () => {
    const bridge = await import('@/core/mupdfBridge');
    const { decodeMupdfWasm } = await import('@/wasm/decodeMupdfWasm');
    bridge.setWasmBinary(decodeMupdfWasm());
    const mod = await bridge.ensureMupdfReady();
    expect(typeof mod.Document.openDocument).toBe('function');
  });
});
