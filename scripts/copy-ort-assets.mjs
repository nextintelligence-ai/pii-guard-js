import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const paddleEntry = fileURLToPath(import.meta.resolve('@paddleocr/paddleocr-js'));
const paddlePackageRoot = path.dirname(path.dirname(paddleEntry));
const ortDist = path.join(paddlePackageRoot, 'node_modules/onnxruntime-web/dist');
const targetDir = path.resolve('public/ort');
const paddleWorkerSourceDir = path.join(paddlePackageRoot, 'dist/assets');
const paddleWorkerTargetDir = path.resolve('public/paddleocr');
const paddleWorkerTargetFile = path.join(paddleWorkerTargetDir, 'worker-entry.js');

const ortWarningFilterSource = `const __piiGuardOrtWarningPatterns = [
  'VerifyEachNodeIsAssignedToAnEp',
  'Some nodes were not assigned to the preferred execution providers'
];
for (const __piiGuardMethod of ['warn', 'log', 'error']) {
  const __piiGuardOriginal = console[__piiGuardMethod].bind(console);
  console[__piiGuardMethod] = (...args) => {
    const __piiGuardMessage = args.map(String).join(' ');
    if (__piiGuardOrtWarningPatterns.some((pattern) => __piiGuardMessage.includes(pattern))) {
      return;
    }
    __piiGuardOriginal(...args);
  };
}`;

const publicWorkerReplacements = [
  [
    'https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/',
    'same-origin-paddle-models/',
  ],
  ['https://cdn.jsdelivr.net/npm/onnxruntime-web@', 'same-origin-onnxruntime-web@'],
  ['https://github.com/nodeca/js-yaml', 'license-js-yaml'],
  ['http://www.apache.org/licenses/LICENSE-2.0', 'license-apache-2.0'],
];

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

const paddleWorkerEntries = (await readdir(paddleWorkerSourceDir)).filter(
  (entry) => entry.startsWith('worker-entry-') && entry.endsWith('.js'),
);

if (paddleWorkerEntries.length !== 1) {
  console.error(
    `copy-ort-assets: expected exactly one PaddleOCR worker-entry*.js in ${paddleWorkerSourceDir}, found ${paddleWorkerEntries.length}`,
  );
  process.exit(1);
}

let workerSource = await readFile(path.join(paddleWorkerSourceDir, paddleWorkerEntries[0]), 'utf8');
for (const [needle, replacement] of publicWorkerReplacements) {
  workerSource = workerSource.split(needle).join(replacement);
}
workerSource = `${ortWarningFilterSource}\n${workerSource}`;

await rm(paddleWorkerTargetDir, { recursive: true, force: true });
await mkdir(paddleWorkerTargetDir, { recursive: true });
await writeFile(paddleWorkerTargetFile, workerSource);

console.log(`copy-ort-assets: copied PaddleOCR worker to ${paddleWorkerTargetFile}`);
