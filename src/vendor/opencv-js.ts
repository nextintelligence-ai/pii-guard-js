import opencvSource from '@techstark/opencv-js/dist/opencv.js?raw';

const moduleShim: { exports: unknown } = { exports: {} };
const evaluateOpenCv = new Function(
  'module',
  'exports',
  'window',
  'self',
  'document',
  'define',
  'require',
  'process',
  '__dirname',
  'importScripts',
  `${opencvSource}
return module.exports || window.cv || self.cv;`,
) as (
  module: { exports: unknown },
  exports: unknown,
  windowValue: Window | undefined,
  selfValue: typeof globalThis,
  documentValue: Document | undefined,
  defineValue: undefined,
  requireValue: undefined,
  processValue: undefined,
  dirnameValue: string,
  importScriptsValue: undefined,
) => unknown;

const cv = evaluateOpenCv(
  moduleShim,
  moduleShim.exports,
  typeof window === 'undefined' ? undefined : window,
  globalThis,
  typeof document === 'undefined' ? undefined : document,
  undefined,
  undefined,
  undefined,
  '',
  undefined,
);

export default cv;
