import { expose } from 'comlink';
import type { OcrResult } from '@paddleocr/paddleocr-js';
import { normalizeOcrResult } from '@/core/ocr/normalize';
import type { OcrBackend } from '@/core/ocr/types';
import type { OcrWorkerApi } from './ocr.worker.types';
import { installOrtWarningFilter, PADDLE_OCR_ORT_WASM_PATH_PREFIX } from './ortRuntimePaths';
import { createPaddleOcrWorker } from './paddleOcrWorker';

const KOREAN_REC_MODEL_NAME = 'korean_PP-OCRv5_mobile_rec';
const DET_MODEL_NAME = 'PP-OCRv5_mobile_det';
const DET_MODEL_ASSET = '/models/paddleocr/PP-OCRv5_mobile_det_onnx.tar';
const KOREAN_REC_MODEL_ASSET = '/models/paddleocr/korean_PP-OCRv5_mobile_rec_onnx.tar';
const DEFAULT_BACKEND: OcrBackend = 'auto';
const ROTATION_FALLBACKS = [90, 270, 180] as const;
const MIN_ACCEPTABLE_OCR_SCORE = 4;
const MIN_CONFIDENT_TEXT_SCORE = 0.75;
const VERTICAL_TEXT_RATIO_FOR_ROTATION_PROBE = 0.5;
const VERTICAL_LINE_ASPECT_RATIO = 1.5;
const VERTICAL_SELECTION_PENALTY = 0.35;
const MIN_NOISE_CHECK_ITEM_COUNT = 8;
const MIN_NOISE_CHECK_TEXT_CHARS = 32;
const SHORT_LINE_MAX_CHARS = 2;
const SHORT_LINE_RATIO_FOR_ROTATION_PROBE = 0.45;
const SYMBOL_RATIO_FOR_ROTATION_PROBE = 0.28;
const WORDLIKE_RATIO_FOR_ROTATION_PROBE = 0.55;
const TEXT_QUALITY_SCORE_FOR_ROTATION_PROBE = 0.7;
const TEXT_QUALITY_MIN_SCORE = 0.2;

type OcrRotation = 0 | (typeof ROTATION_FALLBACKS)[number];

type OcrEngine = {
  predict(input: Blob): Promise<OcrResult[]>;
  dispose?: () => Promise<void>;
};

type RotatedBlob = {
  blob: Blob;
  originalWidth: number;
  originalHeight: number;
  rotation: Exclude<OcrRotation, 0>;
};

type OcrResultSummary = {
  rotation: OcrRotation;
  itemCount: number;
  nonEmptyLineCount: number;
  textChars: number;
  textScore: number;
  meanConfidence: number;
  verticalTextRatio: number;
  shortLineRatio: number;
  symbolRatio: number;
  wordlikeRatio: number;
  textQualityScore: number;
  selectionScore: number;
};

type RotationCandidate = {
  rotation: OcrRotation;
  result: OcrResult | undefined;
  summary: OcrResultSummary;
};

type RotationDiagnostics = {
  pageIndex: number;
  selectedRotation: OcrRotation;
  reason: string;
  probeReasons: string[];
  candidates: OcrResultSummary[];
};

const engines = new Map<OcrBackend, Promise<OcrEngine>>();

const api: OcrWorkerApi = {
  async warmup(backend = DEFAULT_BACKEND) {
    await getOcrEngine(backend);
    return { backend };
  },
  async recognizePng({ pageIndex, png, backend = DEFAULT_BACKEND }) {
    const bytes = new Uint8Array(png);
    const blob = new Blob([bytes], { type: 'image/png' });
    try {
      return await recognizeBlob(pageIndex, blob, backend);
    } catch (error) {
      if (backend !== 'wasm' && isWasmMemoryBoundsError(error)) {
        await disposeEngine(backend);
        return recognizeBlob(pageIndex, blob, 'wasm');
      }
      throw error;
    }
  },
  async dispose(backend) {
    if (backend) {
      await disposeEngine(backend);
      return;
    }

    await Promise.all(Array.from(engines.keys()).map((key) => disposeEngine(key)));
  },
};

