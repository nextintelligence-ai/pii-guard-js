import { describe, expect, it } from 'vitest';
import { router } from '@/router';

describe('TanStack Router 라우팅', () => {
  it('홈, 단일 처리, 일괄 처리, batch 상세 route 를 등록한다', () => {
    const routePaths = Object.values(router.routesByPath).map((route) => route.fullPath).sort();

    expect(routePaths).toContain('/');
    expect(routePaths).toContain('/single');
    expect(routePaths).toContain('/batch');
    expect(routePaths).toContain('/batch/$jobId');
  });
});
