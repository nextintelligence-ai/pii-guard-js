import type { BBox, CharIndexEntry, PageMap, StructuredLine } from '@/core/spanMap';

type SourceChar = {
  ch: string;
  bbox: BBox;
  lineId: number;
  spanId: number;
};

type SourceLine = {
  id: number;
  text: string;
  chars: SourceChar[];
};

type ContextChar = SourceChar & {
  emitBox: boolean;
};

const TABLE_HEADERS = new Set(['분야별', '성명', '직위', '소속', '연락처']);
const NON_NAME_WORDS = new Set([
  '대표',
  '대표이사',
  '부장',
  '차장',
  '대리',
  '과장',
  '팀장',
  '실장',
  '본부장',
  '이사',
  '상무',
  '전무',
  '사장',
  '책임',
  '수석',
  '선임',
  '연구원',
  '주임',
  '인턴',
  '관계',
  '코드',
  '자료',
  '구분',
  '국세청',
  '기타',
  '국세청계',
  '기타계',
]);

/**
 * PDF 표가 줄 단위 텍스트로 풀리면 페이지 전체 NER 에서 이름 recall 이 떨어진다.
 *
 * `성명/직위/연락처` 헤더가 있는 연락망 표는 성명 후보 라인만 모아 별도 NER 입력으로
 * 재구성한다. 탐지는 여전히 NER 모델이 결정하고, charIndex 는 원본 PDF bbox 를 가리켜
 * 기존 entitiesToBoxes 변환을 그대로 쓸 수 있다.
 */
export function buildContextualNerMaps(lines: StructuredLine[]): PageMap[] {
  const sourceLines = lines.map(toSourceLine).filter((line) => line.text.trim().length > 0);
  const maps: PageMap[] = [];

  const headerIndex = sourceLines.findIndex((line) => line.text.trim() === '성명');
  if (headerIndex >= 0 && hasContactTableHeaders(sourceLines, headerIndex)) {
    const bodyStart = findBodyStart(sourceLines, headerIndex);
    const candidateLines = sourceLines
      .slice(bodyStart)
      .map(trimSourceLine)
      .filter((line) => isLikelyNameContextLine(line.text));

    if (candidateLines.length >= 2) {
      const headerLine = trimSourceLine(sourceLines[headerIndex]!);
      maps.push(buildMapFromSourceLines([headerLine, ...candidateLines]));
    }
  }

  const deductionTableMap = buildDeductionTableNameMap(sourceLines);
  if (deductionTableMap) maps.push(deductionTableMap);

  const splitNameMap = buildSplitNameLabelMap(sourceLines);
  if (splitNameMap) maps.push(splitNameMap);

  const identityTableMaps = buildIdentityTableNameMaps(sourceLines);
  maps.push(...identityTableMaps);

  const nextLineNameMaps = buildNextLineNameLabelMaps(sourceLines);
  maps.push(...nextLineNameMaps);

  const signatureNameMaps = buildSignatureNameMaps(sourceLines);
  maps.push(...signatureNameMaps);

  return maps;
}

function buildDeductionTableNameMap(lines: SourceLine[]): PageMap | null {
  const headerIndex = lines.findIndex((line, index) => {
    const trimmed = trimSourceLine(line);
    return isNameLabelLine(trimmed.text) && hasDeductionTableHeaders(lines, index);
  });
  if (headerIndex < 0) return null;

  const bodyStart = findDeductionTableBodyStart(lines, headerIndex);
  const bodyEnd = findDeductionTableBodyEnd(lines, bodyStart);
  const nameLines: SourceLine[] = [];

  for (let i = bodyStart; i < bodyEnd; i += 1) {
    const nameLine = trimSourceLine(lines[i]!);
    if (!isLikelyNameContextLine(nameLine.text)) continue;
    if (!hasDeductionPersonRowEvidence(lines, i, bodyEnd)) continue;
    nameLines.push(nameLine);
  }

  if (nameLines.length === 0) return null;
  return buildRepeatedNameLabelMap('성명: ', nameLines);
}

