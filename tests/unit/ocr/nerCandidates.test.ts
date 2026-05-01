import { describe, expect, it, vi } from 'vitest';
import type { NerBox } from '@/core/spanMap';
import type { Candidate } from '@/types/domain';
import { filterOcrNerBoxes, nerBoxesToCandidates } from '@/core/ocr/nerCandidates';

vi.mock('@/utils/id', () => ({
  createId: vi
    .fn()
    .mockReturnValueOnce('candidate-1')
    .mockReturnValueOnce('candidate-2')
    .mockReturnValueOnce('candidate-3'),
}));

const baseBox: NerBox = {
  category: 'private_person',
  bbox: { x: 10, y: 20, w: 30, h: 10 },
  score: 0.91,
};

function primaryCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: 'primary-1',
    pageIndex: 0,
    bbox: [10, 20, 40, 30],
    text: '서울특별시',
    category: 'address',
    confidence: 1,
    source: 'ocr',
    ...overrides,
  };
}

describe('filterOcrNerBoxes', () => {
  it('keeps supported OCR-NER categories with usable boxes', () => {
    expect(
      filterOcrNerBoxes({
        pageIndex: 0,
        boxes: [baseBox],
        primaryCandidates: [],
      }),
    ).toEqual([baseBox]);
  });

  it('drops structured categories that regex/OCR detectors own', () => {
    const boxes: NerBox[] = [
      { ...baseBox, category: 'private_email' },
      { ...baseBox, category: 'private_phone' },
      { ...baseBox, category: 'account_number' },
      { ...baseBox, category: 'private_person' },
    ];

    expect(
      filterOcrNerBoxes({
        pageIndex: 0,
        boxes,
        primaryCandidates: [],
      }),
    ).toEqual([{ ...baseBox, category: 'private_person' }]);
  });

  it('drops boxes with non-finite or zero-area coordinates', () => {
    const boxes: NerBox[] = [
      { ...baseBox, bbox: { x: Number.NaN, y: 0, w: 10, h: 10 } },
      { ...baseBox, bbox: { x: 0, y: 0, w: 0, h: 10 } },
      { ...baseBox, bbox: { x: 0, y: 0, w: 10, h: 0 } },
      baseBox,
    ];

    expect(
      filterOcrNerBoxes({
        pageIndex: 0,
        boxes,
        primaryCandidates: [],
      }),
    ).toEqual([baseBox]);
  });

  it('drops OCR-NER address boxes that overlap regex address candidates', () => {
    const boxes: NerBox[] = [
      { ...baseBox, category: 'private_address', bbox: { x: 10, y: 20, w: 30, h: 10 } },
      { ...baseBox, category: 'private_address', bbox: { x: 100, y: 20, w: 30, h: 10 } },
    ];

    expect(
      filterOcrNerBoxes({
        pageIndex: 0,
        boxes,
        primaryCandidates: [primaryCandidate()],
      }),
    ).toEqual([
      { ...baseBox, category: 'private_address', bbox: { x: 100, y: 20, w: 30, h: 10 } },
    ]);
  });

  it('keeps the highest-scored duplicate OCR-NER box for the same rounded geometry', () => {
    const boxes: NerBox[] = [
      { ...baseBox, score: 0.71 },
      { ...baseBox, score: 0.93 },
    ];

    expect(
      filterOcrNerBoxes({
        pageIndex: 0,
        boxes,
        primaryCandidates: [],
      }),
    ).toEqual([{ ...baseBox, score: 0.93 }]);
  });
});

describe('nerBoxesToCandidates', () => {
  it('converts filtered OCR-NER boxes to candidates', () => {
    expect(nerBoxesToCandidates(0, [baseBox], 'ocr-ner')).toEqual([
      {
        id: 'candidate-1',
        pageIndex: 0,
        bbox: [10, 20, 40, 30],
        text: '',
        category: 'private_person',
        confidence: 0.91,
        source: 'ocr-ner',
      },
    ]);
  });
});
