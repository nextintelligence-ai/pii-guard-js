export type Bbox = readonly [x0: number, y0: number, x1: number, y1: number];

export type TextSpan = {
  text: string;
  bbox: Bbox;
  pageIndex: number;
};

export type DetectionCategory =
  | 'rrn'
  | 'phone'
  | 'email'
  | 'account'
  | 'businessNo'
  | 'card'
  | 'address'
  | 'private_person'
  | 'private_address'
  | 'private_url'
  | 'private_date'
  | 'secret';

export type CandidateSource = 'auto' | 'ner' | 'ocr';

export type Candidate = {
  id: string;
  pageIndex: number;
  bbox: Bbox;
  text: string;
  category: DetectionCategory;
  confidence: number;
  source: CandidateSource;
};

export type RedactionBoxSource = 'auto' | 'ner' | 'ocr' | 'text-select' | 'manual-rect';

export type RedactionBox = {
  id: string;
  pageIndex: number;
  bbox: Bbox;
  source: RedactionBoxSource;
  category?: DetectionCategory;
  label?: string;
  enabled: boolean;
};

export type PageMeta = {
  index: number;
  widthPt: number;
  heightPt: number;
  rotation: 0 | 90 | 180 | 270;
};

export type OcrPageStatus = 'idle' | 'queued' | 'running' | 'done' | 'failed';

export type OcrProgress = {
  done: number;
  total: number;
  currentPage: number | null;
  byPage: Record<number, { status: OcrPageStatus; message?: string }>;
};

export type OcrRequest =
  | { kind: 'idle' }
  | { kind: 'page'; pageIndex: number; nonce: number }
  | { kind: 'all'; nonce: number };

export type ApplyReport = {
  totalBoxes: number;
  byCategory: Record<DetectionCategory | 'manual', number>;
  pagesAffected: number[];
  postCheckLeaks: number;
};
