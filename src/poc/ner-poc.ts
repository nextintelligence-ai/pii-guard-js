/**
 * NER PoC 진입점 — `index-nlp.html` 에서 로드된다.
 *
 * 모델은 `vite.config.ts` 의 `pocModelServer` plugin 이 dev 서버에서
 * `/models/privacy-filter/` 로 정적 서빙한다 (기본 `~/Downloads/privacy-filter`,
 * `POC_MODEL_DIR` 로 override). transformers.js 는 `env.localModelPath`
 * + 모델 식별자(`privacy-filter`) 조합으로 fetch.
 *
 * 이 파일은 PoC 임시 코드다. 본구현 단계에서는 워커 격리 + 정규 인터페이스로 교체.
 */

import { pipeline, env } from '@huggingface/transformers';
import { EN_FIXTURES, KO_FIXTURES } from './poc-fixtures';
import { compareEntityOffsets, type EntityOutput } from './compareEntityOffsets';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/models/';

type Classifier = (
  text: string,
  opts: { aggregation_strategy: 'simple' },
) => Promise<EntityOutput[]>;

let classifier: Classifier | null = null;

function uiLog(msg: string): void {
  const root = document.getElementById('poc-root');
  if (root) {
    const p = document.createElement('p');
    p.style.cssText = 'font-family:monospace;margin:4px 0;';
    p.textContent = msg;
    root.appendChild(p);
  }
  console.log(msg);
}

async function loadModel(): Promise<void> {
  uiLog('[ner-poc] 모델 로드 시도 (WebGPU 우선, WASM 폴백)...');
  const t0 = performance.now();
  classifier = await tryLoadPipeline('webgpu').catch(async (e: unknown) => {
    uiLog(`[ner-poc] WebGPU 실패, WASM 폴백: ${(e as Error).message}`);
    return tryLoadPipeline('wasm');
  });
  uiLog(`[ner-poc] 모델 로드 완료 ${(performance.now() - t0).toFixed(0)}ms`);
}

async function tryLoadPipeline(device: 'webgpu' | 'wasm'): Promise<Classifier> {
  const pipe = await pipeline('token-classification', 'privacy-filter', {
    device,
    dtype: 'q4',
  } as never);
  return pipe as unknown as Classifier;
}

async function runEnglishCases(): Promise<void> {
  if (!classifier) throw new Error('classifier not loaded');
  for (const fx of EN_FIXTURES) {
    const out = await classifier(fx.text, { aggregation_strategy: 'simple' });
    console.log(`[en/${fx.id}]`, JSON.stringify(out, null, 2));
    const cmp = compareEntityOffsets(fx, out);
    uiLog(
      `[en/${fx.id}] exact=${cmp.exactMatches}/${fx.expected.length} ` +
        `mismatch=${cmp.offsetMismatches.length} missing=${cmp.missing.length} extra=${cmp.extra.length}`,
    );
  }
}

async function runKoreanCases(): Promise<
  Array<{ id: string; text: string; observed: EntityOutput[] }>
> {
  if (!classifier) throw new Error('classifier not loaded');
  const acc: Array<{ id: string; text: string; observed: EntityOutput[] }> = [];
  for (const fx of KO_FIXTURES) {
    const out = await classifier(fx.text, { aggregation_strategy: 'simple' });
    console.log(`[ko/${fx.id}]`, JSON.stringify(out, null, 2));
    const summary = out
      .map((e) => `${e.entity_group}:${e.score.toFixed(2)}=${JSON.stringify(e.word)}`)
      .join(', ');
    uiLog(`[ko/${fx.id}] ${out.length}건 — ${summary || '(없음)'}`);
    acc.push({ id: fx.id, text: fx.text, observed: out });
  }
  return acc;
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function main(): Promise<void> {
  await loadModel();
  await runEnglishCases();
  const ko = await runKoreanCases();
  downloadJson('ner-ko-baseline.json', { generatedAt: new Date().toISOString(), cases: ko });
  uiLog('[ner-poc] 완료. ner-ko-baseline.json 다운로드 됨.');
}

void main().catch((e) => {
  uiLog(`[ner-poc] 실패: ${(e as Error).stack ?? (e as Error).message}`);
});
