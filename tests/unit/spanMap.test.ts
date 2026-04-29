import { describe, it, expect } from 'vitest';
import { serialize, entitiesToBoxes, type StructuredLine } from '@/core/spanMap';

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

describe('spanMap.entitiesToBoxes', () => {
  it('단일 라인 entity 는 char bbox 의 합집합 한 박스로 변환한다', () => {
    const lines: StructuredLine[] = [
      {
        id: 0,
        spans: [
          {
            id: 0,
            chars: [
              { ch: 'A', bbox: { x: 0, y: 0, w: 10, h: 10 } },
              { ch: 'l', bbox: { x: 10, y: 0, w: 10, h: 10 } },
              { ch: 'i', bbox: { x: 20, y: 0, w: 5, h: 10 } },
              { ch: 'c', bbox: { x: 25, y: 0, w: 10, h: 10 } },
              { ch: 'e', bbox: { x: 35, y: 0, w: 10, h: 10 } },
            ],
          },
        ],
      },
    ];
    const map = serialize(lines);
    const boxes = entitiesToBoxes(map, [
      { entity_group: 'private_person', start: 0, end: 5, score: 0.99 },
    ]);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].bbox).toEqual({ x: 0, y: 0, w: 45, h: 10 });
    expect(boxes[0].category).toBe('private_person');
    expect(boxes[0].score).toBe(0.99);
  });

  it('두 라인을 가로지르는 entity 는 라인별로 박스를 분할한다', () => {
    const lines: StructuredLine[] = [
      {
        id: 0,
        spans: [
          {
            id: 0,
            chars: [
              { ch: 'A', bbox: { x: 0, y: 0, w: 10, h: 10 } },
              { ch: 'B', bbox: { x: 10, y: 0, w: 10, h: 10 } },
            ],
          },
        ],
      },
      {
        id: 1,
        spans: [
          {
            id: 1,
            chars: [
              { ch: 'C', bbox: { x: 0, y: 20, w: 10, h: 10 } },
              { ch: 'D', bbox: { x: 10, y: 20, w: 10, h: 10 } },
            ],
          },
        ],
      },
    ];
    const map = serialize(lines);
    // pageText: 'AB\nCD' (offsets 0..5). entity 0..5 는 두 라인을 모두 포함.
    const boxes = entitiesToBoxes(map, [
      { entity_group: 'private_person', start: 0, end: 5, score: 0.99 },
    ]);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].bbox).toEqual({ x: 0, y: 0, w: 20, h: 10 });
    expect(boxes[1].bbox).toEqual({ x: 0, y: 20, w: 20, h: 10 });
  });

  it('어느 char 도 매핑되지 않는 entity 는 박스를 만들지 않는다', () => {
    const lines: StructuredLine[] = [
      {
        id: 0,
        spans: [{ id: 0, chars: [{ ch: 'A', bbox: { x: 0, y: 0, w: 10, h: 10 } }] }],
      },
    ];
    const map = serialize(lines);
    const boxes = entitiesToBoxes(map, [
      { entity_group: 'private_person', start: 100, end: 200, score: 0.99 },
    ]);
    expect(boxes).toEqual([]);
  });

  it('여러 entity 를 각각 변환한다', () => {
    const lines: StructuredLine[] = [
      {
        id: 0,
        spans: [
          {
            id: 0,
            chars: [
              { ch: 'A', bbox: { x: 0, y: 0, w: 10, h: 10 } },
              { ch: 'B', bbox: { x: 10, y: 0, w: 10, h: 10 } },
              { ch: 'C', bbox: { x: 20, y: 0, w: 10, h: 10 } },
            ],
          },
        ],
      },
    ];
    const map = serialize(lines);
    const boxes = entitiesToBoxes(map, [
      { entity_group: 'private_person', start: 0, end: 1, score: 0.9 },
      { entity_group: 'private_email', start: 2, end: 3, score: 0.8 },
    ]);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].category).toBe('private_person');
    expect(boxes[1].category).toBe('private_email');
  });
});
