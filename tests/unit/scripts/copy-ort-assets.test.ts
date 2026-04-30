import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('copy-ort-assets', () => {
  it('injects the ORT assignment warning filter into the copied PaddleOCR worker', async () => {
    const source = await readFile(path.resolve(process.cwd(), 'scripts/copy-ort-assets.mjs'), 'utf8');

    expect(source).toContain('VerifyEachNodeIsAssignedToAnEp');
    expect(source).toContain('Some nodes were not assigned to the preferred execution providers');
    expect(source).toContain('workerSource = `${ortWarningFilterSource}\\n${workerSource}`');
  });
});
