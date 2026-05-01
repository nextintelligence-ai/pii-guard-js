import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type PackageJson = {
  scripts: Record<string, string>;
};

const pkg = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'),
) as PackageJson;

describe('package scripts', () => {
  it('uses one build path instead of a separate NLP build', () => {
    expect(pkg.scripts.build).toBe('tsc -b && vite build');
    expect(pkg.scripts['build:nlp']).toBeUndefined();
    expect(pkg.scripts['dev:nlp']).toBeUndefined();
  });
});
