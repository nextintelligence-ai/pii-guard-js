# OCR Relevant Image Auto-Detect Design

- **작성일**: 2026-05-01
- **상태**: 사용자 승인 후 spec 작성
- **타깃**: 텍스트 레이어가 충분한 PDF 페이지라도 의미 있는 이미지가 있으면 OCR 후보 탐지를 자동 실행

## 1. 목적

현재 OCR 자동 실행은 주로 스캔본 또는 텍스트가 부족한 이미지 기반 페이지를 보강하는 데 맞춰져 있다. 하지만 실제 PDF에는 텍스트 레이어가 충분한 본문과 함께, 개인정보가 포함된 이미지가 삽입되는 경우가 있다. 예를 들어 캡처 이미지, 스캔된 신분증 일부, 표 이미지, 서명/신청서 이미지가 본문 안에 섞일 수 있다.

이 설계의 목표는 **텍스트가 충분한 페이지라도 OCR 할 만한 이미지가 있으면 기존 OCR 파이프라인으로 읽어 후보 탐지에 포함하는 것**이다. OCR 방식은 기존처럼 페이지 전체 PNG 렌더링을 입력으로 사용한다. 이미지 영역 crop OCR은 이번 범위에 포함하지 않는다.

## 2. 현재 기준선

현재 흐름은 다음 기준으로 OCR 대상 페이지를 선정한다.

- `textCharCount === 0`
- `textCharCount < 40 && hasLargeImage`
- 페이지 면적의 25% 이상을 차지하는 이미지 block 존재

이 기준은 스캔본에는 효과적이지만, 텍스트가 많은 페이지에 5~20% 정도 크기의 이미지가 섞인 경우에는 OCR을 건너뛸 수 있다.

관련 파일:

- `src/core/pageContentProfile.ts`: 이미지 block, 텍스트 밀도, `shouldAutoOcr` 계산
- `src/hooks/useOcrDetect.ts`: 단일 처리 자동 OCR 대상 선정
- `src/core/batch/runBatchJob.ts`: batch 자동 처리에서 OCR 여부 판단
- `src/core/ocr/detect.ts`: OCR line에서 정규식 후보 생성
- `src/core/ocr/ner.ts`: OCR page text를 NER 입력으로 변환

## 3. 결정

자동 OCR 판단에 `hasOcrRelevantImage` 조건을 추가한다.

권장 기준:

```ts
areaRatio >= 0.05 || widthPx * heightPx >= 80_000
```

이 기준을 만족하는 이미지 block이 하나라도 있으면, 텍스트 양과 무관하게 해당 페이지는 자동 OCR 대상이 된다.

기존 `hasLargeImage`는 유지한다. `hasLargeImage`는 스캔본/대형 이미지 판단에 쓰고, `hasOcrRelevantImage`는 텍스트 혼합 PDF에서 OCR 보강이 필요한 이미지 존재 여부를 나타낸다.

## 4. 데이터 모델

`PageContentProfile`에 필드를 추가한다.

```ts
type PageContentProfile = {
  pageIndex: number;
  pageAreaPt: number;
  textCharCount: number;
  textLineCount: number;
  textAreaRatio: number;
  imageAreaRatio: number;
  imageBlocks: Array<PageImageBlock & { areaRatio: number }>;
  hasLargeImage: boolean;
  hasOcrRelevantImage: boolean;
  shouldAutoOcr: boolean;
};
```

`imageBlocks`의 구조는 유지한다. 기존 호출부는 `shouldAutoOcr`를 그대로 사용할 수 있어야 한다.

## 5. 자동 OCR 정책

`shouldAutoOcr`는 다음 중 하나라도 만족하면 true가 된다.

1. 텍스트가 전혀 없는 페이지
2. 텍스트가 40자 미만이고 대형 이미지가 있는 페이지
3. 대형 이미지가 있는 페이지
4. OCR 관련 이미지가 있는 페이지

정책을 코드로 표현하면 다음과 같다.

```ts
const shouldAutoOcr =
  input.textCharCount === 0 ||
  (input.textCharCount < LOW_TEXT_CHAR_COUNT && hasLargeImage) ||
  hasLargeImage ||
  hasOcrRelevantImage;
```

