import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isNerDebugEnabled,
  logNerDebug,
  summarizeNerEntities,
  summarizeStructuredLines,
} from '@/core/nerDebug';
import type { StructuredLine } from '@/core/spanMap';

afterEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('nerDebug', () => {
  it('기본값은 NER 디버그 로그를 출력하지 않는다', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    expect(isNerDebugEnabled()).toBe(false);
    logNerDebug('page classify result', { pageIndex: 0 });

    expect(info).not.toHaveBeenCalled();
  });

  it('localStorage 플래그가 켜지면 NER 디버그 로그를 출력한다', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    localStorage.setItem('piiGuard.debugNer', '1');

    expect(isNerDebugEnabled()).toBe(true);
    logNerDebug('page classify result', { pageIndex: 0 });

    expect(info).toHaveBeenCalledWith('[NER debug] page classify result', {
      pageIndex: 0,
    });
  });

  it('URL debugNer 파라미터로도 NER 디버그 로그를 켠다', () => {
    window.history.replaceState(null, '', '/?debugNer=true');

    expect(isNerDebugEnabled()).toBe(true);
  });

  it('entity offset 에 해당하는 원문을 함께 요약한다', () => {
    expect(
      summarizeNerEntities('성명 홍가명', [
        {
          entity_group: 'private_person',
          start: 3,
          end: 6,
          score: 0.97,
          word: '홍가명',
        },
      ]),
    ).toEqual([
      {
        entity_group: 'private_person',
        start: 3,
        end: 6,
        score: 0.97,
        word: '홍가명',
        text: '홍가명',
      },
    ]);
  });

  it('structured line 텍스트를 line id 와 함께 요약한다', () => {
    const lines: StructuredLine[] = [
      {
        id: 7,
        spans: [
          {
            id: 0,
            chars: [
              { ch: '성', bbox: { x: 0, y: 0, w: 10, h: 10 } },
              { ch: '명', bbox: { x: 10, y: 0, w: 10, h: 10 } },
            ],
          },
        ],
      },
    ];

    expect(summarizeStructuredLines(lines)).toEqual([{ id: 7, text: '성명' }]);
  });
});