function buildIdentityTableNameMaps(lines: SourceLine[]): PageMap[] {
  const maps: PageMap[] = [];

  for (let i = 0; i < lines.length - 3; i += 1) {
    const nameLabelLine = trimSourceLine(lines[i]!);
    const residentLabelLine = trimSourceLine(lines[i + 1]!);
    if (!isNameLabelLine(nameLabelLine.text)) continue;
    if (!isResidentIdLabelLine(residentLabelLine.text)) continue;

    const nameLine = trimSourceLine(lines[i + 2]!);
    if (!isLikelyNameContextLine(nameLine.text)) continue;

    const residentIdLine = trimSourceLine(lines[i + 3]!);
    if (!isLikelyResidentIdContextLine(residentIdLine.text)) continue;

    maps.push(
      buildMapFromContextChars([
        ...nameLabelLine.chars.map(toIgnoredContextChar),
        ...syntheticIgnoredText(': ', nameLine),
        ...nameLine.chars.map(toEmittedContextChar),
      ]),
    );
  }

  return maps;
}

function buildNextLineNameLabelMaps(lines: SourceLine[]): PageMap[] {
  const maps: PageMap[] = [];

  for (let i = 0; i < lines.length - 1; i += 1) {
    const labelLine = trimSourceLine(lines[i]!);
    if (!isNameLabelLine(labelLine.text)) continue;

    const nameLine = trimSourceLine(lines[i + 1]!);
    if (!isLikelyNameContextLine(nameLine.text)) continue;
    if (!hasNextLineNameContext(lines, i)) continue;

    const separator = isUserNameLabelLine(labelLine.text)
      ? syntheticIgnoredText(': ', nameLine)
      : [syntheticIgnoredSpace(nameLine)];
    maps.push(
      buildMapFromContextChars([
        ...labelLine.chars.map(toIgnoredContextChar),
        ...separator,
        ...nameLine.chars.map(toEmittedContextChar),
      ]),
    );
  }

  return maps;
}

function buildSignatureNameMaps(lines: SourceLine[]): PageMap[] {
  const maps: PageMap[] = [];

  for (let i = 0; i < lines.length - 1; i += 1) {
    const labelLine = trimSourceLine(lines[i]!);
    if (labelLine.text !== '제출자') continue;

    const signedLine = trimSourceLine(lines[i + 1]!);
    const split = splitLeadingNameContextLine(signedLine);
    if (!split || !signedLine.text.includes('서명')) continue;

    maps.push(
      buildMapFromContextChars([
        ...labelLine.chars.map(toIgnoredContextChar),
        syntheticIgnoredSpace(split.name),
        ...split.name.chars.map(toEmittedContextChar),
        ...split.suffix.chars.map(toIgnoredContextChar),
      ]),
    );
  }

  return maps;
}

function buildSplitNameLabelMap(lines: SourceLine[]): PageMap | null {
  for (let i = 0; i < lines.length - 2; i += 1) {
    const current = trimSourceLine(lines[i]!);
    const next = trimSourceLine(lines[i + 1]!);
    if (current.text !== '성' || next.text !== '명') continue;

    const nameLine = trimSourceLine(lines[i + 2]!);
    if (!isLikelyNameContextLine(nameLine.text)) continue;
    if (!hasCertificateNameContext(lines, i)) continue;

    return buildMapFromContextChars([
      ...current.chars.map(toIgnoredContextChar),
      ...next.chars.map(toIgnoredContextChar),
      syntheticIgnoredSpace(nameLine),
      ...nameLine.chars.map(toEmittedContextChar),
    ]);
  }

  return null;
}