작은 로고, 도장, 아이콘만 있는 페이지는 자동 OCR 대상에서 제외한다. 이를 위해 면적 기준과 픽셀 기준을 모두 둔다. 페이지 안에서 작지만 해상도가 높은 이미지도 OCR 대상이 될 수 있고, 해상도는 낮지만 실제 페이지에서 의미 있는 크기를 차지하는 이미지도 OCR 대상이 될 수 있다.

## 6. OCR 실행 방식

기존 방식대로 페이지 전체를 PNG로 렌더링해 OCR worker에 전달한다.

```text
inspectPageContent
  -> shouldAutoOcr true
  -> renderPagePng(pageIndex, OCR_RENDER_SCALE)
  -> OCR worker recognizePng
  -> OCR regex candidates
  -> OCR page-level NER candidates when NER is ready
  -> existing candidate panel and redaction boxes
```

이미지 block만 잘라 OCR하지 않는 이유:

- 기존 좌표 변환, 중복 제거, OCR-NER 경로를 그대로 사용할 수 있다.
- 페이지 단위 OCR이 이미 회전 진단과 후보 병합 로직을 갖고 있다.
- crop OCR은 이미지 transform, clipping, 회전, 좌표 재투영의 별도 리스크가 크다.

## 7. 단일 처리와 Batch 일관성

단일 처리와 batch 모두 `PageContentProfile.shouldAutoOcr`를 기준으로 삼는다. 따라서 정책 변경은 `pageContentProfile`의 순수 로직에 모으고, 호출부에는 별도 이미지 판단을 추가하지 않는다.

단일 처리:

- `useOcrDetect`가 `pdf.inspectPageContent(page.index)`를 호출한다.
- `profile.shouldAutoOcr`가 true이면 기존 OCR queue에 넣는다.

Batch:

- `runBatchJob` 또는 batch runner가 `inspectPageContent`를 사용할 수 있으면 같은 `shouldAutoOcr` 기준을 사용한다.
- OCR 후보와 OCR-NER 후보 자동 적용 정책은 기존 batch 설정을 따른다.

## 8. 오류 처리

새 조건은 OCR 대상 선정만 넓힌다. 오류 처리 방식은 기존 OCR 흐름을 그대로 따른다.

- OCR 실패는 페이지 단위 실패로 기록한다.
- 실패한 OCR 후보는 추가하지 않는다.
- 텍스트 레이어 기반 정규식/NER 후보는 유지한다.
- NER 모델이 준비되지 않았으면 OCR-NER만 건너뛰고 OCR 정규식 후보는 생성한다.

## 9. 테스트 전략

단위 테스트:

- 텍스트가 충분하고 5% 이상 이미지가 있으면 `shouldAutoOcr === true`.
- 텍스트가 충분하고 80,000px 이상 이미지가 있으면 `shouldAutoOcr === true`.
- 텍스트가 충분하고 작은 로고 수준 이미지뿐이면 `shouldAutoOcr === false`.
- 기존 스캔본 기준과 저텍스트 대형 이미지 기준이 유지되는지 확인한다.

통합 또는 hook 테스트:

- `inspectPageContent`가 `hasOcrRelevantImage: true`, `shouldAutoOcr: true`를 반환하면 `useOcrDetect`가 `renderPagePng`를 호출한다.
- batch 경로도 같은 profile 기준으로 OCR 대상 페이지를 포함한다.

## 10. 비범위

- 이미지 영역 crop OCR
- OCR 결과를 이용한 post-check 이미지 누수 검증
- OCR 민감도 UI 옵션
- 이미지 block별 후보 출처 표시
- 외부 OCR API 또는 서버 업로드

## 11. 승인된 방향

사용자는 “텍스트가 있는 PDF라도 페이지 안에 이미지 블록이 있으면 그 이미지까지 OCR해서 후보 탐지에 포함한다”는 방향을 선택했다. 자동 OCR 트리거는 “최소 크기 이상 이미지가 있으면 OCR” 방식으로 잡는다. 기준은 페이지 면적 5% 이상 또는 이미지 픽셀 면적 80,000px 이상을 권장값으로 한다.
