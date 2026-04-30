# PaddleOCR 통합 및 서버 배포 전환 설계 문서

- **작성일**: 2026-04-30
- **상태**: Draft (사용자 검토 대기)
- **타깃**: 기존 `pdf-anony` 에 이미지 기반 PDF OCR 후보 탐지를 추가하고, 단일 HTML 배포 전제를 서버 배포형 multi-asset 구조로 전환
- **참조 구현**: `/Users/taesoonpark/workspace/paddle` 의 브라우저 PaddleOCR POC

---

## 1. 목적과 범위

현재 앱은 MuPDF.js 로 PDF 텍스트 레이어를 추출하고, 정규식/NER 후보를 사용자가 검수한 뒤 MuPDF redaction 으로 실제 콘텐츠를 제거한다. 이 흐름은 텍스트 레이어가 있는 PDF 에는 적합하지만, 스캔본 또는 이미지가 포함된 PDF 에서는 자동 탐지가 부족하다.

이번 작업은 `paddle` POC 에서 확인한 브라우저 OCR 및 좌표 기반 마스킹 접근을 본 프로젝트에 통합한다. PDF 원본과 OCR 입력 이미지는 서버로 업로드하지 않는다. 서버는 앱 번들, WASM, OCR 모델 같은 정적 자산만 같은 origin 에서 제공한다.

### 1.1 핵심 요구사항

1. PDF 원본, 렌더링 이미지, OCR 결과는 모두 브라우저 내부에서만 처리한다.
2. PDF open, page inspect, render, redaction, save 는 계속 MuPDF.js 가 담당한다.
3. PaddleOCR.js 는 MuPDF 가 렌더링한 페이지 이미지를 입력으로 받아 보조 탐지기로 동작한다.
4. OCR 후보는 기존 후보 패널에 `source: 'ocr'` 로 합류하며, 사용자는 기존 후보와 같은 방식으로 검수한다.
5. OCR 텍스트에는 1차 범위에서 기존 정규식 detector 만 적용한다.
6. OCR 후보 bbox 는 line 전체가 아니라 정규식 match 문자열 부분만 추정해 생성한다.
7. 단일 HTML 배포는 폐기하고, 기본 빌드는 서버 배포용 multi-asset 산출물을 만든다.
8. 운영과 개발 모두 외부 CDN 없이 same-origin 정적 자산만 로드한다.

### 1.2 비범위

- OCR 텍스트에 NER 적용
- OCR 적용 후 결과 PDF 를 다시 OCR 해 이미지 기반 개인정보 누수를 검증하는 기능
- 서버 OCR API 또는 PDF 업로드 기반 처리
- OCR 전용 별도 검수 화면
- `pdfjs-dist` 를 본 프로젝트 PDF 렌더링 엔진으로 추가

---

## 2. 확정된 결정

| # | 결정 | 비고 |
| - | --- | --- |
| O1 | OCR 실행 위치 = **브라우저** | 서버는 정적 자산만 제공 |
| O2 | PDF 엔진 = **MuPDF 단일 유지** | `paddle` POC 의 `pdfjs-dist` 렌더링은 이식하지 않음 |
| O3 | OCR 대상 = **텍스트 부족 + 이미지 포함 페이지 자동 선정** | 사용자가 현재 페이지/전체 문서를 수동 OCR 할 수 있음 |
| O4 | 혼합 페이지 = **페이지 전체 OCR + 중복 제거** | 이미지 영역 crop 은 1차 범위 제외 |
| O5 | OCR 후보 UI = **기존 CandidatePanel 에 합류** | 출처 배지로 `OCR` 표시 |
| O6 | OCR 탐지 = **정규식 detector 만 적용** | NER 적용은 후속 백로그 |
| O7 | OCR bbox = **match 문자열 부분 bbox 추정** | line bbox 안에서 글자 수 비율로 x 범위 계산 |
| O8 | 적용 = **기존 MuPDF Redact annotation 사용** | OCR box 도 기존 `RedactionBox` 로 저장 |
| O9 | 배포 = **server multi-asset 기본 빌드** | 단일 HTML 전제 제거 |
| O10 | 네트워크 정책 = **외부 네트워크 0 유지** | 모델/WASM/runtime 모두 same-origin |

---

## 3. 시스템 아키텍처

