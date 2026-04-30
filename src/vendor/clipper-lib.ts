import clipperSource from 'clipper-lib/clipper.js?raw';

const moduleShim: { exports: unknown } = { exports: {} };
const evaluateClipper = new Function(
  'module',
  'exports',
  'window',
  'self',
  'document',
  `${clipperSource}
return module.exports || window.ClipperLib || self.ClipperLib;`,
) as (
  module: { exports: unknown },
  exports: unknown,
  windowValue: Window | undefined,
  selfValue: typeof globalThis,
  documentValue: Document | undefined,
) => unknown;

const clipperLib = evaluateClipper(
  moduleShim,
  moduleShim.exports,
  typeof window === 'undefined' ? undefined : window,
  globalThis,
  typeof document === 'undefined' ? undefined : document,
);

export default clipperLib;
