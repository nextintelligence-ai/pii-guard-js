# OpenAI Privacy Filter NER 통합 설계 문서

- **작성일**: 2026-04-29
- **상태**: Draft (사용자 검토 대기)
- **타깃**: 기존 `pdf-anony` 의 정규식 6종 탐지에 NER 5종(이름/주소/URL/날짜/시크릿) 보강
- **참조 모델**: [openai/privacy-filter](https://huggingface.co/openai/privacy-filter) (Apache 2.0, 1.5B 파라미터 / 50M active, BIOES 토큰 분류)

---

## 1. 목적과 범위

`pdf-anony` 는 한국어 PDF 의 정형 PII 6종(주민/전화/이메일/계좌/사업자/카드)을 정규식으로 탐지한다. 이 도구가 원천적으로 못 잡는 **비정형 PII**(사람 이름, 주소, URL, 날짜, 시크릿/키)를 OpenAI 가 공개한 `openai/privacy-filter` NER 모델로 보강한다.

### 1.1 핵심 요구사항
1. NER 모델은 **사용자가 직접 다운로드** 하여 BYOM(Bring-Your-Own-Model) 으로 로드한다. 도구는 모델을 외부에서 가져오지 않는다.
2. 기본 빌드(`npm run build`)는 회귀 0 — **18MB 단일 HTML, 정규식 단독** 그대로 유지한다.
3. NER 빌드(`npm run build:nlp`)는 별도 산출물 — onnxruntime/transformers.js 까지 포함한 단일 HTML, file:// 더블클릭 동작 유지.
4. NER 결과는 **항상 사용자 검수의 입력**이며, 자동으로 redaction 대상이 되지 않는다 (기본 체크 OFF).
5. 정규식 6종의 결과·UX·성능에는 **회귀가 없어야 한다**.

### 1.2 비범위
- 한국어 fine-tune 모델 직접 학습/제공 (사용자가 받아온 어떤 호환 모델이든 로드 가능하지만, 도구 내에서 학습은 하지 않음)
- 모델 다운로드 자동화/번들 (BYOM 원칙)
- 다국어 UI / 비-한국어 PDF 의 정규식 별도 룰셋
- 클라우드 추론 / 외부 API 폴백
- M5 마일스톤 이후의 추가 카테고리 (예: 의료/법률 도메인 특화)

---

## 2. 확정된 결정 (Decisions Log)

| # | 결정 | 비고 |
| - | --- | --- |
| N1 | 통합 위치 = **현 `pii-guard-js` 에 NER 보강 레이어 추가** | 별도 PoC/별도 도구 X |
| N2 | 모델 배포 = **BYOM, 사용자가 외부에서 다운로드** | "외부 네트워크 0" 제약 유지 |
| N3 | 모델 캐시 = **OPFS (`navigator.storage.getDirectory()`)** | localStorage 메타와 함께 |
| N4 | NER 과 정규식 관계 = **보강 전용**. 겹치는 3종(계좌/전화/이메일)은 정규식 우선, NER 무시. NER 단독 5종(person/address/url/date/secret)만 추가 | |
| N5 | 추론 트리거 = **문서 로드 직후 자동 + 페이지 단위 큐**. 현재 페이지 우선순위 승격 | 일괄 추론 X (UX) |
| N6 | 신뢰도 = **score ≥ 0.7 (조정 가능)**, NER 후보는 **모두 기본 체크 OFF** | 정규식은 기본 ON 유지 |
| N7 | 빌드 분기 = **`npm run build:nlp` 신설**. 기본 빌드는 18MB 그대로 | `verify-build-size.mjs` NLP 모드 예산 35MB |
| N8 | 추론 백엔드 = **WebGPU 우선, WASM/CPU 폴백** | 둘 다 불가 시 NER 비활성 + 경고 |
| N9 | NER 워커 = **mupdf 워커와 분리**된 `workers/ner.worker.ts` | 책임 격리 |

---

## 3. 시스템 아키텍처

```
┌──────────────────────────── 메인 스레드 ────────────────────────────┐
│  App.tsx                                                           │
│   ├─ Toolbar: [PDF 열기] [NER 모델 로드] [익명화] [저장] [도움말]    │
│   ├─ CandidatePanel: 정규식 6종 + NER 5종 (출처 뱃지, 신뢰도 슬라이더)│
│   ├─ NerProgress: 페이지별 추론 진행률                              │
│   └─ PdfCanvas + BoxOverlay                                        │
│                                                                    │
│  hooks/                                                            │
│   ├─ useAutoDetect      정규식 전체 → store (현재 동작 유지)         │
│   ├─ useNerDetect       NER 디스패처 트리거 → store                  │
│   ├─ useNerModel        모델 로드 / OPFS 캐시 / 상태 머신            │
│   └─ useApply           기존 그대로 (체크된 candidates 만 redaction) │
└────────────────────────────────────────────────────────────────────┘
        │ comlink                         │ comlink
        ▼                                 ▼
┌─ pdf.worker.ts (mupdf, 기존) ─┐  ┌─ ner.worker.ts (신규) ───────────────┐
│  open / render / extract     │  │  loadModel(buf | dirHandle)          │
│  applyRedactions / save      │  │  classify(text) → Entity[]           │
│  getStructuredText           │  │  - transformers.js pipeline          │
│   (char-level + bbox)        │  │  - WebGPU → WASM 폴백                 │
└──────────────────────────────┘  │  - aggregation_strategy: "simple"    │
                                  └──────────────────────────────────────┘
```

### 3.1 핵심 원칙

- **워커 분리**. mupdf 워커와 NER 워커는 서로 모른다. 메인 스레드의 store 가 결과 합류 지점.
- **결과 데이터만 메인으로**. 모델 가중치/토크나이저는 NER 워커 안에만 머문다.
- **모든 좌표는 PDF point**. 정규식과 동일하게 NER 결과도 PDF point bbox 로 store 에 들어간다.
- **외부 네트워크 0 유지**. transformers.js 가 기본으로 hub 에서 모델을 가져오는 동작은 비활성화 (`env.allowRemoteModels = false`, `env.allowLocalModels = true`). 모델 경로는 OPFS handle 또는 ArrayBuffer 로만 주입.

### 3.2 데이터 흐름 (한 페이지 기준)

```
PDF 로드
  ├→ 정규식: useAutoDetect 가 전체 페이지 즉시 탐지 → store.regex 후보 (기존)
  └→ NER: useNerDetect 가 nerDispatcher 에 모든 페이지 enqueue
       페이지마다:
         pdf.worker.extractStructuredText(p)
           → spanMap.serialize(structuredText)
             = { pageText: string, charIndex: Array<{charIdx → {span, bbox}}> }
         ner.worker.classify(pageText)
           → entities[]: { entity_group, start, end, score, word }
         spanMap.entitiesToBoxes(entities, charIndex, threshold)
           → Candidate[]: { kind: 'ner', category, bbox[], score, source: 'ner' }
         store.addCandidates(p, candidates, defaultChecked=false)

사용자 검수 (CandidatePanel)
  - 정규식 후보: 기본 ON. 체크 해제로 제외
  - NER 후보: 기본 OFF. 체크 ON 으로 포함
  - 신뢰도 슬라이더: NER 후보를 score 임계값으로 필터링 (raw 결과는 store 에 모두 보관)
  - 수동 박스 추가: 기존 동작 유지

익명화 적용
  - useApply: 체크된 candidates 의 bbox 합집합을 mupdf redaction → applyRedactions
  - 검증: postCheckLeaks === 0 (기존)
```

---

## 4. 핵심 컴포넌트 설계

### 4.1 모델 로더 (`core/nerModel.ts` + `hooks/useNerModel.ts`)

**상태 머신**
```
idle ─[사용자 폴더 선택]─→ loading ─[성공]─→ ready
                              └──[실패]─→ error
ready ─[새 모델 로드]─→ loading
일부 환경: idle ─[WebGPU/WASM 모두 불가]─→ unsupported
```

**입력 형식**
- `<input type="file" webkitdirectory>` 로 사용자가 모델 폴더 선택 (config.json, tokenizer.json, model.onnx 등 transformers.js 가 기대하는 디렉토리 레이아웃)
- 또는 ONNX 단일 파일 + 자동 탐색 fallback (config 없으면 거부)

**OPFS 캐시 정책**
- 첫 로드 시 사용자 선택 파일을 OPFS 하위 `models/<sha256-of-config-hash>/` 로 복사
- localStorage 메타: `{ id: <hash>, label_map, modelName, loadedAt }`
- 다음 진입 시 메타 일치하면 OPFS 에서 자동 로드, 사용자에게 "이전 모델로 시작" 선택지 제공
- 사용자가 다른 모델 가져오면 새 hash 로 별도 디렉토리 생성, 기존 캐시는 "관리" UI 에서만 삭제 가능

**진행률**
- 사용자 측 다운로드 자체는 도구 밖. 도구는 사용자가 선택한 파일을 OPFS 로 복사할 때만 진행률을 보여준다 (수 GB 단위 대비).

### 4.2 NER 워커 (`workers/ner.worker.ts`)

**comlink API**
```ts
interface NerWorker {
  load(modelHandle: FileSystemDirectoryHandle | ArrayBuffer): Promise<{
    labelMap: Record<number, string>
    backend: 'webgpu' | 'wasm'
  }>
  classify(pageText: string): Promise<Entity[]>
  unload(): Promise<void>
}

interface Entity {
  entity_group: string  // 'private_person' 등
  start: number          // pageText 의 char offset (start)
  end: number            // pageText 의 char offset (exclusive)
  score: number
  word: string
}
```

**구현 지침**
- `import { pipeline, env } from '@huggingface/transformers'` 후 `env.allowRemoteModels = false; env.allowLocalModels = true`
- 첫 시도: `pipeline('token-classification', modelPath, { device: 'webgpu', dtype: 'q4' })`
- WebGPU 초기화 실패 catch → `{ device: 'wasm' }` 로 재시도
- 호출 시 `aggregation_strategy: 'simple'` 로 entity 단위 출력
- **Score hard floor = 0.5**. `score < 0.5` 는 워커가 자체 폐기. UI 신뢰도 슬라이더(0.5–0.95, 기본 0.7)는 이 위에서만 조정. 슬라이더 변경 시 추론 재실행 없이 store 의 raw 결과를 다시 필터.

### 4.3 텍스트 ↔ PDF 좌표 매핑 (`core/spanMap.ts`)

이 모듈이 **이번 작업의 가장 큰 기술 위험**이다. 분리해서 단위 테스트로 보호한다.

**자료구조**
```ts
interface CharIndexEntry {
  pageTextOffset: number   // pageText 안에서의 char offset
  pdfBbox: BBox            // PDF point 좌표
  lineId: number
  spanId: number
}

interface PageMap {
  pageText: string
  charIndex: CharIndexEntry[]   // pageText[i] ↔ charIndex[i]
}
```

**`serialize(structuredText): PageMap`**
1. mupdf `getStructuredText` 의 line/span/char 트리를 in-order 순회
2. 각 char 의 bbox 를 PDF point 로 기록
3. line 사이에는 `\n` 한 글자 추가 (charIndex 도 동일 길이로 padding — 해당 entry 의 bbox 는 직전 char bbox 와 같게 두되, "줄경계" flag 표시)
4. 결과 `pageText` 의 길이 == `charIndex.length`

**`entitiesToBoxes(entities, charIndex, threshold): Candidate[]`**
- `entity.score < threshold` 면 스킵 (단, raw 보관 정책 따라서 store 단에서 필터하는 것도 가능 — 기본은 worker 가 모두 보내고 UI 에서 필터)
- entity 의 `[start, end)` 구간의 charIndex entry 를 line 단위로 그룹화
- 그룹마다 bbox 합집합 → 하나의 Candidate (BBox 여러 줄을 가로지르면 line 별로 별도 Candidate 생성, kind/source/score 동일)

**카테고리 매핑**
| NER `entity_group` | 도구 카테고리 | 정규식과 충돌? |
|---|---|---|
| `private_person` | `person` (신규) | X |
| `private_address` | `address` (신규) | X |
| `private_url` | `url` (신규) | X |
| `private_date` | `date` (신규) | X |
| `secret` | `secret` (신규) | X |
| `private_email` | `email` (기존) | **드롭** (정규식 우선) |
| `private_phone` | `phone` (기존) | **드롭** (정규식 우선) |
| `account_number` | `account` (기존) | **드롭** (정규식 우선) |

### 4.4 NER 디스패처 (`core/nerDispatcher.ts`)

**큐 동작**
```ts
interface DispatcherState {
  queue: Array<{ pageIndex: number; priority: number; createdAt: number }>
  inFlight: { pageIndex: number; abortController: AbortController } | null
  results: Map<number, Candidate[]>  // 페이지별 결과 캐시
}
```

- `enqueueAll(pageCount)` — 모든 페이지를 priority=0 으로 추가
- `bumpPriority(pageIndex)` — `PageNavigator` 가 페이지 전환 시 호출, priority=10 으로 승격, 이미 처리됨이면 무시
- `start()` — 한 번에 1개만 in-flight, priority desc / createdAt asc 로 다음 작업 선택
- `cancel()` — 새 문서 로드 시 호출. inFlight abort + queue clear + results clear

**진행률 노출**
- `useNerDetect` 가 디스패처 상태를 셀렉터로 구독, `NerProgress` 컴포넌트가 사이드바 상단에 진행률 표시 (`12 / 47 페이지`)

### 4.5 카테고리 패널 (`CandidatePanel`)

기존 6 카테고리 → 11 카테고리 (정규식 6 + NER 5).

**시각적 변경**
- 카테고리 헤더 우측에 출처 뱃지: `정규식` (회색) / `NER · 검수 필요` (주황)
- NER 카테고리 그룹 상단에 **신뢰도 슬라이더** (0.5–0.95, step 0.05, 기본 0.7). store 에는 hard floor 0.5 이상의 모든 후보가 들어가 있고, 슬라이더는 화면 표시/체크 가능 후보를 필터링만 한다. 추론·store 변경 없음.
- NER 후보의 기본 체크 상태 = OFF (정규식은 기존대로 ON)
- NER 모델 미로드 시: 정규식 6 카테고리만 표시. NER 5 카테고리 자리에 "NER 모델을 로드하면 추가 카테고리가 활성화됩니다" 안내 카드

### 4.6 Toolbar 와 진입 UX

- `[NER 모델 로드]` 버튼 추가 (NLP 빌드에서만 노출)
- 첫 진입 시 OPFS 캐시 확인:
  - 캐시 있음 → 자동 로드 + 토스트 "이전 NER 모델로 시작합니다"
  - 캐시 없음 → 버튼은 활성, 사용자가 누를 때까지 정규식만 동작
- `UsageGuideModal` 에 NER 사용법 한 단계 추가

---

## 5. 빌드 및 배포

### 5.1 스크립트 (`package.json` 추가분)

```jsonc
{
  "build:nlp":      "tsc -b && vite build --mode nlp",
  "prebuild:nlp":   "node scripts/embed-wasm.mjs && node scripts/embed-onnx-runtime.mjs",
  "postbuild:nlp":  "node scripts/verify-no-external.mjs && node scripts/verify-build-size.mjs --budget=35"
}
```

### 5.2 Vite 분기

- `vite.config.ts` 의 `mode === 'nlp'` 분기에서:
  - `@huggingface/transformers` + onnxruntime-web wasm 을 산출물에 포함
  - 메인 코드의 NER 진입점 (`hooks/useNerDetect`, `core/nerDispatcher`, `workers/ner.worker.ts`) 활성
- 기본 모드에서는 NER 코드가 import 되지 않도록 `import.meta.env.MODE === 'nlp'` 가드 + dynamic import. tree-shake 로 번들 미포함 보장

### 5.3 산출물

| 모드 | 명령 | 산출 | 예산 |
|---|---|---|---|
| 정규식 단독 (기본) | `npm run build` | `dist/index.html` | 18 MB |
| NER 포함 | `npm run build:nlp` | `dist-nlp/index.html` | 35 MB |

둘 다 단일 HTML, file:// 더블클릭 동작. 사용자는 필요한 쪽을 받는다.

### 5.4 외부 네트워크 가드

`scripts/verify-no-external.mjs` 의 allow list 에 transformers.js 가 dev 안내용으로 출력하는 URL 만 추가 (있다면). 모델 hub URL, telemetry 엔드포인트는 발견 즉시 빌드 실패. NLP 모드에서도 산출 HTML 안의 모든 URL 을 동일 정책으로 검사한다.

---

## 6. 테스트 전략

### 6.1 단위 테스트

- `core/spanMap.ts`
  - 한 줄짜리 텍스트의 entity → 단일 bbox
  - 줄 경계 가로지르는 entity → line 별 분할 bbox
  - 빈 페이지/회전된 페이지/CJK 문자
- `core/nerDispatcher.ts`
  - 큐 우선순위 (priority desc, createdAt asc)
  - bumpPriority 가 inFlight 에는 영향 X
  - cancel 후 results 비어있는지

### 6.2 통합 테스트

- 영문 픽스처 PDF: `Alice Smith works at acme.com (212-555-0100). Visit http://example.com.` → person/url 검출 → redaction → `postCheckLeaks === 0`
- 한국어 픽스처 PDF: `김철수님 (서울특별시 강남구 테헤란로 123) 연락처 010-1234-5678` → 모델 한국어 성능 **모니터** (회귀 테스트 X). score 와 검출 카테고리를 `tests/fixtures/ner-ko-baseline.json` 에 저장, 변동 시 경고만 출력
- 정규식 회귀 테스트: 기존 6종 통합 테스트 그대로 통과 (NER 빌드에서도)

### 6.3 모델 의존 테스트 정책

- 실 1.5B 모델은 CI 부담이 커서 **소형 모킹 모델** 또는 **NER worker 모킹** 으로 대부분의 통합 테스트 작성
- 실모델 검증은 로컬에서만 수행하는 별도 스위트(`tests/integration/ner-realmodel.test.ts`, default skip)

---

## 7. 비기능 요구사항

| 항목 | 목표 |
|---|---|
| 첫 모델 로드 (OPFS 복사) | 진행률 표시. 캐시 후 다음 진입은 < 5s 모델 init |
| 페이지당 추론 (영문, A4 1쪽) | < 3s on WebGPU, < 15s on WASM. 미달 시 토스트로 경고 |
| 메모리 (50쪽 PDF) | 페이지 결과 누적, raw text/charIndex 는 페이지 처리 후 폐기. 추론 중 메모리 사용량 모니터 |
| file:// 동작 | NER 빌드도 더블클릭 동작 유지. OPFS / WebGPU / WASM 모두 file:// 에서 동작 확인 (브라우저 매트릭스 별도 표) |
| 외부 호출 0 | `verify-no-external.mjs` 통과. transformers.js `env.allowRemoteModels = false` |
| 정규식 회귀 | 기본 빌드 산출물 사이즈/동작 무변. 통합 테스트 동일 통과 |

---

## 8. 마일스톤

| M | 내용 | 산출물 |
|---|---|---|
| **M0** | PoC: transformers.js 로 OpenAI privacy-filter 영문 추론 + char offset 정확도 측정 + WebGPU/WASM file:// 동작 확인 | `docs/poc-ner-report.md` |
| **M1** | NER worker + 모델 로더 (OPFS 캐시) + 빌드 분기 (`build:nlp`) + 사이즈 가드 35MB 통과 | `workers/ner.worker.ts`, `core/nerModel.ts`, `hooks/useNerModel.ts` |
| **M2** | spanMap (텍스트↔PDF 좌표 매핑) + 단위 테스트 풀 커버 | `core/spanMap.ts` |
| **M3** | nerDispatcher + useNerDetect 자동 트리거 + NerProgress UI | `core/nerDispatcher.ts`, `hooks/useNerDetect.ts`, `components/NerProgress.tsx` |
| **M4** | CandidatePanel 5 카테고리 추가, 출처 뱃지, 신뢰도 슬라이더, 기본 OFF, UsageGuideModal 갱신 | `components/CandidatePanel.tsx`, `components/Toolbar.tsx` 변경 |
| **M5** | 통합 테스트 (영문 픽스처 풀 플로우 + 한국어 성능 모니터) + README/CLAUDE.md 갱신 + 릴리스 체크리스트 갱신 | 문서 + 통합 테스트 |

각 마일스톤 종료 게이트: `npm test && npm run lint && npm run build && npm run build:nlp` 4종 모두 통과.

---

## 9. 위험과 완화

| 위험 | 영향 | 완화 |
|---|---|---|
| transformers.js 의 한국어 토크나이저가 char offset 을 부정확하게 보고 | spanMap 결과 어긋남, 잘못된 redaction box | M0 PoC 에서 한국어 char offset 정확도 직접 측정. 부정확하면 char-level 재정렬 layer 추가 |
| 모델 한국어 성능이 사용 불가 수준 | 사용자 가치 X | NER 후보 기본 OFF + 신뢰도 슬라이더로 사용자가 직접 검증. 한국어 fine-tune 모델을 BYOM 으로 가져올 길은 열어둔다 |
| onnxruntime-web wasm 사이즈가 35MB 예산도 초과 | NER 빌드 산출 실패 | M0 PoC 단계에서 측정. 초과 시 옵션: q4 더 강한 양자화, 백엔드 wasm 분리 (사용자 폴더 선택), 예산 추가 상향 |
| WebGPU 가 file:// 에서 비활성 (브라우저 일부) | NER 활성화 실패 | WASM 폴백 + 폴백 시 명시적 토스트 (`현재 환경에서는 NER 추론이 느릴 수 있습니다`) |
| 모델 로드 / 추론 중 사용자가 새 PDF 로드 | race condition | nerDispatcher.cancel + abortController. 단위 테스트로 보호 |
| OPFS 가 file:// 에서 비활성 | 캐시 불가, 매번 사용자가 폴더 선택 | 메모리 fallback (한 세션 안에서만 유효). 명시적 토스트 |

---

## 10. 라이선스 / 모델 카드 표기

- 도구는 Apache 2.0 인 OpenAI privacy-filter 모델을 사용할 수 있음을 README 에 명시. 기본 빌드는 모델 의존 없음, NLP 빌드는 사용자 BYOM
- `UsageGuideModal` 에 모델 카드 링크와 한국어 한계 명시 ("이름/주소 자동 식별은 모델의 영어 우선 학습 특성상 한국어에서 누락이 있을 수 있어 사용자 검수가 필요합니다")
- `NerProgress` 또는 모델 로드 토스트에 모델 식별자(메타에 저장된 modelName) 노출 — 어떤 모델로 추론 중인지 사용자가 알 수 있도록

---

## 11. 후속 (비범위지만 인터페이스 여지를 둠)

- 한국어 fine-tune 모델 적용 시 카테고리/임계값 다른 정책 자동 적용 — `config.json` 의 메타 (`labels`, `language`) 식별
- spanMap 의 OCR 산출물 입력 — 현재는 mupdf structured text 만 가정. OCR 마일스톤에서 동일 인터페이스로 받을 수 있게 `TextSource` 추상화 (현 인터페이스 그대로 활용 가능)
- 사용자 정의 카테고리 (사내 식별자 등) 는 정규식 detector 추가 경로로 — NER 보다 정규식이 더 적합
