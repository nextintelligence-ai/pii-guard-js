export const DEFAULT_PDF_PREVIEW_SCALE = 1.5;

type FitScaleInput = {
  pageWidthPt: number;
  pageHeightPt: number;
  viewportWidthPx: number;
  viewportHeightPx: number;
  fallbackScale?: number;
};

export function calculatePdfPreviewFitScale({
  pageWidthPt,
  pageHeightPt,
  viewportWidthPx,
  viewportHeightPx,
  fallbackScale = DEFAULT_PDF_PREVIEW_SCALE,
}: FitScaleInput): number {
  if (
    pageWidthPt <= 0 ||
    pageHeightPt <= 0 ||
    viewportWidthPx <= 0 ||
    viewportHeightPx <= 0
  ) {
    return fallbackScale;
  }

  const scale = Math.min(viewportWidthPx / pageWidthPt, viewportHeightPx / pageHeightPt);
  return Number.isFinite(scale) && scale > 0 ? scale : fallbackScale;
}
