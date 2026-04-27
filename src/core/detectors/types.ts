import type { Bbox, DetectionCategory } from '@/types/domain';

export type DetectorMatch = {
  start: number;
  end: number;
  matched: string;
  confidence: number;
};

export type DetectorRule = {
  category: DetectionCategory;
  scan(text: string): DetectorMatch[];
};

export type LineForScan = {
  pageIndex: number;
  text: string;
  charBboxes: Bbox[];
};
