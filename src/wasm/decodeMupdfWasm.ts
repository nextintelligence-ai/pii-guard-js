import { MUPDF_WASM_BASE64, MUPDF_WASM_BYTE_LENGTH } from './mupdfBinary';

/**
 * 임베드된 mupdf WASM base64 문자열을 Uint8Array 로 디코드한다.
 * 디코드된 byteLength 가 임베드 시점에 기록된 값과 다르면 던진다.
 *
 * 주의: 이 함수가 import 되는 모든 진입점은 13MB 짜리 base64 상수를 번들에 끌어온다.
 * 프로덕션에서는 메인 스레드(`pdfWorkerClient`)와 Node 테스트에서만 호출되어야 한다.
 * 워커 번들은 이 모듈을 import 해서는 안 된다 (전체 최적화의 핵심).
 */
export function decodeMupdfWasm(): Uint8Array {
  const bin = atob(MUPDF_WASM_BASE64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  if (out.byteLength !== MUPDF_WASM_BYTE_LENGTH) {
    throw new Error(
      `mupdf WASM byteLength 불일치: 기대 ${MUPDF_WASM_BYTE_LENGTH}, 실제 ${out.byteLength}`,
    );
  }
  return out;
}
