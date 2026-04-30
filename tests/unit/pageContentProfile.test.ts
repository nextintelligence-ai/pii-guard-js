import { describe, expect, it } from 'vitest';
import { buildPageContentProfile } from '@/core/pageContentProfile';

describe('buildPageContentProfile', () => {
  it('marks a page with no text and a large image as OCR target', () => {
    const profile = buildPageContentProfile({
      pageIndex: 0,
      pageWidthPt: 200,
      pageHeightPt: 100,
      textCharCount: 0,
      textLineCount: 0,
      textBboxes: [],
      imageBlocks: [{ bbox: [0, 0, 200, 100], widthPx: 1200, heightPx: 600 }],
    });

    expect(profile.hasLargeImage).toBe(true);
    expect(profile.shouldAutoOcr).toBe(true);
    expect(profile.pageAreaPt).toBe(20_000);
    expect(profile.textAreaRatio).toBe(0);
    expect(profile.imageAreaRatio).toBe(1);
    expect(profile.imageBlocks[0]?.areaRatio).toBe(1);
  });

  it('does not mark a text page with a small logo as OCR target', () => {
    const profile = buildPageContentProfile({
      pageIndex: 0,
      pageWidthPt: 200,
      pageHeightPt: 100,
      textCharCount: 500,
      textLineCount: 20,
      textBboxes: [[10, 10, 190, 90]],
      imageBlocks: [{ bbox: [5, 5, 25, 25], widthPx: 80, heightPx: 80 }],
    });

    expect(profile.hasLargeImage).toBe(false);
    expect(profile.shouldAutoOcr).toBe(false);
    expect(profile.pageAreaPt).toBe(20_000);
    expect(profile.textAreaRatio).toBeCloseTo(0.72);
    expect(profile.imageAreaRatio).toBeCloseTo(0.02);
    expect(profile.imageBlocks[0]?.areaRatio).toBeCloseTo(0.02);
  });

  it('marks a page with no extractable text as OCR target even when image blocks are not reported', () => {
    const profile = buildPageContentProfile({
      pageIndex: 0,
      pageWidthPt: 842,
      pageHeightPt: 595,
      textCharCount: 0,
      textLineCount: 0,
      textBboxes: [],
      imageBlocks: [],
    });

    expect(profile.hasLargeImage).toBe(false);
    expect(profile.shouldAutoOcr).toBe(true);
  });
});
