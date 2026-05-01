import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('vite config', () => {
  it('excludes PaddleOCR from dependency prebundling so it resolves its own ORT runtime', async () => {
    const source = await readFile(path.resolve(process.cwd(), 'vite.config.ts'), 'utf8');

    expect(source).toMatch(/exclude:\s*\[[^\]]*'@paddleocr\/paddleocr-js'/s);
    expect(source).toContain("./node_modules/@paddleocr/paddleocr-js/dist/index.mjs");
    expect(source).toContain("./src/vendor/opencv-js.ts");
    expect(source).toContain("./src/vendor/clipper-lib.ts");
  });

  it('strips PaddleOCR transitive dependency documentation URLs from production chunks', async () => {
    const source = await readFile(path.resolve(process.cwd(), 'vite.config.ts'), 'utf8');

    expect(source).toContain('http://www.angusj.com');
    expect(source).toContain('http://jsperf.com/big-integer-library-test');
    expect(source).toContain('license-clipper');
    expect(source).toContain('reference-jsbn');
  });

  it('splits TanStack Router localhost fallback before postbuild URL scanning', async () => {
    const source = await readFile(path.resolve(process.cwd(), 'vite.config.ts'), 'utf8');

    expect(source).toContain('split-tanstack-router-localhost-fallback');
    expect(source).toContain('"http:"+"//localhost"');
  });
});
