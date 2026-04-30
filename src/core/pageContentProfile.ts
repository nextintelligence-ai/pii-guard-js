import type { Bbox } from '@/types/domain';

export type PageImageBlock = {
  bbox: Bbox;
  widthPx: number;
  heightPx: number;
};

export type PageContentProfileInput = {
  pageIndex: number;
  pageWidthPt: number;
  pageHeightPt: number;
  textCharCount: number;
  textLineCount: number;
  textBboxes: Bbox[];
  imageBlocks: PageImageBlock[];
};

export type PageContentProfile = {
  pageIndex: number;
  pageAreaPt: number;
  textCharCount: number;
  textLineCount: number;
  textAreaRatio: number;
  imageAreaRatio: number;
  imageBlocks: Array<PageImageBlock & { areaRatio: number }>;
  hasLargeImage: boolean;
  shouldAutoOcr: boolean;
};

const LARGE_IMAGE_AREA_RATIO = 0.25;
const LARGE_IMAGE_MIN_PIXELS = 250_000;
const LOW_TEXT_CHAR_COUNT = 40;

export function buildPageContentProfile(input: PageContentProfileInput): PageContentProfile {
  const pageAreaPt = Math.max(1, input.pageWidthPt * input.pageHeightPt);
  const textAreaRatio = ratioForArea(totalArea(input.textBboxes), pageAreaPt);
  const imageBlocks = input.imageBlocks.map((block) => ({
    ...block,
    areaRatio: ratioForArea(bboxArea(block.bbox), pageAreaPt),
  }));
  const imageAreaRatio = ratioForArea(
    imageBlocks.reduce((sum, block) => sum + bboxArea(block.bbox), 0),
    pageAreaPt,
  );
  const hasLargeImage = imageBlocks.some(
    (block) =>
      block.areaRatio >= LARGE_IMAGE_AREA_RATIO ||
      block.widthPx * block.heightPx >= LARGE_IMAGE_MIN_PIXELS,
  );
  const shouldAutoOcr =
    (input.textCharCount === 0 && imageBlocks.length > 0) ||
    (input.textCharCount < LOW_TEXT_CHAR_COUNT && hasLargeImage) ||
    imageBlocks.some((block) => block.areaRatio >= LARGE_IMAGE_AREA_RATIO);

  return {
    pageIndex: input.pageIndex,
    pageAreaPt,
    textCharCount: input.textCharCount,
    textLineCount: input.textLineCount,
    textAreaRatio,
    imageAreaRatio,
    imageBlocks,
    hasLargeImage,
    shouldAutoOcr,
  };
}

function bboxArea(bbox: Bbox): number {
  return Math.max(0, bbox[2] - bbox[0]) * Math.max(0, bbox[3] - bbox[1]);
}

function totalArea(boxes: Bbox[]): number {
  return boxes.reduce((sum, bbox) => sum + bboxArea(bbox), 0);
}

function ratioForArea(area: number, pageAreaPt: number): number {
  return Math.min(1, Math.max(0, area / pageAreaPt));
}
