# OCR Page-Level NER Design

- **작성일**: 2026-05-01
- **상태**: Approved for planning
- **타깃**: OCR 로 얻은 한 페이지 전체 텍스트를 NER 입력으로 사용해 비정형 개인정보 후보를 보강

## 1. 목적

OCR 결과를 줄 또는 정규식 match 단위로만 처리하면 이름, 주소, 날짜, 시크릿처럼 문맥이 필요한 개인정보를 놓칠 수 있다. 이 설계는 OCR 로 얻은 **페이지 단위 전체 텍스트**를 NER 모델에 넣고, NER 결과를 OCR 글자 좌표로 되돌려 기존 후보 검수 흐름에 합류시키는 방식을 기준선으로 삼는다.

기존 정규식 OCR 탐지는 유지한다. 정규식은 주민등록번호, 전화번호, 이메일, 계좌번호, 사업자번호, 카드번호처럼 형태가 강한 PII 를 우선 탐지하고, OCR-NER 는 정규식이 약한 비정형 PII 를 보강한다.

## 2. 범위

### 포함

- OCR `OcrLine[]` 전체를 페이지 단위 `pageText` 로 직렬화한다.
- `pageText` 전체를 NER worker 의 `classify` 입력으로 사용한다.
- NER 결과의 character offset 을 OCR 글자 bbox 로 역매핑해 `source: 'ocr-ner'` 후보 박스를 만든다.
- 정규식 OCR 후보와 OCR-NER 후보가 겹치면 정규식 후보를 우선한다.
- OCR-NER 후보는 threshold 와 카테고리 정책을 적용해 자동 적용 위험을 제한한다.
- 디버그 로그는 `pageText`, raw entities, filtered entities, boxes 를 확인할 수 있게 유지한다.

### 제외

- PDF 모든 페이지의 OCR 텍스트를 하나로 합친 문서 단위 NER.
- 클라우드 OCR 또는 클라우드 NER.
- OCR 결과를 다시 OCR 해서 post-check 하는 이미지 기반 누수 검증.
- OCR-NER 전용 신규 UI. 기존 후보 패널과 batch 정책을 사용한다.

## 3. 현재 기준선

현재 코드에는 이미 페이지 단위 OCR-NER 흐름이 있다.

- `src/hooks/useOcrDetect.ts`
  - OCR 대상 페이지를 렌더링하고 `ocr.recognizePng` 로 `OcrLine[]` 을 얻는다.
  - `detectOcrNerBoxes` 에서 `ocrLinesToPageText` 로 페이지 전체 OCR 텍스트를 만든다.
  - NER 모델이 준비되어 있으면 `nerWorker.classify(pageText)` 를 호출한다.
  - `filterNerEntitiesForText` 후 `ocrLinesToNerBoxes` 로 OCR bbox 후보를 만든다.
- `src/core/ocr/ner.ts`
  - OCR line 을 `StructuredLine[]` 으로 바꾼다.
  - `serialize` 와 `entitiesToBoxes` 를 사용해 NER offset 을 OCR 좌표 박스로 되돌린다.
- `src/state/store.ts`
  - OCR-NER 후보를 `source: 'ocr-ner'` 로 저장한다.
  - category enabled 상태와 `nerThreshold` 로 활성화 여부를 결정한다.

따라서 1차 목표는 새 파이프라인을 만들기보다, 이 기준선을 명시하고 품질 보강 지점을 좁히는 것이다.

## 4. 데이터 흐름

```text
MuPDF render page PNG
  -> OCR worker recognizePng
  -> OcrLine[]
  -> OCR regex detector
       -> source: 'ocr' candidates
  -> ocrLinesToPageText
       -> pageText + OCR char map
  -> NER classify(pageText)
       -> entities: { entity_group, start, end, score }
  -> filterNerEntitiesForText
  -> entitiesToBoxes
       -> source: 'ocr-ner' candidates
  -> duplicate/overlap handling
  -> existing CandidatePanel and redaction boxes
```

`pageText` 는 한 페이지 안의 OCR 라인을 순서대로 이어 붙이고, 줄 경계는 `\n` 으로 보존한다. NER 는 이 페이지 전체 문맥을 보고 entity 를 판단한다. 좌표 복원은 entity 의 `[start, end)` 범위에 대응하는 OCR char bbox 를 모아 line 단위 박스로 변환한다.