function hasCertificateNameContext(lines: SourceLine[], labelIndex: number): boolean {
  const nearbyBefore = lines
    .slice(Math.max(0, labelIndex - 4), labelIndex)
    .map((line) => line.text.trim());
  const nearbyAfter = lines
    .slice(labelIndex + 2, Math.min(lines.length, labelIndex + 6))
    .map((line) => line.text.trim());

  return nearbyBefore.includes('신청대상자') || nearbyAfter.includes('주민등록번호');
}

function hasNextLineNameContext(lines: SourceLine[], labelIndex: number): boolean {
  const nearby = lines
    .slice(Math.max(0, labelIndex - 4), Math.min(lines.length, labelIndex + 6))
    .map((line) => line.text.trim());
  return nearby.some(isResidentIdLabelLine);
}

function isNameLabelLine(text: string): boolean {
  const compact = text.replace(/\s+/g, '');
  return compact.endsWith('성명') || compact === '소득자성명' || isUserNameLabelLine(text);
}

function isUserNameLabelLine(text: string): boolean {
  return text.replace(/\s+/g, '') === '사용자명';
}

function isResidentIdLabelLine(text: string): boolean {
  return text.replace(/\s+/g, '').includes('주민등록번호');
}

function isLikelyResidentIdContextLine(text: string): boolean {
  return /^\d{6}-(?:\d{7}|\*{7})$/.test(text.trim());
}

function hasContactTableHeaders(lines: SourceLine[], headerIndex: number): boolean {
  const nearby = lines
    .slice(Math.max(0, headerIndex - 3), Math.min(lines.length, headerIndex + 6))
    .map((line) => line.text.trim());
  return nearby.includes('직위') && nearby.includes('연락처');
}

function findBodyStart(lines: SourceLine[], headerIndex: number): number {
  let lastHeaderIndex = headerIndex;
  for (let i = headerIndex; i < Math.min(lines.length, headerIndex + 8); i += 1) {
    if (TABLE_HEADERS.has(lines[i]!.text.trim())) lastHeaderIndex = i;
  }
  return lastHeaderIndex + 1;
}

function isLikelyNameContextLine(text: string): boolean {
  const trimmed = text.trim();
  if (!/^[가-힣]{2,4}$/.test(trimmed)) return false;
  if (TABLE_HEADERS.has(trimmed) || NON_NAME_WORDS.has(trimmed.replace(/\s+/g, ''))) {
    return false;
  }
  return true;
}

function hasDeductionTableHeaders(lines: SourceLine[], headerIndex: number): boolean {
  const before = lines
    .slice(Math.max(0, headerIndex - 6), headerIndex)
    .map((line) => line.text.trim());
  const after = lines
    .slice(headerIndex + 1, Math.min(lines.length, headerIndex + 24))
    .map((line) => line.text.trim());

  return (
    before.includes('인적공제 항목') &&
    before.includes('관계') &&
    after.includes('주민등록번호') &&
    after.includes('자료') &&
    after.includes('구분')
  );
}

function findDeductionTableBodyStart(lines: SourceLine[], headerIndex: number): number {
  for (let i = headerIndex + 1; i < Math.min(lines.length, headerIndex + 120); i += 1) {
    if (lines[i]!.text.trim() === '기타 계') return i + 1;
  }
  return headerIndex + 1;
}

function findDeductionTableBodyEnd(lines: SourceLine[], bodyStart: number): number {
  for (let i = bodyStart; i < lines.length; i += 1) {
    if (lines[i]!.text.trim() === '각종 소득·세액 공제 항목') return i;
  }
  return lines.length;
}

function hasDeductionPersonRowEvidence(
  lines: SourceLine[],
  nameIndex: number,
  bodyEnd: number,
): boolean {
  const rowWindow = lines
    .slice(nameIndex + 1, Math.min(bodyEnd, nameIndex + 24))
    .map((line) => line.text.trim());
  const hasSourceType = rowWindow.includes('국세청') || rowWindow.includes('기타');
  const hasIdentityMarker =
    rowWindow.some(isLikelyResidentIdContextLine) ||
    rowWindow.some((text) => text.includes('근로자 본인'));
  return hasSourceType && hasIdentityMarker;
}