```
PDF load
  -> pdf.worker.open(buffer)
  -> MuPDF page meta + structured text + image blocks inspect
  -> regex auto detect for text layer
  -> OCR 대상 페이지 선정
  -> pdf.worker.renderPage(pageIndex, ocrScale)
  -> ocr.worker.recognize(rendered image)
  -> OCR line normalize
  -> regex detector over OCR text
  -> partial bbox estimate in OCR image pixels
  -> convert OCR pixels to PDF points
  -> merge Candidate/RedactionBox(source: 'ocr')
  -> 기존 검수 UI
  -> pdf.worker.apply(enabled boxes)
```

### 3.1 책임 분리

- `pdf.worker.ts`: MuPDF 초기화, 문서 열기, 페이지 렌더링, structured text 추출, 이미지 block inspect, 정규식 detector, redaction 적용.
- `ocr.worker.ts`: PaddleOCR.js 초기화, 모델 로딩, backend 선택, 이미지 OCR, 결과 normalize.
- `core/ocr*`: OCR 결과 타입, line normalize, match bbox 계산, 좌표 변환, 중복 제거 같은 순수 로직.
- `state/store.ts`: OCR 후보와 박스를 기존 `candidates`, `boxes`에 저장. OCR 진행률만 별도 상태로 유지.
- `components/CandidatePanel.tsx`: 기존 후보 목록에 OCR 출처 배지와 OCR 상태 표시를 추가.

### 3.2 MuPDF 중심 원칙

본 프로젝트에는 `pdfjs-dist` 를 추가하지 않는다. `paddle` POC 에서 검증된 부분 중 다음만 이식한다.

- `@paddleocr/paddleocr-js` 초기화와 backend 옵션
- 한국어 recognition 모델 asset 로딩
- OCR result normalize
- line poly 기반 부분 마스킹 bbox 계산 아이디어
- OCR 처리 실패를 페이지 단위로 격리하는 상태 관리

PDF 좌표, 페이지 회전, 렌더 scale, redaction 적용은 현재 앱의 MuPDF 기준으로 통일한다.

---

## 4. 데이터 모델

도메인 타입은 기존 구조를 최소 확장한다.

```ts
export type CandidateSource = 'auto' | 'ner' | 'ocr';

export type RedactionBoxSource =
  | 'auto'
  | 'ner'
  | 'ocr'
  | 'text-select'
  | 'manual-rect';
```

OCR 1차 범위에서 생성하는 카테고리는 기존 정규식 detector 카테고리만 사용한다.

- `rrn`
- `phone`
- `email`
- `account`
- `businessNo`
- `card`
- `address`

OCR 후보는 기존 `Candidate` 형식을 따른다.

```ts
type Candidate = {
  id: string;
  pageIndex: number;
  bbox: Bbox;              // PDF point 좌표
  text: string;            // OCR match 원문
  category: DetectionCategory;
  confidence: number;      // detector 기반이면 1, OCR line confidence 를 보조값으로 유지 가능
  source: 'ocr';
};
```

OCR 진행 상태는 후보 데이터와 분리한다.

```ts
type OcrPageStatus = 'idle' | 'queued' | 'running' | 'done' | 'failed';

type OcrProgress = {
  done: number;
  total: number;
  currentPage: number | null;
  byPage: Record<number, { status: OcrPageStatus; message?: string }>;
};
```

---

## 5. OCR 대상 선정

MuPDF structured text walker 의 `onImageBlock(bbox, transform, image)` 를 사용해 페이지의 이미지 block 정보를 수집한다. 동시에 기존 텍스트 line/span 정보를 이용해 텍스트 밀도를 계산한다.

### 5.1 PageContentProfile

```ts
type PageContentProfile = {
  pageIndex: number;
  pageAreaPt: number;
  textCharCount: number;
  textLineCount: number;
  textAreaRatio: number;
  imageBlocks: Array<{
    bbox: Bbox;
    areaRatio: number;
    widthPx: number;
    heightPx: number;
  }>;
  hasLargeImage: boolean;
  shouldAutoOcr: boolean;
};
```

### 5.2 자동 OCR 기준

페이지는 다음 중 하나를 만족하면 자동 OCR 대상으로 넣는다.

