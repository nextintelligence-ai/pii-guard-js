/**
 * NER PoC 진입점 — `index-nlp.html` 에서 로드된다.
 *
 * 목적: OpenAI privacy-filter 모델을 사용자가 받아둔 폴더에서 로드해
 * 영문/한국어 텍스트의 entity 검출 결과를 측정한다. 측정 결과는 콘솔과
 * 다운로드되는 baseline JSON 으로 보고된다 (휴먼이 `docs/poc-ner-report.md`
 * 에 옮긴다).
 *
 * 이 파일은 PoC 임시 코드다. 본구현 단계에서는 워커 격리 + transformers.js
 * 정규 인터페이스로 교체된다.
 */

import { pipeline, env } from '@huggingface/transformers';
import { EN_FIXTURES, KO_FIXTURES } from './poc-fixtures';
import { compareEntityOffsets, type EntityOutput } from './compareEntityOffsets';

env.allowRemoteModels = false;
env.allowLocalModels = true;

type Classifier = (
  text: string,
  opts: { aggregation_strategy: 'simple' },
) => Promise<EntityOutput[]>;

let classifier: Classifier | null = null;

async function loadModelFromUserDir(): Promise<void> {
  const root = document.getElementById('poc-root');
  if (!root) throw new Error('poc-root not found');

  const button = document.createElement('button');
  button.textContent = '모델 폴더 선택';
  button.style.cssText = 'font-size:16px;padding:8px 16px;margin:16px 0;';
  root.appendChild(button);

  await new Promise<void>((resolve) => {
    button.onclick = async () => {
      const picker = (
        window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }
      ).showDirectoryPicker;
      if (!picker) {
        alert('이 브라우저는 showDirectoryPicker 를 지원하지 않습니다. Chrome/Edge 로 시도하세요.');
        return;
      }
      const dirHandle = await picker.call(window);
      await registerModelFromHandle(dirHandle);
      resolve();
    };
  });

  const t0 = performance.now();
  classifier = await tryLoadPipeline('webgpu').catch(async (e: unknown) => {
    console.warn('[ner-poc] WebGPU 실패, WASM 폴백:', e);
    return tryLoadPipeline('wasm');
  });
  console.log(`[ner-poc] 모델 로드 ${(performance.now() - t0).toFixed(0)}ms`);
}

async function tryLoadPipeline(device: 'webgpu' | 'wasm'): Promise<Classifier> {
  const pipe = await pipeline('token-classification', 'privacy-filter', {
    device,
    dtype: device === 'webgpu' ? 'q4' : 'fp32',
  } as never);
  return pipe as unknown as Classifier;
}

/**
 * transformers.js 의 로컬 모델 로딩 정확한 방법은 라이브러리 버전마다 다르다.
 * PoC 출발점으로 모든 파일을 메모리에 읽어 `env` 에 등록하는 시도를 한다.
 * 실제 동작은 dev:nlp 로 시도하면서 조정한다 — 잘 안 되면 input[type=file]
 * 단일 ONNX 파일 로딩으로 폴백.
 */
async function registerModelFromHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const files: Record<string, Uint8Array> = {};
  for await (const entry of (
    handle as unknown as { values(): AsyncIterable<FileSystemHandle> }
  ).values()) {
    if (entry.kind === 'file') {
      const f = await (entry as FileSystemFileHandle).getFile();
      files[entry.name] = new Uint8Array(await f.arrayBuffer());
    }
  }
  console.log('[ner-poc] 모델 파일들:', Object.keys(files));
  (env as unknown as { __pocFiles__?: Record<string, Uint8Array> }).__pocFiles__ = files;
  env.localModelPath = '/';
}

async function runEnglishCases(): Promise<void> {
  if (!classifier) throw new Error('classifier not loaded');
  for (const fx of EN_FIXTURES) {
    const out = await classifier(fx.text, { aggregation_strategy: 'simple' });
    console.log(`[en/${fx.id}]`, JSON.stringify(out, null, 2));
    const cmp = compareEntityOffsets(fx, out);
    console.log(`[en/${fx.id}] compare`, cmp);
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
  await loadModelFromUserDir();
  await runEnglishCases();
  const ko = await runKoreanCases();
  downloadJson('ner-ko-baseline.json', { generatedAt: new Date().toISOString(), cases: ko });
  console.log('[ner-poc] 완료. ner-ko-baseline.json 다운로드 됨.');
}

void main().catch((e) => {
  console.error('[ner-poc] 실패:', e);
});
