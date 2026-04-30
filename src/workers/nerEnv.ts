import { env } from '@huggingface/transformers';
import { installOrtWarningFilter, ORT_WASM_FILE_PATHS } from './ortRuntimePaths';

type OrtWasmEnv = {
  wasmPaths?: string | typeof ORT_WASM_FILE_PATHS;
  numThreads?: number;
};

/**
 * Worker context 의 transformers.js env 설정.
 *
 * 메인 스레드의 `src/nlp/configureNerEnv.ts` 와 같은 내용을 별도 모듈로 둔다.
 * Vite 의 worker.format=es 가 별도 entry 를 생성하므로, 메인 모듈을 import 하면
 * React/styles/App 까지 전부 worker bundle 에 들어가 사이즈 폭발 + 외부 네트워크
 * 0 정책 위반 위험이 있다.
 */
export function configureWorkerEnv(): void {
  installOrtWarningFilter();
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = '/models/';
  const ortBackends = (env as unknown as { backends?: { onnx?: { wasm?: OrtWasmEnv } } }).backends;
  if (ortBackends?.onnx?.wasm) {
    ortBackends.onnx.wasm.wasmPaths = ORT_WASM_FILE_PATHS;
    ortBackends.onnx.wasm.numThreads = 1;
  }
}