async function recognizeBlob(pageIndex: number, blob: Blob, backend: OcrBackend) {
  const engine = await getOcrEngine(backend);
  const [result] = await engine.predict(blob);
  const original = buildRotationCandidate(0, result);
  const candidates: RotationCandidate[] = [original];
  const probeReasons = getRotationProbeReasons(original.summary);
  const shouldProbe = probeReasons.length > 0;

  if (shouldProbe) {
    for (const rotation of ROTATION_FALLBACKS) {
      const rotated = await rotateBlob(blob, rotation);
      if (!rotated) continue;

      const [rotatedResult] = await engine.predict(rotated.blob);
      const mappedResult = rotatedResult
        ? mapRotatedResultToOriginal(rotatedResult, rotated)
        : undefined;
      const candidate = buildRotationCandidate(rotation, mappedResult, rotatedResult);
      candidates.push(candidate);
      if (isConfidentHorizontalResult(candidate.summary)) break;
    }
  }

  const selected = selectBestRotationCandidate(candidates);
  const diagnostics = buildRotationDiagnostics(pageIndex, selected, candidates, probeReasons);
  logRotationDiagnostics(diagnostics);

  return selected.result
    ? normalizeOcrResult(
        withRotationRuntime(selected.result, selected.rotation, diagnostics),
        pageIndex,
      )
    : { lines: [] };
}

async function disposeEngine(backend: OcrBackend): Promise<void> {
  const engine = engines.get(backend);
  if (!engine) return;
  engines.delete(backend);

  let resolved: OcrEngine;
  try {
    resolved = await engine;
  } catch {
    return;
  }
  await resolved.dispose?.();
}

function isWasmMemoryBoundsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes('memory access out of bounds');
}

async function getOcrEngine(backend: OcrBackend): Promise<OcrEngine> {
  let engine = engines.get(backend);
  if (!engine) {
    engine = createOcrEngine(backend);
    engines.set(backend, engine);
  }
  return engine;
}

async function createOcrEngine(backend: OcrBackend): Promise<OcrEngine> {
  installOrtWarningFilter();

  const { PaddleOCR } = await import('@paddleocr/paddleocr-js');
  return PaddleOCR.create({
    worker: { createWorker: createPaddleOcrWorker },
    textDetectionModelName: DET_MODEL_NAME,
    textDetectionModelAsset: { url: DET_MODEL_ASSET },
    textRecognitionModelName: KOREAN_REC_MODEL_NAME,
    textRecognitionModelAsset: { url: KOREAN_REC_MODEL_ASSET },
    ortOptions: {
      backend,
      wasmPaths: PADDLE_OCR_ORT_WASM_PATH_PREFIX,
      numThreads: 1,
      simd: true,
    },
  });
}

expose(api);

async function rotateBlob(blob: Blob, rotation: Exclude<OcrRotation, 0>): Promise<RotatedBlob | null> {
  if (
    typeof createImageBitmap !== 'function' ||
    typeof OffscreenCanvas === 'undefined'
  ) {
    return null;
  }

  const bitmap = await createImageBitmap(blob);
  try {
    const originalWidth = bitmap.width;
    const originalHeight = bitmap.height;
    const swapped = rotation === 90 || rotation === 270;
    const canvas = new OffscreenCanvas(
      swapped ? originalHeight : originalWidth,
      swapped ? originalWidth : originalHeight,
    );
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    applyCanvasRotation(ctx, rotation, originalWidth, originalHeight);
    ctx.drawImage(bitmap, 0, 0);

    return {
      blob: await canvas.convertToBlob({ type: 'image/png' }),
      originalWidth,
      originalHeight,
      rotation,
    };
  } finally {
    bitmap.close();
  }
}

function applyCanvasRotation(
  ctx: OffscreenCanvasRenderingContext2D,
  rotation: Exclude<OcrRotation, 0>,
  originalWidth: number,
  originalHeight: number,
): void {
  if (rotation === 90) {
    ctx.translate(originalHeight, 0);
    ctx.rotate(Math.PI / 2);
    return;
  }

  if (rotation === 180) {
    ctx.translate(originalWidth, originalHeight);
    ctx.rotate(Math.PI);
    return;
  }

  ctx.translate(0, originalWidth);
  ctx.rotate(-Math.PI / 2);
}

