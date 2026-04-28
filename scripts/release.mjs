#!/usr/bin/env node
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
const tag = `v${pkg.version}`;
const asset = resolve(repoRoot, 'dist/index.html');

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: repoRoot });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const tryOut = (cmd) => {
  try {
    return execSync(cmd, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

if (tryOut(`gh release view ${tag}`) !== null) {
  console.error(`✗ ${tag} 릴리즈가 이미 존재합니다. package.json 의 version 을 올린 뒤 다시 시도하세요.`);
  process.exit(1);
}

const remoteHead = tryOut('git rev-parse origin/main');
const localHead = tryOut('git rev-parse HEAD');
if (remoteHead && localHead && remoteHead !== localHead) {
  console.error('✗ origin/main 과 HEAD 가 다릅니다. 릴리즈 전에 main 을 동기화하세요.');
  process.exit(1);
}

console.log(`▶ 빌드 시작 (${tag})`);
run('npm', ['run', 'build']);

console.log(`▶ GitHub 릴리즈 생성: ${tag}`);
run('gh', [
  'release',
  'create',
  tag,
  asset,
  '--target',
  'main',
  '--title',
  tag,
  '--generate-notes',
]);

console.log(`✓ 배포 완료: ${tag}`);
console.log(`  ${tryOut(`gh release view ${tag} --json url -q .url`) ?? ''}`);