1. `textCharCount === 0` 이고 이미지 block 이 하나 이상 있다.
2. `textCharCount < 40` 이고 `hasLargeImage === true`.
3. `imageBlocks` 중 페이지 면적의 25% 이상을 차지하는 block 이 있다.

`hasLargeImage` 는 `areaRatio >= 0.25` 이거나 이미지 픽셀 면적이 OCR 최소 기준 이상인 경우 true 로 계산한다. 작은 로고, 도장, 아이콘만 있는 텍스트 PDF 는 자동 OCR 대상이 되지 않도록 한다.

사용자는 자동 선정과 별개로 현재 페이지 OCR 또는 전체 문서 OCR을 수동 실행할 수 있다.

---

## 6. OCR 실행 흐름

### 6.1 큐 정책

- 문서 로드 후 OCR 대상 페이지를 `queued` 로 넣는다.
- 현재 보고 있는 페이지가 OCR 대상이면 우선 실행한다.
- 나머지 페이지는 1페이지씩 순차 실행한다.
- 문서를 새로 열면 기존 OCR job 은 stale 처리하고 결과를 버린다.
- 같은 페이지에서 기존 OCR 결과가 있으면 자동 재실행하지 않는다. 사용자가 재시도 버튼을 누를 때만 갱신한다.

### 6.2 렌더 입력

`pdf.worker.renderPage(pageIndex, ocrScale)` 이 반환하는 `ImageBitmap`, `widthPx`, `heightPx`, `scale` 을 OCR 입력으로 사용한다. OCR worker 에는 브라우저가 처리 가능한 `Blob` 또는 `ImageBitmap` 형태로 전달한다. 최종 구현에서 PaddleOCR.js 가 요구하는 입력 타입에 맞춰 변환 책임은 OCR client 쪽에 둔다.

기본 `ocrScale` 은 2.0 으로 시작한다. 큰 페이지에서 픽셀 수가 과도하면 최대 edge 또는 총 픽셀 수를 제한해 메모리 사용을 막는다.

### 6.3 PaddleOCR 설정

```ts
PaddleOCR.create({
  textRecognitionModelName: 'korean_PP-OCRv5_mobile_rec',
  textRecognitionModelAsset: {
    url: '/models/paddleocr/korean_PP-OCRv5_mobile_rec_onnx.tar'
  },
  ortOptions: {
    backend: 'auto',
    wasmPaths: '/ort/',
    numThreads: 1,
    simd: true
  }
});
```

backend 선택은 기본 `auto` 로 둔다. UI에는 필요한 경우 `auto`, `webgpu`, `wasm` 선택을 추가할 수 있지만, 1차 UX는 자동 선택과 실패 표시를 우선한다.

---

## 7. OCR 텍스트 탐지와 bbox 계산

### 7.1 OCR 결과 normalize

OCR worker 는 PaddleOCR 결과를 다음 형태로 정규화한다.

```ts
type OcrLine = {
  id: string;
  pageIndex: number;
  text: string;
  score: number | undefined;
  poly: Array<{ x: number; y: number }>; // OCR image pixel 좌표
};
```

빈 문자열은 제거하고, 텍스트는 NFC 로 정규화한다.

### 7.2 정규식 detector 적용

OCR line 텍스트를 기존 detector 입력 형태로 변환한다. detector 가 요구하는 `charBboxes` 는 OCR line bbox 안에서 문자 수 비율로 생성한다.

```text
line poly
  -> axis-aligned line bounds
  -> text characters
  -> char i bbox = line x 범위 * i/textLength .. (i+1)/textLength
  -> existing runDetectors(lines)
```

이 방식은 OCR engine 이 문자 단위 좌표를 제공하지 않아도 기존 detector 의 match offset 기반 bbox 생성 방식을 재사용하게 해준다.

### 7.3 부분 bbox 계산

정규식 match `[start, end)` 에 대해 line bbox 안의 x 범위를 계산한다.

```text
x0 = lineBounds.x + lineBounds.width * (start / charCount)
x1 = lineBounds.x + lineBounds.width * (end / charCount)
y0 = lineBounds.y
y1 = lineBounds.y + lineBounds.height
```

좌우/상하 padding 을 더해 OCR 오차와 글자 간격을 보정한다. padding 은 OCR image pixel 기준으로 계산한 뒤 PDF point 좌표로 변환한다.

