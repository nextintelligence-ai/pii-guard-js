import {
  entitiesToBoxes,
  serialize,
  type NerBox,
  type NerEntity,
  type StructuredLine,
} from '@/core/spanMap';
import type { Bbox } from '@/types/domain';
import { lineToDetectorLine, ocrPixelBboxToPdfBbox } from './geometry';
import type { OcrLine } from './types';

export function ocrLinesToNerBoxes(input: {
  lines: OcrLine[];
  renderScale: number;
  entities: NerEntity[];
}): NerBox[] {
  const structured = ocrLinesToStructuredLines(input.lines, input.renderScale);
  return entitiesToBoxes(serialize(structured), input.entities);
}

export function ocrLinesToPageText(input: {
  lines: OcrLine[];
  renderScale: number;
}): { pageText: string; structured: StructuredLine[] } {
  const structured = ocrLinesToStructuredLines(input.lines, input.renderScale);
  return { pageText: serialize(structured).pageText, structured };
}

function ocrLinesToStructuredLines(lines: OcrLine[], renderScale: number): StructuredLine[] {
  return lines.map((line, lineIndex) => {
    const detectorLine = lineToDetectorLine(line);
    const chars: Array<{ ch: string; bbox: { x: number; y: number; w: number; h: number } }> = [];
    const count = Math.min(detectorLine.text.length, detectorLine.charBboxes.length);
    for (let i = 0; i < count; i += 1) {
      const bbox = toStructuredBbox(
        ocrPixelBboxToPdfBbox(detectorLine.charBboxes[i]!, renderScale),
      );
      chars.push({ ch: detectorLine.text[i]!, bbox });
    }
    return { id: lineIndex, spans: [{ id: 0, chars }] };
  });
}

function toStructuredBbox(bbox: Bbox): { x: number; y: number; w: number; h: number } {
  return {
    x: bbox[0],
    y: bbox[1],
    w: bbox[2] - bbox[0],
    h: bbox[3] - bbox[1],
  };
}
