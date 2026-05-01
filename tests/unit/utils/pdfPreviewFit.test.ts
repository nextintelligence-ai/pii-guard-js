import { describe, expect, it } from 'vitest';
import { calculatePdfPreviewFitScale } from '@/utils/pdfPreviewFit';

describe('PDF preview fit scale', () => {
  it('가로가 더 제한적이면 fit-width scale 을 선택한다', () => {
    expect(
      calculatePdfPreviewFitScale({
        pageWidthPt: 1000,
        pageHeightPt: 500,
        viewportWidthPx: 500,
        viewportHeightPx: 1000,
      }),
    ).toBe(0.5);
  });

  it('세로가 더 제한적이면 fit-height scale 을 선택한다', () => {
    expect(
      calculatePdfPreviewFitScale({
        pageWidthPt: 500,
        pageHeightPt: 1000,
        viewportWidthPx: 1000,
        viewportHeightPx: 500,
      }),
    ).toBe(0.5);
  });

  it('preview 크기를 아직 모르면 기존 scale 을 fallback 으로 쓴다', () => {
    expect(
      calculatePdfPreviewFitScale({
        pageWidthPt: 500,
        pageHeightPt: 1000,
        viewportWidthPx: 0,
        viewportHeightPx: 500,
        fallbackScale: 1.5,
      }),
    ).toBe(1.5);
  });
});
