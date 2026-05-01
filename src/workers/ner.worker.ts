import './installOrtWarningFilter';
import * as Comlink from 'comlink';
import { env, pipeline } from '@huggingface/transformers';
import type { NerWorkerApi, Entity } from '@/core/nerWorkerClient';
import { configureWorkerEnv } from './nerEnv';

configureWorkerEnv();

interface RawEntity {
  entity_group?: string;
  entity?: string;
  start?: number;
  end?: number;
  score: number;
  word: string;
}

type NerBackend = 'webgpu' | 'wasm';
type NerDtype = 'q4' | 'fp16' | 'fp32';

interface PipelineLoadResult {
  pipe: unknown;
  backend: NerBackend;
  dtype: NerDtype;
}

interface PipelineLoadFailure {
  backend: NerBackend;
  dtype: NerDtype;
  error: unknown;
}

let classifier: ((text: string, opts: { aggregation_strategy: 'simple' }) => Promise<RawEntity[]>) | null = null;
let labelMap: Record<number, string> = {};
let backend: NerBackend = 'wasm';
let activeModelDir: FileSystemDirectoryHandle | null = null;

const api: NerWorkerApi = {
  async load(modelHandle) {
    activeModelDir = isDirectoryHandle(modelHandle) ? modelHandle : null;
    classifier = null;
    labelMap = {};
    const startedAt = performance.now();
    workerInfo('[ner.worker] 모델 로드 시작', {
      hasModelDirectory: activeModelDir !== null,
    });

    const { pipe, backend: loadedBackend, dtype } = await loadBestPipeline();
    backend = loadedBackend;
    classifier = pipe as never;
    const cfg = (pipe as unknown as { model: { config: { id2label?: Record<number, string> } } }).model
      .config;
    labelMap = cfg.id2label ?? {};
    workerInfo('[ner.worker] 모델 로드 완료', {
      backend,
      dtype,
      labels: Object.keys(labelMap).length,
      ms: elapsedMs(startedAt),
    });
    return { labelMap, backend };
  },
  async classify(text: string): Promise<Entity[]> {
    if (!classifier) throw new Error('classifier not loaded');
    const SCORE_FLOOR = 0.5;
    const startedAt = performance.now();
    workerInfo('[ner.worker] classify 시작', {
      backend,
      chars: text.length,
    });
    const out = await classifier(text, { aggregation_strategy: 'simple' });
    const scored = out.filter((e) => e.score >= SCORE_FLOOR);
    const normalized = normalizeEntities(text, scored);
    if (normalized.skippedWithoutOffsets > 0) {
      workerInfo('[ner.worker] char offset 을 복원하지 못한 entity 가 있습니다.', {
        skippedWithoutOffsets: normalized.skippedWithoutOffsets,
      });
    }
    workerInfo('[ner.worker] classify 완료', {
      backend,
      chars: text.length,
      rawEntities: out.length,
      entities: normalized.entities.length,
      inferredOffsets: normalized.inferredOffsets,
      skippedWithoutOffsets: normalized.skippedWithoutOffsets,
      ms: elapsedMs(startedAt),
    });
    return normalized.entities;
  },
  async unload() {
    classifier = null;
    labelMap = {};
  },
};

Comlink.expose(api);
workerInfo('[ner.worker] worker module ready');
postWorkerMessage('ner-worker-ready');

async function loadBestPipeline(): Promise<PipelineLoadResult> {
  const failures: PipelineLoadFailure[] = [];
  const hasQ4 = await hasModelFile('q4');
  const hasFp32 = await hasModelFile('fp32');
  const hasFp16 = await hasModelFile('fp16');
  workerInfo('[ner.worker] 모델 파일 확인', { hasQ4, hasFp32, hasFp16 });
  if (hasQ4 && !hasFp32 && !hasFp16) {
    workerInfo('[ner.worker] q4 모델만 발견 — WebGPU 로드가 필요하며 WASM fallback 은 없습니다.');
  }

  if (hasQ4) {
    const loaded = await tryLoadPipeline('webgpu', 'q4', failures);
    if (loaded) return loaded;
  }

  if (hasFp32) {
    const loaded = await tryLoadPipeline('wasm', 'fp32', failures);
    if (loaded) return loaded;
  }

  if (hasFp16) {
    const loaded = await tryLoadPipeline('wasm', 'fp16', failures);
    if (loaded) return loaded;
  }

  throw new Error(loadFailureMessage({ hasQ4, hasFp32, hasFp16, failures }));
}

async function tryLoadPipeline(
  backendName: NerBackend,
  dtype: NerDtype,
  failures: PipelineLoadFailure[],
): Promise<PipelineLoadResult | null> {
  try {
    const startedAt = performance.now();
    workerInfo('[ner.worker] backend 로드 시도', {
      backend: backendName,
      dtype,
    });
    const pipe = await pipeline('token-classification', 'privacy-filter', {
      device: backendName,
      dtype,
    } as never);
    workerInfo('[ner.worker] backend 로드 성공', {
      backend: backendName,
      dtype,
      ms: elapsedMs(startedAt),
    });
    return { pipe, backend: backendName, dtype };
  } catch (error) {
    failures.push({ backend: backendName, dtype, error });
    workerWarn('[ner.worker] NER backend 로드 실패', {
      backend: backendName,
      dtype,
      error,
    });
    return null;
  }
}

