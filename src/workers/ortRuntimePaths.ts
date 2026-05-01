export const ORT_WASM_FILE_PATHS = {
  mjs: '/ort/ort-wasm-simd-threaded.asyncify.mjs',
  wasm: '/ort/ort-wasm-simd-threaded.asyncify.wasm',
} as const;

export const PADDLE_OCR_ORT_WASM_PATH_PREFIX = import.meta.env.DEV
  ? '/node_modules/@paddleocr/paddleocr-js/node_modules/onnxruntime-web/dist/'
  : '/ort/';

const ORT_WARNING_FILTER_INSTALLED = Symbol.for('piiGuard.ortWarningFilterInstalled');

type WarnTarget = {
  warn: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  [ORT_WARNING_FILTER_INSTALLED]?: true;
};

const ORT_EP_ASSIGNMENT_WARNING_PATTERNS = [
  'VerifyEachNodeIsAssignedToAnEp',
  'Some nodes were not assigned to the preferred execution providers',
];

export function installOrtWarningFilter(target: WarnTarget = console): void {
  if (target[ORT_WARNING_FILTER_INSTALLED]) return;

  for (const method of ['warn', 'log', 'error'] as const) {
    const original = target[method].bind(target);
    target[method] = (...args: unknown[]) => {
      const message = args.map(String).join(' ');
      if (ORT_EP_ASSIGNMENT_WARNING_PATTERNS.some((pattern) => message.includes(pattern))) {
        return;
      }
      original(...args);
    };
  }
  target[ORT_WARNING_FILTER_INSTALLED] = true;
}
