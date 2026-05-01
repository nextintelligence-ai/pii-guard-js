import { describe, expect, it } from 'vitest';
import { buildAutoApplyBoxes } from '@/core/batch/buildAutoApplyBoxes';
import type { Candidate } from '@/types/domain';

const base = {
  pageIndex: 0,
  bbox: [0, 0, 10, 10] as const,
  text: 'x',
  category: 'email' as const,
  confidence: 1,
};

describe('buildAutoApplyBoxes', () => {
  it('기본 설정에서는 정규식과 OCR 후보만 자동 적용 박스로 만든다', () => {
    const candidates: Candidate[] = [
      { ...base, id: 'auto-1', source: 'auto' },
      { ...base, id: 'ocr-1', source: 'ocr' },
      { ...base, id: 'ner-1', source: 'ner', category: 'private_person' },
      { ...base, id: 'ocr-ner-1', source: 'ocr-ner', category: 'private_person' },
    ];

    const boxes = buildAutoApplyBoxes(candidates, { autoApplyNer: false });

    expect(boxes.map((box) => box.id).sort()).toEqual(['auto-1', 'ocr-1']);
  });

  it('NER 자동 적용 설정이 켜지면 NER 후보도 포함한다', () => {
    const candidates: Candidate[] = [
      { ...base, id: 'ner-1', source: 'ner', category: 'private_person', confidence: 0.95 },
    ];

    const boxes = buildAutoApplyBoxes(candidates, {
      autoApplyNer: true,
      nerThreshold: 0.7,
    });

    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({ id: 'ner-1', enabled: true });
  });
});