function mapRotatedResultToOriginal(result: OcrResult, rotated: RotatedBlob): OcrResult {
  return {
    ...result,
    image: {
      width: rotated.originalWidth,
      height: rotated.originalHeight,
    },
    items: result.items.map((item) => ({
      ...item,
      poly: item.poly.map(([x, y]) =>
        mapRotatedPointToOriginal(x, y, rotated.rotation, rotated.originalWidth, rotated.originalHeight),
      ),
    })),
  };
}

function mapRotatedPointToOriginal(
  x: number,
  y: number,
  rotation: OcrRotation,
  originalWidth: number,
  originalHeight: number,
): [number, number] {
  if (rotation === 90) return [y, originalHeight - x];
  if (rotation === 180) return [originalWidth - x, originalHeight - y];
  if (rotation === 270) return [originalWidth - y, x];
  return [x, y];
}

function buildRotationCandidate(
  rotation: OcrRotation,
  result: OcrResult | undefined,
  summarySource = result,
): RotationCandidate {
  return {
    rotation,
    result,
    summary: summarizeOcrResult(summarySource, rotation),
  };
}

function summarizeOcrResult(result: OcrResult | undefined, rotation: OcrRotation): OcrResultSummary {
  const items = result?.items ?? [];
  let textChars = 0;
  let textScore = 0;
  let confidenceSum = 0;
  let verticalTextChars = 0;
  let nonEmptyLineCount = 0;
  let shortLineCount = 0;
  let symbolChars = 0;
  let wordlikeChars = 0;
  let classifiedChars = 0;

  for (const item of items) {
    const text = item.text.trim();
    const chars = Array.from(text);
    const charCount = chars.length;
    if (charCount === 0) continue;
    const confidence = typeof item.score === 'number' ? item.score : 0.5;
    nonEmptyLineCount += 1;
    if (charCount <= SHORT_LINE_MAX_CHARS) shortLineCount += 1;

    for (const char of chars) {
      if (/\s/.test(char)) continue;
      classifiedChars += 1;
      if (isWordlikeOcrChar(char)) {
        wordlikeChars += 1;
      } else {
        symbolChars += 1;
      }
    }

    textChars += charCount;
    textScore += charCount * confidence;
    confidenceSum += charCount * confidence;
    if (isVerticalTextLine(item.poly)) verticalTextChars += charCount;
  }

  const meanConfidence = textChars === 0 ? 0 : confidenceSum / textChars;
  const verticalTextRatio = textChars === 0 ? 0 : verticalTextChars / textChars;
  const shortLineRatio = nonEmptyLineCount === 0 ? 0 : shortLineCount / nonEmptyLineCount;
  const symbolRatio = classifiedChars === 0 ? 0 : symbolChars / classifiedChars;
  const wordlikeRatio = classifiedChars === 0 ? 0 : wordlikeChars / classifiedChars;
  const textQualityScore =
    textChars === 0 ? 1 : scoreOcrTextQuality(shortLineRatio, symbolRatio, wordlikeRatio);
  const selectionScore =
    textScore * (1 - verticalTextRatio * VERTICAL_SELECTION_PENALTY) * textQualityScore;

  return {
    rotation,
    itemCount: items.length,
    nonEmptyLineCount,
    textChars,
    textScore: roundDiagnosticNumber(textScore),
    meanConfidence: roundDiagnosticNumber(meanConfidence),
    verticalTextRatio: roundDiagnosticNumber(verticalTextRatio),
    shortLineRatio: roundDiagnosticNumber(shortLineRatio),
    symbolRatio: roundDiagnosticNumber(symbolRatio),
    wordlikeRatio: roundDiagnosticNumber(wordlikeRatio),
    textQualityScore: roundDiagnosticNumber(textQualityScore),
    selectionScore: roundDiagnosticNumber(selectionScore),
  };
}