## 5. 후보 정책

정규식 후보와 OCR-NER 후보는 역할이 다르다.

- `source: 'ocr'`: 형태가 명확한 정형 PII. 기본 자동 적용 대상에 포함할 수 있다.
- `source: 'ocr-ner'`: 문맥 기반 비정형 PII. threshold 와 카테고리별 기본값을 적용한다.

권장 기본값:

| NER category | 정책 |
| --- | --- |
| `private_person` | threshold 이상이면 기본 ON 가능 |
| `private_address` | 기본 OFF 또는 검수 권장 |
| `private_date` | 기본 OFF 권장 |
| `private_url` | 기본 OFF 권장 |
| `secret` | 기본 OFF, 높은 confidence 는 패널에서 눈에 띄게 유지 |

정규식과 중복되는 email, phone, account 계열 entity 가 NER 에서 나오면 정규식 후보를 우선하고 OCR-NER 후보는 드롭하거나 겹침 제거한다.

## 6. 중복과 좌표 처리

가장 큰 리스크는 NER 판단 자체보다 OCR offset 을 정확한 PDF 박스로 복원하는 부분이다. OCR 은 글자 순서, 줄 분리, char bbox 가 흔들릴 수 있다.

처리 원칙:

- entity 가 여러 줄을 가로지르면 줄별 박스로 나눈다.
- `\n` 같은 synthetic line break 는 박스 생성에서 제외한다.
- bbox 가 없는 글자는 후보 생성에 사용하지 않는다.
- 정규식 OCR 후보와 충분히 겹치는 OCR-NER 후보는 정규식 후보를 남긴다.
- 매우 작은 박스, 페이지 밖 박스, 면적이 비정상적으로 큰 박스는 후처리에서 제거할 수 있게 한다.

## 7. 오류 처리

OCR-NER 는 보강 기능이므로 실패해도 OCR 정규식 탐지와 문서 처리 전체를 막지 않는다.

- NER 모델이 준비되지 않았으면 OCR-NER pass 를 건너뛴다.
- 알려진 런타임 오류가 발생하면 해당 OCR run 에서 OCR-NER 를 비활성화한다.
- 페이지 단위 오류는 해당 페이지 OCR progress 에만 반영하고 다음 페이지 처리를 계속한다.
- 실패한 OCR-NER 는 후보를 만들지 않으며, 기존 `source: 'ocr'` 후보는 유지한다.

## 8. 테스트 전략

단위 테스트:

- OCR line 을 `pageText` 로 직렬화할 때 줄 경계와 char offset 이 유지되는지 검증한다.
- 여러 줄 entity 가 줄별 박스로 분리되는지 검증한다.
- 정규식 OCR 후보와 OCR-NER 후보가 겹칠 때 정규식 우선 정책이 적용되는지 검증한다.
- threshold 미만 OCR-NER 후보가 비활성화되는지 검증한다.

통합 테스트:

- 스캔본 fixture 에서 OCR 정규식 후보와 OCR-NER 후보가 함께 생성되는지 검증한다.
- NER 모델이 없을 때 OCR 정규식 흐름이 계속 동작하는지 검증한다.
- OCR-NER 런타임 실패가 전체 OCR queue 를 중단하지 않는지 검증한다.

## 9. 후속 보강

페이지 전체 OCR-NER 기준선으로 충분하지 않은 실제 누락 사례가 쌓이면, 다음 단계에서 OCR 라벨 문맥 pass 를 추가한다.

예:

- `성명` 라벨 다음 줄의 이름 후보를 `성명: 홍길동` 형태로 재구성해 별도 NER 입력으로 보낸다.
- `주소`, `신청인`, `대표자`, `사용자명` 주변 OCR 라인을 짧은 문맥으로 재구성한다.
- 이 보조 pass 의 결과는 기존 `ocr-ner` 후보로 합치되, 중복 제거와 threshold 정책은 동일하게 적용한다.

이 보강은 기준선이 아니라 누락 케이스 기반의 2차 개선으로 둔다.

## 10. 승인된 방향

사용자는 OCR 결과를 문서 전체가 아니라 **한 페이지 전체 텍스트 단위**로 NER 에 넣는 방향을 승인했다. 구현은 현재 OCR-NER 흐름을 유지하면서, 중복 제거, 좌표 품질, 카테고리별 자동 적용 정책을 중심으로 보강한다.