### 7.4 OCR pixel -> PDF point 변환

MuPDF 렌더링 scale 을 사용한다.

```text
pdfX = pixelX / renderScale
pdfY = pixelY / renderScale
```

기존 앱은 박스를 PDF point 좌표로 저장하므로 OCR bbox 도 동일한 좌표계로 변환한 뒤 store 에 넣는다. 페이지 rotation 처리는 현재 `coords.ts` 의 화면 변환 규칙과 맞춰 한 곳에서 테스트로 고정한다.

---

## 8. 중복 제거

혼합 페이지에서는 텍스트 레이어 후보와 OCR 후보가 동시에 나올 수 있다. 병합 시 기존 텍스트 기반 후보를 우선한다.

OCR 후보는 다음 조건을 모두 만족하는 기존 후보가 있으면 버린다.

1. 같은 `pageIndex`
2. 같은 `category`
3. bbox IoU 가 0.5 이상이거나 중심점 거리가 작은 기준 이하
4. 텍스트가 같거나, 숫자/기호 정규화 후 같은 값

텍스트가 비슷하지만 bbox 가 크게 다르면 이미지 안에 별도로 존재하는 개인정보일 수 있으므로 유지한다.

---

## 9. UI/UX

OCR UI 는 기존 작업 흐름을 방해하지 않는 보조 상태로 배치한다.

- 후보 패널 상단에 OCR 진행 상태: `OCR 2/5 페이지 처리 중`
- 페이지별 OCR 실패 시 해당 페이지 row 또는 상태 영역에 재시도 버튼
- 후보 row 에 `OCR` 출처 배지와 OCR confidence 표시
- 사용자는 기존처럼 후보 체크 해제, 카테고리 토글, 박스 선택, 이동, 삭제 가능
- 수동 OCR 액션: 현재 페이지 OCR, 전체 문서 OCR

OCR 모델 로딩 실패는 전체 앱 오류가 아니다. OCR 기능만 비활성화하고, 기존 텍스트 PDF 탐지/마스킹은 계속 사용할 수 있어야 한다.

---

## 10. Redaction 적용과 검증

OCR 후보도 기존 `RedactionBox` 로 저장하므로 `useApply` 와 `pdf.worker.apply` 흐름은 유지한다.

적용 단계:

1. 활성화된 모든 box 수집
2. MuPDF `PDFPage.createAnnotation('Redact')`
3. bbox 를 annotation rect 로 설정
4. `page.applyRedactions(true)`
5. 메타데이터 정리
6. 저장 후 기존 텍스트 detector 기반 post-check 실행

기존 post-check 는 PDF 텍스트 레이어 누수만 검증한다. 이미지 내부 개인정보가 실제로 가려졌는지 재-OCR 하는 검증은 1차 범위에서 제외하고 후속 백로그로 둔다.

---

## 11. 빌드와 배포

단일 HTML 빌드는 기본 경로에서 제거한다. `npm run build` 는 서버 배포용 multi-asset 산출물을 만든다.

### 11.1 Vite 빌드

- `vite-plugin-singlefile` 기본 사용 제거
- `assetsInlineLimit` 를 일반 서버 배포 기준으로 되돌림
- MuPDF WASM, OCR 모델, ONNX Runtime 자산은 정적 파일로 산출 또는 public asset 으로 복사
- `build:nlp` 같은 별도 단일 HTML 모드는 유지하지 않고, 필요하면 기능 플래그만 남긴다

### 11.2 정적 자산 경로

운영과 개발 모두 same-origin 경로를 사용한다.

```text
/models/paddleocr/korean_PP-OCRv5_mobile_rec_onnx.tar
/ort/<onnxruntime runtime files>
/assets/<vite chunks>
```

외부 CDN URL 은 앱 코드와 산출물에 남기지 않는다.

### 11.3 검증 스크립트

기존 `verify-no-external` 정책은 유지하되, 검사 대상을 단일 HTML 파일에서 산출 디렉터리 전체로 바꾼다.

- `dist/**/*.html`
- `dist/**/*.js`
- `dist/**/*.css`
- 필요한 경우 manifest/json 파일