async function hasModelFile(dtype: NerDtype): Promise<boolean> {
  if (!activeModelDir) return true;
  try {
    await readFileFromDir(activeModelDir, `onnx/${modelFileNameForDtype(dtype)}`);
    return true;
  } catch {
    return false;
  }
}

function modelFileNameForDtype(dtype: NerDtype): string {
  if (dtype === 'fp32') return 'model.onnx';
  return `model_${dtype}.onnx`;
}

function loadFailureMessage({
  hasQ4,
  hasFp32,
  hasFp16,
  failures,
}: {
  hasQ4: boolean;
  hasFp32: boolean;
  hasFp16: boolean;
  failures: PipelineLoadFailure[];
}): string {
  const details = failures
    .map(({ backend: failedBackend, dtype, error }) => {
      const reason = error instanceof Error ? error.message : String(error);
      return `${failedBackend}/${dtype}: ${reason}`;
    })
    .join(' | ');

  if (hasQ4 && !hasFp32 && !hasFp16) {
    return [
      'q4 NER 모델은 GatherBlockQuantized op 때문에 WASM 에서 실행할 수 없습니다.',
      'WebGPU q4 로드가 실패했고 WASM fallback 에 필요한 onnx/model.onnx 파일이 없습니다.',
      'fp32 모델 파일(onnx/model.onnx)이 포함된 모델 폴더를 선택하거나 WebGPU 환경을 확인하세요.',
      details ? `시도 결과: ${details}` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  return [
    '지원되는 NER ONNX 모델을 로드하지 못했습니다.',
    `확인된 파일: q4=${hasQ4}, fp32=${hasFp32}, fp16=${hasFp16}.`,
    details ? `시도 결과: ${details}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

const originalFetch = env.fetch;
env.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const modelPath = getModelRelativePath(input);
  if (modelPath && activeModelDir) {
    return responseFromModelDir(activeModelDir, modelPath);
  }
  return originalFetch(requestUrl(input), init);
};

function isDirectoryHandle(value: unknown): value is FileSystemDirectoryHandle {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as {
    kind?: unknown;
    getFileHandle?: unknown;
    getDirectoryHandle?: unknown;
  };
  return (
    candidate.kind === 'directory' &&
    typeof candidate.getFileHandle === 'function' &&
    typeof candidate.getDirectoryHandle === 'function'
  );
}

function getModelRelativePath(input: RequestInfo | URL): string | null {
  const raw = requestUrl(input);
  const path = raw.startsWith('/') ? raw : urlPathname(raw);
  if (!path) return null;

  const pathname = path.split(/[?#]/, 1)[0] ?? '';
  const prefix = '/models/privacy-filter/';
  if (!pathname.startsWith(prefix)) return null;

  const relativePath = decodeURIComponent(pathname.slice(prefix.length));
  const parts = relativePath.split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === '..' || part.includes('\\'))) {
    return null;
  }
  return parts.join('/');
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function urlPathname(raw: string): string | null {
  try {
    return new URL(raw).pathname;
  } catch {
    return null;
  }
}

async function responseFromModelDir(
  root: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<Response> {
  try {
    const file = await readFileFromDir(root, relativePath);
    workerInfo('[ner.worker] 모델 파일 로드', {
      path: relativePath,
      bytes: file.size,
    });
    return new Response(file.stream(), {
      status: 200,
      headers: {
        'Content-Length': String(file.size),
        'Content-Type': contentTypeFor(relativePath),
      },
    });
  } catch {
    return new Response(null, { status: 404, statusText: 'Not Found' });
  }
}

async function readFileFromDir(
  root: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<File> {
  const parts = relativePath.split('/').filter(Boolean);
  let dir = root;
  for (const part of parts.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(part);
  }
  const fileName = parts.at(-1);
  if (!fileName) throw new Error('모델 파일 경로가 비어 있습니다.');
  const fileHandle = await dir.getFileHandle(fileName);
  return fileHandle.getFile();
}

function contentTypeFor(path: string): string {
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.txt')) return 'text/plain;charset=utf-8';
  if (path.endsWith('.onnx') || path.endsWith('.onnx_data')) {
    return 'application/octet-stream';
  }
  return 'application/octet-stream';
}

function normalizeEntities(
  text: string,
  entities: RawEntity[],
): { entities: Entity[]; inferredOffsets: number; skippedWithoutOffsets: number } {
  const normalized: Entity[] = [];
  let inferredOffsets = 0;
  let skippedWithoutOffsets = 0;
  let cursor = 0;

  for (const entity of entities) {
    const label = entity.entity_group ?? entity.entity;
    if (!label) {
      skippedWithoutOffsets += 1;
      continue;
    }

    let hasProvidedOffsets = false;
    let span: { start: number; end: number } | null;
    if (
      typeof entity.start === 'number' &&
      typeof entity.end === 'number' &&
      entity.start >= 0 &&
      entity.end > entity.start
    ) {
      hasProvidedOffsets = true;
      span = trimSpan(text, entity.start, entity.end);
    } else {
      span = inferSpanFromWord(text, entity.word, cursor);
    }

    if (!span) {
      skippedWithoutOffsets += 1;
      continue;
    }
    if (!hasProvidedOffsets) inferredOffsets += 1;
    cursor = Math.max(cursor, span.end);
    normalized.push({
      entity_group: label,
      start: span.start,
      end: span.end,
      score: entity.score,
      word: entity.word,
    });
  }

  return { entities: normalized, inferredOffsets, skippedWithoutOffsets };
}

function inferSpanFromWord(
  text: string,
  decodedWord: string,
  cursor: number,
): { start: number; end: number } | null {
  const variants = wordSearchVariants(decodedWord);

  for (const variant of variants) {
    const index = text.indexOf(variant, cursor);
    if (index >= 0) return trimSpan(text, index, index + variant.length);
  }
  for (const variant of variants) {
    const index = text.indexOf(variant);
    if (index >= 0) return trimSpan(text, index, index + variant.length);
  }
  for (const variant of variants) {
    const span = inferSpanWithFlexibleWhitespace(text, variant, cursor);
    if (span) return trimSpan(text, span.start, span.end);
  }
  for (const variant of variants) {
    const span = inferSpanWithFlexibleWhitespace(text, variant, 0);
    if (span) return trimSpan(text, span.start, span.end);
  }
  for (const variant of variants) {
    const span = inferSpanWithoutWhitespace(text, variant, cursor);
    if (span) return trimSpan(text, span.start, span.end);
  }
  for (const variant of variants) {
    const span = inferSpanWithoutWhitespace(text, variant, 0);
    if (span) return trimSpan(text, span.start, span.end);
  }
  return null;
}

function wordSearchVariants(decodedWord: string): string[] {
  const normalized = decodedWord.normalize('NFC');
  const tokenizerCleaned = normalized
    .replace(/##/g, '')
    .replace(/[▁Ġ]+/g, ' ')
    .replace(/\s+/g, ' ');
  return uniqueNonEmpty([
    normalized,
    normalized.trimStart(),
    normalized.trim(),
    tokenizerCleaned,
    tokenizerCleaned.trimStart(),
    tokenizerCleaned.trim(),
  ]);
}

function inferSpanWithFlexibleWhitespace(
  text: string,
  variant: string,
  cursor: number,
): { start: number; end: number } | null {
  if (!/\s/.test(variant)) return null;
  const pattern = escapeRegExp(variant.trim()).replace(/\s+/g, '\\s+');
  if (!pattern) return null;
  const match = new RegExp(pattern, 'u').exec(text.slice(cursor));
  if (!match || match.index < 0) return null;
  const start = cursor + match.index;
  return { start, end: start + match[0].length };
}

function inferSpanWithoutWhitespace(
  text: string,
  variant: string,
  cursor: number,
): { start: number; end: number } | null {
  const needle = variant.replace(/\s+/g, '');
  if (needle.length === 0) return null;

  let compact = '';
  const offsets: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (/\s/.test(text[i] ?? '')) continue;
    if (i < cursor) {
      continue;
    }
    compact += text[i];
    offsets.push(i);
  }

  const index = compact.indexOf(needle);
  if (index < 0) return null;
  const start = offsets[index];
  const last = offsets[index + needle.length - 1];
  if (start === undefined || last === undefined) return null;
  return { start, end: last + 1 };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function trimSpan(
  text: string,
  rawStart: number,
  rawEnd: number,
): { start: number; end: number } | null {
  let start = Math.max(0, Math.min(rawStart, text.length));
  let end = Math.max(start, Math.min(rawEnd, text.length));
  while (start < end && /\s/.test(text[start] ?? '')) start += 1;
  while (end > start && /\s/.test(text[end - 1] ?? '')) end -= 1;
  if (end <= start) return null;
  return { start, end };
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

function workerInfo(message: string, payload?: unknown): void {
  const args = compactArgs(message, payload);
  console.info(...args);
  postWorkerLog('info', args);
}

function workerWarn(message: string, payload?: unknown): void {
  const args = compactArgs(message, payload);
  console.warn(...args);
  postWorkerLog('warn', args);
}

function compactArgs(message: string, payload?: unknown): unknown[] {
  return payload === undefined ? [message] : [message, sanitizeLogValue(payload)];
}

function postWorkerLog(level: 'info' | 'warn' | 'error', args: unknown[]): void {
  postWorkerMessage({ type: 'ner-worker-log', level, args });
}

function postWorkerMessage(message: unknown): void {
  try {
    self.postMessage(message);
  } catch {
    // Console logging must never break NER execution.
  }
}

function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[depth-limit]';
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeLogValue(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      sanitizeLogValue(item, depth + 1),
    ]),
  );
}
