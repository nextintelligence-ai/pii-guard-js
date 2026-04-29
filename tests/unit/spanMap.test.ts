import { describe, it, expect } from 'vitest';
import { serialize, type StructuredLine } from '@/core/spanMap';

describe('spanMap.serialize', () => {
  it('단일 라인 단일 span 의 char 들을 직선 결합한다', () => {
    const lines: StructuredLine[] = [
      {
        id: 0,
        spans: [
          {
            id: 0,
            chars: [
              { ch: 'a', bbox: { x: 0, y: 0, w: 10, h: 10 } },
              { ch: 'b', bbox: { x: 10, y: 0, w: 10, h: 10 } },
            ],
          },
        ],
      },
    ];
    const map = serialize(lines);
    expect(map.pageText).toBe('ab');
    expect(map.charIndex).toHaveLength(2);
    expect(map.charIndex[0]).toMatchObject({
      pageTextOffset: 0,
      lineId: 0,
      spanId: 0,
      isLineBreak: false,
    });
    expect(map.charIndex[1]).toMatchObject({
      pageTextOffset: 1,
      lineId: 0,
      spanId: 0,
      isLineBreak: false,
    });
  });

  it('두 라인 사이에 줄경계 \\n 을 삽입하고 charIndex 에도 항목을 추가한다', () => {
    const lines: StructuredLine[] = [
      { id: 0, spans: [{ id: 0, chars: [{ ch: 'a', bbox: { x: 0, y: 0, w: 10, h: 10 } }] }] },
      { id: 1, spans: [{ id: 1, chars: [{ ch: 'b', bbox: { x: 0, y: 20, w: 10, h: 10 } }] }] },
    ];
    const map = serialize(lines);
    expect(map.pageText).toBe('a\nb');
    expect(map.charIndex).toHaveLength(3);
    expect(map.charIndex[1].isLineBreak).toBe(true);
    expect(map.charIndex[1].pageTextOffset).toBe(1);
  });

  it('빈 라인 배열은 빈 PageMap 을 반환한다', () => {
    const map = serialize([]);
    expect(map.pageText).toBe('');
    expect(map.charIndex).toEqual([]);
  });

  it('각 char 의 pdfBbox 는 입력의 bbox 를 그대로 보존한다', () => {
    const lines: StructuredLine[] = [
      {
        id: 0,
        spans: [
          {
            id: 0,
            chars: [{ ch: 'X', bbox: { x: 5, y: 7, w: 11, h: 13 } }],
          },
        ],
      },
    ];
    const map = serialize(lines);
    expect(map.charIndex[0].pdfBbox).toEqual({ x: 5, y: 7, w: 11, h: 13 });
  });
});