`verify-build-size` 의 단일 HTML 예산은 기본 빌드에서 제거한다. 대신 OCR 모델과 runtime 파일은 큰 정적 자산임을 전제로 CloudFront 캐시 정책으로 관리한다.

### 11.4 인프라

현재 S3 + CloudFront 구조를 유지한다. 배포는 `dist/index.html` 하나가 아니라 `dist/**` 전체 업로드로 바꾼다.

- HTML: 짧은 cache-control
- hashed JS/CSS/assets: 긴 cache-control
- OCR model/ORT runtime: 긴 cache-control
- CloudFront invalidation 은 HTML 중심으로 최소화하고, 필요 시 전체 invalidation 을 실행한다

---

## 12. 오류 처리

- OCR 모델 로딩 실패: OCR 상태를 `failed` 로 표시하고 기존 텍스트 탐지는 유지한다.
- 특정 페이지 OCR 실패: 해당 페이지 상태만 `failed`, 재시도 가능.
- backend 실패: `auto -> wasm` fallback 을 시도하고, 모두 실패하면 OCR 비활성.
- 문서 교체: `docEpoch` 로 stale OCR 결과를 폐기한다.
- 대용량 페이지: 렌더 scale 을 낮추거나 OCR 대상에서 제외하고 사용자에게 수동 실행 가능 상태를 보여준다.
- 모델 asset fetch 실패: same-origin 경로와 배포 누락을 구분할 수 있도록 오류 메시지에 asset path 를 포함한다.

---

## 13. 테스트 전략

### 13.1 단위 테스트

- OCR 결과 normalize
- OCR line text + poly -> synthetic char bbox 생성
- regex match -> 부분 bbox 계산
- OCR pixel bbox -> PDF point bbox 변환
- OCR 후보와 텍스트 후보 중복 제거
- `CandidateSource` / `RedactionBoxSource` 에 `ocr` 추가 후 store 동작
- PageContentProfile 자동 OCR 대상 선정 기준

### 13.2 통합 테스트

- mock OCR 결과를 store 에 병합하고 CandidatePanel 에 OCR 후보가 표시되는지 확인
- OCR 후보를 활성화한 뒤 기존 `apply` 흐름이 box 를 redaction annotation 으로 넘기는지 확인
- 문서 교체 시 stale OCR 결과가 들어오지 않는지 확인
- 산출 디렉터리 전체 외부 URL 검증

### 13.3 E2E / 수동 검증

- 샘플 스캔 PDF 업로드
- OCR 대상 자동 선정 확인
- OCR 후보 표시 확인
- 후보 적용 후 저장된 PDF 의 시각적 마스킹 확인

실제 PaddleOCR 모델 로딩은 무겁기 때문에 일반 unit/integration 은 mock 중심으로 둔다. 실제 모델 검증은 Playwright smoke 또는 수동 검증으로 분리한다.

---

## 14. 후속 작업 백로그

사용자 요청에 따라 1차 범위에서 제외하되 다음 작업 항목으로 남긴다.

1. OCR 텍스트에도 NER 파이프라인을 적용해 이름, 비정형 주소, URL, 날짜, secret 후보를 생성한다.
2. OCR 적용 후 결과 PDF 를 다시 렌더링하고 OCR 을 실행해 이미지 기반 개인정보가 실제로 가려졌는지 검증한다.
3. OCR line 전체 마스킹과 부분 마스킹을 후보별로 전환할 수 있는 고급 옵션을 검토한다.
4. 큰 문서에서 OCR queue pause/resume 과 페이지별 우선순위 조정을 추가한다.

---

## 15. 구현 순서 초안

1. 빌드/배포 전제를 multi-asset 으로 전환하고 외부 URL 검증을 산출 디렉터리 기준으로 바꾼다.
2. MuPDF structured text walker 에서 image block 정보를 수집하는 `inspectPageContent` API 를 추가한다.
3. OCR core 순수 함수와 테스트를 추가한다.
4. `ocr.worker` 와 PaddleOCR same-origin asset 로딩을 추가한다.
5. OCR queue/hook/store 상태를 추가한다.
6. OCR 후보를 CandidatePanel 과 BoxOverlay 에 통합한다.
7. apply/redaction 통합 테스트와 샘플 PDF smoke 검증을 추가한다.

구현 계획은 이 설계가 승인된 뒤 별도 plan 문서로 분리한다.
