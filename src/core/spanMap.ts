/**
 * 텍스트 ↔ PDF 좌표 매핑.
 *
 * mupdf 의 structured text 출력(라인 → span → char + bbox)을 받아 두 가지 산출물을 만든다:
 * 1. `pageText` — 단일 문자열. NER 모델 입력으로 그대로 들어간다.
 * 2. `charIndex` — `pageText` 의 각 char offset 마다 원본 PDF bbox/lineId/spanId 를
 *    매핑한 배열. NER 출력의 entity start/end (char offset 기준)를 PDF 좌표로 역변환할
 *    때 사용한다.
 *
 * 모든 좌표는 PDF point. 라인 사이에는 `\n` 을 삽입해 NER 모델이 라인 경계를 인식할 수
 * 있게 한다.
 */

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CharIndexEntry {
  pageTextOffset: number;
  pdfBbox: BBox;
  lineId: number;
  spanId: number;
  /** 줄 경계로 추가된 '\n' 인지 */
  isLineBreak: boolean;
}

export interface PageMap {
  pageText: string;
  charIndex: CharIndexEntry[];
}

export interface StructuredLine {
  id: number;
  spans: Array<{
    id: number;
    chars: Array<{ ch: string; bbox: BBox }>;
  }>;
}

export interface NerEntity {
  entity_group: string;
  start: number;
  end: number;
  score: number;
}

export interface NerBox {
  category: string;
  bbox: BBox;
  score: number;
}

/**
 * NER entity (char offset 기준) 들을 PDF bbox 묶음으로 변환한다.
 *
 * 한 entity 가 여러 라인을 가로지르면 라인별로 분할해 각 라인마다 한 박스를 만든다
 * (단일 박스로 합치면 라인 사이의 빈 공간까지 가려져 부자연스럽다).
 */
export function entitiesToBoxes(map: PageMap, entities: NerEntity[]): NerBox[] {
  const result: NerBox[] = [];
  for (const e of entities) {
    const slice = map.charIndex.filter(
      (c) => c.pageTextOffset >= e.start && c.pageTextOffset < e.end && !c.isLineBreak,
    );
    if (slice.length === 0) continue;
    const byLine = new Map<number, CharIndexEntry[]>();
    for (const c of slice) {
      const arr = byLine.get(c.lineId) ?? [];
      arr.push(c);
      byLine.set(c.lineId, arr);
    }
    for (const group of byLine.values()) {
      const xs = group.map((c) => c.pdfBbox.x);
      const ys = group.map((c) => c.pdfBbox.y);
      const xe = group.map((c) => c.pdfBbox.x + c.pdfBbox.w);
      const ye = group.map((c) => c.pdfBbox.y + c.pdfBbox.h);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const w = Math.max(...xe) - x;
      const h = Math.max(...ye) - y;
      result.push({ category: e.entity_group, bbox: { x, y, w, h }, score: e.score });
    }
  }
  return result;
}

/**
 * mupdf bridge 의 `extractLines` 가 내놓는 라인 단위 텍스트 + char bbox 배열을
 * `StructuredLine[]` (line → span → char 트리)로 변환한다.
 *
 * mupdf bridge 는 라인 단위만 노출하고 span 단위는 구분하지 않으므로 라인 하나당
 * span 하나로 매핑한다. NER 입력으로 쓰기에는 라인 경계만 보존되면 충분하다.
 *
 * mupdf 는 string index (UTF-16 code unit) 기준으로 charBboxes 를 패딩한다는 보장이
 * 있지만, 실측 안전을 위해 두 길이의 min 만큼만 매핑한다.
 */
export function adaptToStructuredLines(
  rawLines: ReadonlyArray<{
    text: string;
    charBboxes: ReadonlyArray<readonly [number, number, number, number]>;
  }>,
): StructuredLine[] {
  return rawLines.map((rl, lineIdx) => {
    const N = Math.min(rl.text.length, rl.charBboxes.length);
    const chars: Array<{ ch: string; bbox: BBox }> = [];
    for (let i = 0; i < N; i += 1) {
      const bb = rl.charBboxes[i]!;
      chars.push({
        ch: rl.text[i]!,
        bbox: { x: bb[0], y: bb[1], w: bb[2] - bb[0], h: bb[3] - bb[1] },
      });
    }
    return { id: lineIdx, spans: [{ id: lineIdx, chars }] };
  });
}

export function serialize(lines: StructuredLine[]): PageMap {
  let pageText = '';
  const charIndex: CharIndexEntry[] = [];
  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) {
      // 줄 경계 — 직전 char 의 bbox 를 재사용 (없으면 영역 0)
      const prev = charIndex[charIndex.length - 1];
      charIndex.push({
        pageTextOffset: pageText.length,
        pdfBbox: prev?.pdfBbox ?? { x: 0, y: 0, w: 0, h: 0 },
        lineId: line.id,
        spanId: -1,
        isLineBreak: true,
      });
      pageText += '\n';
    }
    for (const span of line.spans) {
      for (const c of span.chars) {
        charIndex.push({
          pageTextOffset: pageText.length,
          pdfBbox: c.bbox,
          lineId: line.id,
          spanId: span.id,
          isLineBreak: false,
        });
        pageText += c.ch;
      }
    }
  });
  return { pageText, charIndex };
}
