import {
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { AppShell } from '@/AppShell';
import { SinglePage } from '@/pages/SinglePage';

function HomePlaceholder() {
  return <div>홈</div>;
}

function BatchPlaceholder() {
  return <div>일괄 처리</div>;
}

function BatchJobPlaceholder() {
  return <div>일괄 상세</div>;
}

const rootRoute = createRootRoute({
  component: AppShell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePlaceholder,
});

const singleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/single',
  component: SinglePage,
});

const batchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/batch',
  component: BatchPlaceholder,
});

const batchJobRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/batch/$jobId',
  component: BatchJobPlaceholder,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  singleRoute,
  batchRoute,
  batchJobRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
