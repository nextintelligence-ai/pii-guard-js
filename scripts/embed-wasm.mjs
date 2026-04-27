import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function findMupdfWasm() {
  // 1) 서브패스 직접 해석 시도 (exports 맵에 wasm이 노출된 경우 대비)
  const subpathCandidates = [
    'mupdf/dist/mupdf-wasm.wasm',
    'mupdf/lib/mupdf-wasm.wasm',
    'mupdf/dist/mupdf.wasm',
  ];
  for (const rel of subpathCandidates) {
    try {
      return require.resolve(rel);
    } catch {
      /* 다음 후보로 */
    }
  }

  // 2) mupdf 메인 엔트리에서 sibling wasm 파일을 추론 (mupdf@1.27.0 대응)
  try {
    const mainEntry = require.resolve('mupdf');
    const siblingCandidates = [
      path.join(path.dirname(mainEntry), 'mupdf-wasm.wasm'),
      path.join(path.dirname(mainEntry), 'mupdf.wasm'),
    ];
    for (const candidate of siblingCandidates) {
      if (await fileExists(candidate)) {
        return candidate;
      }
    }
  } catch {
    /* 메인 엔트리 해석 실패 시 다음 단계로 */
  }

  throw new Error('mupdf wasm 바이너리를 node_modules에서 찾지 못했습니다.');
}

const wasmPath = await findMupdfWasm();
const buf = await readFile(wasmPath);
const b64 = buf.toString('base64');

const out = `// 자동 생성됨 — 직접 수정 금지
export const MUPDF_WASM_BASE64 = "${b64}";
export const MUPDF_WASM_BYTE_LENGTH = ${buf.byteLength};
`;

await mkdir(path.resolve('src/wasm'), { recursive: true });
await writeFile(path.resolve('src/wasm/mupdfBinary.ts'), out);
console.log(`embed-wasm: ${wasmPath} → src/wasm/mupdfBinary.ts (${buf.byteLength} bytes)`);
