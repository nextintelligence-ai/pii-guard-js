import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it, afterEach } from 'vitest';

const created: string[] = [];

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'pii-guard-no-external-'));
  created.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('verify-no-external', () => {
  it('passes when nested build assets only contain same-origin paths and allowed namespaces', async () => {
    const dir = await makeDir();
    await mkdir(path.join(dir, 'assets'));
    await writeFile(path.join(dir, 'index.html'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await writeFile(path.join(dir, 'assets', 'app.js'), 'fetch("/models/paddleocr/model.tar")');

    const result = spawnSync('node', ['scripts/verify-no-external.mjs', `--target=${dir}`], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('외부 URL 0개');
  });

  it('fails when any nested build asset contains an unallowed external URL', async () => {
    const dir = await makeDir();
    await mkdir(path.join(dir, 'assets'));
    await writeFile(path.join(dir, 'index.html'), '<main></main>');
    await writeFile(path.join(dir, 'assets', 'app.js'), 'fetch("https://cdn.jsdelivr.net/npm/x")');

    const result = spawnSync('node', ['scripts/verify-no-external.mjs', `--target=${dir}`], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('https://cdn.jsdelivr.net/npm/x');
  });
});
