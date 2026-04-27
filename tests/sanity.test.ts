import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('환경 점검', () => {
  it('Vitest가 정상 동작한다', () => {
    expect(1 + 1).toBe(2);
  });

  it('단일 HTML worker 실행에 필요한 CSP를 허용한다', () => {
    const html = readFileSync('index.html', 'utf8');

    expect(html).toContain("'wasm-unsafe-eval'");
    expect(html).toContain("worker-src 'self' blob: data:");
  });
});