function getRotationProbeReasons(summary: OcrResultSummary): string[] {
  const reasons: string[] = [];
  if (summary.textScore < MIN_ACCEPTABLE_OCR_SCORE) reasons.push('low-text-score');
  if (summary.meanConfidence < MIN_CONFIDENT_TEXT_SCORE) reasons.push('low-confidence');
  if (summary.verticalTextRatio >= VERTICAL_TEXT_RATIO_FOR_ROTATION_PROBE) {
    reasons.push('vertical-text');
  }
  if (hasNoisyOcrText(summary)) reasons.push('noisy-text');
  return reasons;
}

function hasNoisyOcrText(summary: OcrResultSummary): boolean {
  if (
    summary.nonEmptyLineCount < MIN_NOISE_CHECK_ITEM_COUNT ||
    summary.textChars < MIN_NOISE_CHECK_TEXT_CHARS
  ) {
    return false;
  }

  return (
    summary.shortLineRatio >= SHORT_LINE_RATIO_FOR_ROTATION_PROBE ||
    summary.symbolRatio >= SYMBOL_RATIO_FOR_ROTATION_PROBE ||
    summary.wordlikeRatio <= WORDLIKE_RATIO_FOR_ROTATION_PROBE ||
    summary.textQualityScore <= TEXT_QUALITY_SCORE_FOR_ROTATION_PROBE
  );
}

function isConfidentHorizontalResult(summary: OcrResultSummary): boolean {
  return (
    summary.textScore >= MIN_ACCEPTABLE_OCR_SCORE &&
    summary.meanConfidence >= MIN_CONFIDENT_TEXT_SCORE &&
    summary.verticalTextRatio < VERTICAL_TEXT_RATIO_FOR_ROTATION_PROBE &&
    !hasNoisyOcrText(summary)
  );
}

function selectBestRotationCandidate(candidates: RotationCandidate[]): RotationCandidate {
  return candidates.reduce((best, candidate) =>
    candidate.summary.selectionScore > best.summary.selectionScore ? candidate : best,
  );
}

function buildRotationDiagnostics(
  pageIndex: number,
  selected: RotationCandidate,
  candidates: RotationCandidate[],
  probeReasons: string[],
): RotationDiagnostics {
  return {
    pageIndex,
    selectedRotation: selected.rotation,
    reason: rotationSelectionReason(selected, candidates, probeReasons.length > 0),
    probeReasons,
    candidates: candidates.map((candidate) => candidate.summary),
  };
}

function rotationSelectionReason(
  selected: RotationCandidate,
  candidates: RotationCandidate[],
  probedRotations: boolean,
): string {
  if (!probedRotations) return 'original-confident';
  if (candidates.length === 1) return 'rotation-probe-unavailable';
  return selected.rotation === 0
    ? 'original-selected-after-rotation-probe'
    : 'rotated-selected-after-rotation-probe';
}

function logRotationDiagnostics(diagnostics: RotationDiagnostics): void {
  console.info('[ocr.worker] rotation diagnostics', diagnostics);
}

function isVerticalTextLine(poly: Array<[number, number]>): boolean {
  const xs = poly.map(([x]) => x);
  const ys = poly.map(([, y]) => y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  return height / Math.max(1, width) >= VERTICAL_LINE_ASPECT_RATIO;
}

function isWordlikeOcrChar(char: string): boolean {
  return /[0-9A-Za-z가-힣]/.test(char);
}

function scoreOcrTextQuality(
  shortLineRatio: number,
  symbolRatio: number,
  wordlikeRatio: number,
): number {
  const shortLinePenalty = Math.max(0, shortLineRatio - 0.25) * 1.25;
  const symbolPenalty = Math.max(0, symbolRatio - 0.2) * 0.9;
  const wordlikePenalty = Math.max(0, 0.58 - wordlikeRatio) * 0.8;
  return clamp(1 - shortLinePenalty - symbolPenalty - wordlikePenalty, TEXT_QUALITY_MIN_SCORE, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundDiagnosticNumber(value: number): number {
  return Number(value.toFixed(4));
}

function withRotationRuntime(
  result: OcrResult,
  rotation: OcrRotation,
  diagnostics: RotationDiagnostics,
): OcrResult {
  return {
    ...result,
    runtime: {
      ...result.runtime,
      rotationApplied: rotation,
      rotationDiagnostics: diagnostics,
    } as OcrResult['runtime'],
  };
}
