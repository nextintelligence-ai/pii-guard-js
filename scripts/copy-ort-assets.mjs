import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const paddleEntry = fileURLToPath(import.meta.resolve('@paddleocr/paddleocr-js'));
const paddlePackageRoot = path.dirname(path.dirname(paddleEntry));
const ortDist = path.join(paddlePackageRoot, 'node_modules/onnxruntime-web/dist');
const targetDir = path.resolve('public/ort');

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });

const entries = await readdir(ortDist);
const copied = [];

for (const entry of entries) {
  if (!entry.startsWith('ort-wasm-') || !/\.(wasm|mjs)$/.test(entry)) {
    continue;
  }
  await cp(path.join(ortDist, entry), path.join(targetDir, entry));
  copied.push(entry);
}

if (copied.length === 0) {
  console.error(`copy-ort-assets: no runtime files copied from ${ortDist}`);
  process.exit(1);
}

console.log(`copy-ort-assets: copied ${copied.length} files to ${targetDir}`);