function toSourceLine(line: StructuredLine): SourceLine {
  const chars: SourceChar[] = [];
  let text = '';
  for (const span of line.spans) {
    for (const c of span.chars) {
      text += c.ch;
      chars.push({
        ch: c.ch,
        bbox: c.bbox,
        lineId: line.id,
        spanId: span.id,
      });
    }
  }
  return { id: line.id, text, chars };
}

function trimSourceLine(line: SourceLine): SourceLine {
  let start = 0;
  let end = line.chars.length;
  while (start < end && /\s/.test(line.chars[start]?.ch ?? '')) start += 1;
  while (end > start && /\s/.test(line.chars[end - 1]?.ch ?? '')) end -= 1;
  const chars = line.chars.slice(start, end);
  return {
    id: line.id,
    text: chars.map((c) => c.ch).join(''),
    chars,
  };
}

function splitLeadingNameContextLine(
  line: SourceLine,
): { name: SourceLine; suffix: SourceLine } | null {
  const match = /^[가-힣]{2,4}/.exec(line.text);
  if (!match) return null;
  const nameText = match[0];
  if (!isLikelyNameContextLine(nameText)) return null;

  const nameChars = line.chars.slice(0, nameText.length);
  const suffixChars = line.chars.slice(nameText.length);
  return {
    name: {
      id: line.id,
      text: nameChars.map((c) => c.ch).join(''),
      chars: nameChars,
    },
    suffix: {
      id: line.id,
      text: suffixChars.map((c) => c.ch).join(''),
      chars: suffixChars,
    },
  };
}

function buildRepeatedNameLabelMap(labelText: string, nameLines: SourceLine[]): PageMap {
  const chars: ContextChar[] = [];

  nameLines.forEach((nameLine, index) => {
    if (index > 0) chars.push(...syntheticIgnoredText('\n', nameLine));
    chars.push(...syntheticIgnoredText(labelText, nameLine));
    chars.push(...nameLine.chars.map(toEmittedContextChar));
  });

  return buildMapFromContextChars(chars);
}

function buildMapFromSourceLines(lines: SourceLine[]): PageMap {
  let pageText = '';
  const charIndex: CharIndexEntry[] = [];

  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) {
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

    for (const c of line.chars) {
      charIndex.push({
        pageTextOffset: pageText.length,
        pdfBbox: c.bbox,
        lineId: c.lineId,
        spanId: c.spanId,
        isLineBreak: false,
      });
      pageText += c.ch;
    }
  });

  return { pageText, charIndex };
}

function buildMapFromContextChars(chars: ContextChar[]): PageMap {
  let pageText = '';
  const charIndex: CharIndexEntry[] = [];

  for (const c of chars) {
    charIndex.push({
      pageTextOffset: pageText.length,
      pdfBbox: c.bbox,
      lineId: c.lineId,
      spanId: c.spanId,
      isLineBreak: !c.emitBox,
    });
    pageText += c.ch;
  }

  return { pageText, charIndex };
}

function toIgnoredContextChar(c: SourceChar): ContextChar {
  return { ...c, emitBox: false };
}

function toEmittedContextChar(c: SourceChar): ContextChar {
  return { ...c, emitBox: true };
}

function syntheticIgnoredSpace(anchor: SourceLine): ContextChar {
  return syntheticIgnoredText(' ', anchor)[0]!;
}

function syntheticIgnoredText(text: string, anchor: SourceLine): ContextChar[] {
  const first = anchor.chars[0];
  return [...text].map((ch) => ({
    ch,
    bbox: first?.bbox ?? { x: 0, y: 0, w: 0, h: 0 },
    lineId: anchor.id,
    spanId: -1,
    emitBox: false,
  }));
}
