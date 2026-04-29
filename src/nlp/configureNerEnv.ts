import { env } from '@huggingface/transformers';

/**
 * NLP 모드 진입 시 transformers.js 의 환경 변수를 외부 네트워크 0 정책에 맞춘다.
 *
 * - 원격 모델 로드 차단: huggingface.co hub 로의 fetch 를 막는다.
 * - 로컬 모델 경로 활성화: dev 서버의 `/models/` middleware (vite.config 의 pocModelServer) 와
 *   본 빌드의 OPFS 캐시 흐름이 같은 prefix 를 공유한다.
 * - onnxruntime-web 의 wasm/.mjs 파일을 jsdelivr CDN 이 아닌 `/ort/` 로 가져오도록 강제.
 *   dev 에서는 `vite.config.ts` 의 `ortRuntimeServer` plugin 이 `node_modules/onnxruntime-web/dist/`
 *   를 정적 서빙하고, 본 빌드에서는 onnxruntime-web 이 `viteSingleFile` 로 inline 되므로
 *   런타임 fetch 가 발생하지 않는다 (wasmPaths 설정은 최후의 안전망).
 */
export async function configureNerEnv(): Promise<void> {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = '/models/';
  const ortBackends = (env as unknown as { backends?: { onnx?: { wasm?: { wasmPaths?: string } } } }).backends;
  if (ortBackends?.onnx?.wasm) {
    ortBackends.onnx.wasm.wasmPaths = '/ort/';
  }
}
