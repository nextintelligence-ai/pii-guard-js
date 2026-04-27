/**
 * mupdfBridge — mupdf@1.27.0 초기화 래퍼 (PoC step 1: ping 만 지원).
 *
 * mupdf@1.27.0 의 ESM 엔트리(`mupdf/dist/mupdf.js`)는 import 평가 시점에
 * top-level `await libmupdf_wasm(globalThis["$libmupdf_wasm_Module"])` 를 실행한다.
 * 따라서 WASM 바이너리를 외부에서 주입하려면 mupdf 모듈을 import 하기 *전에*
 * `globalThis["$libmupdf_wasm_Module"] = { wasmBinary: <Uint8Array> }` 로 설정해야 한다.
 *
 * 이 모듈은 dynamic import 로 그 순서를 보장한다.
 */
import type * as MupdfNS from 'mupdf';
import { MUPDF_WASM_BASE64, MUPDF_WASM_BYTE_LENGTH } from '@/wasm/mupdfBinary';

type MupdfModule = typeof MupdfNS;

let mupdfModulePromise: Promise<MupdfModule> | null = null;

/** Base64 → Uint8Array 디코더 (브라우저/워커 환경 동작). */
function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

/**
 * mupdf 를 base64 WASM 으로 1회 초기화하고 모듈 네임스페이스를 반환한다.
 * 동시 호출되어도 단일 Promise 를 공유한다.
 */
export function ensureMupdfReady(): Promise<MupdfModule> {
  if (!mupdfModulePromise) {
    mupdfModulePromise = (async () => {
      const wasmBinary = decodeBase64(MUPDF_WASM_BASE64);
      if (wasmBinary.byteLength !== MUPDF_WASM_BYTE_LENGTH) {
        throw new Error(
          `mupdf WASM byteLength 불일치: 기대 ${MUPDF_WASM_BYTE_LENGTH}, 실제 ${wasmBinary.byteLength}`,
        );
      }
      // mupdf-wasm.js 가 globalThis["$libmupdf_wasm_Module"] 을 Emscripten Module 로 사용한다.
      // wasmBinary 를 미리 주입해 fetch 없이 인스턴스화한다.
      const g = globalThis as unknown as Record<string, unknown>;
      const existing = g['$libmupdf_wasm_Module'];
      const existingObj =
        typeof existing === 'object' && existing !== null
          ? (existing as Record<string, unknown>)
          : {};
      g['$libmupdf_wasm_Module'] = {
        ...existingObj,
        wasmBinary,
      };
      // 동적 import 로 평가 시점을 보장.
      const mod = (await import('mupdf')) as MupdfModule;
      return mod;
    })();
  }
  return mupdfModulePromise;
}
