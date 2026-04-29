# NER 통합 PoC 결과 (M0)

- **작성일**: 2026-04-29
- **작성자**: 자동 측정 + 휴먼 측정 (이후 갱신)
- **PoC 환경**: macOS 14 / Node.js v22.17.0 / Vite 5.4.21 / `@huggingface/transformers` 4.2.0
- **사용 모델**: openai/privacy-filter (휴먼 측정 단계에서 받아온 변형 명시 예정)
- **상태**: **부분 완료** — controller 가 측정 가능한 항목 (Q1 일부, Q5, 외부 URL 정책)은 작성. Q2/Q3/Q4/Q6 은 dev:nlp 환경에서 모델 파일을 로드해야 측정 가능 — **휴먼 측정 단계로 이관**.

---

## Q1. file:// 단일 HTML 동작 가능 여부

**측정 상태**: 빌드 + dev 서버 부팅 + Chromium 페이지 로드까지 확인. 추론 단계는 미완료 — onnxruntime wasm 백엔드의 외부 CDN 의존성이 spec 위반이라 해결 task 필요.

**측정 결과 1: 빌드/정규식 가드**:
- `npm run build:nlp` 산출 `dist-nlp/index-nlp.html` 생성 (63 MB, 후속 Q5 참조)
- `postbuild:nlp` 의 `verify-no-external --target=dist-nlp/index-nlp.html` 가 외부 URL 발견으로 실패. transformers.js / onnxruntime-web 코드 안에 다음 URL string 들이 박혀있음:
  - `https://huggingface.co/...` (hub 안내, fetch 호출 아님)
  - `https://cdn.jsdelivr.net/npm/onnxruntime-web@.../dist/` (CDN fallback string)
  - `https://web.dev/cross-origin-isolation-guide/` (안내)
  - `https://developer.mozilla.org/...` (안내)
  - `https://github.com/huggingface/transformers.js/issues/new/choose` (안내)
  - PoC 픽스처의 `https://acme.com` (의도된 입력 문자열)
- 일부는 string-only 지만 **`cdn.jsdelivr.net` 은 실제로 fetch 가 발생** (아래 측정 결과 2 참조).

**측정 결과 2 (가장 중요): onnxruntime wasm 백엔드의 CDN 의존성**:
- vite dev 서버 + Chromium playwright 으로 페이지 로드 시 다음 fetch 가 시도됨:
  - `https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.../dist/ort-wasm-simd-threaded.asyncify.wasm`
  - `https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.../dist/ort-wasm-simd-threaded.asyncify.mjs`
- transformers.js 4.2 가 `onnxruntime-web` 의 wasm 백엔드를 **런타임에 jsdelivr CDN 에서 fetch** 하는 게 기본 동작. `env.allowRemoteModels = false` 는 모델 fetch 만 막지, 백엔드 wasm 은 별도 정책.
- spec N2/5.4 "외부 네트워크 0" 와 정면 충돌. 빌드(`build:nlp`) 의 viteSingleFile 이 wasm 까지 inline 하는 것으로 보이지만, dev/file:// 환경에서의 실제 fetch 동작 검증이 더 필요.

**해결 방향**:
- `env.backends.onnx.wasm.wasmPaths = '/ort/'` (또는 비슷한 옵션) 으로 설정
- vite middleware 로 `/ort/` 를 `node_modules/onnxruntime-web/dist/` 에 매핑
- 빌드 시점에는 onnxruntime-web 의 wasm 도 base64 임베드 (mupdf 와 동일 패턴)

> **결론**: 빌드는 가능하지만 spec 의 외부 네트워크 0 정책과 실제 동작 사이의 갭이 존재. 본구현 plan 의 첫 phase 에 **onnxruntime wasm 백엔드 로컬화 task** 가 들어가야 한다 (모델 로딩보다 우선).

---

## Q2. 영문 char offset 정확도 — **휴먼 측정 미완료**

`compareEntityOffsets` 비교 함수와 `EN_FIXTURES` (2 케이스, 6 entity) 는 코드 작성 완료. dev:nlp 에서 모델 로드 후 영문 케이스 실행 → 콘솔에서 `[en/<id>] compare { exactMatches, offsetMismatches, missing, extra }` 결과 수집 필요.

| 케이스 | exactMatches | offsetMismatches | missing | extra |
|---|---|---|---|---|
| en-basic (2 expected) | TBD | TBD | TBD | TBD |
| en-multientity (4 expected) | TBD | TBD | TBD | TBD |

> **결론 초안**: 휴먼 측정 후 채움. exactMatches 가 모두 만점이면 spanMap 알고리즘은 entity.start/end 그대로 사용 가능. mismatch 가 있으면 char-level 재정렬 필요.

---

## Q3. 한국어 char offset 정확도 — **휴먼 측정 미완료**

baseline JSON (`tests/fixtures/ner-ko-baseline.json`) 생성 후 `text.slice(start, end) === word` 검증 필요.

> **결론 초안**: 휴먼 측정. 일치율과 mismatch 패턴(조사 포함/공백/UTF-16 등)을 기록.

---

## Q4. 한국어 검출 baseline — **휴먼 측정 미완료**

`KO_FIXTURES` (2 케이스) 코드 작성 완료. dev:nlp 실행으로 baseline JSON 생성 + 카테고리별 검출 건수/평균 score 통계 필요.

| entity_group | 검출 건수 | 평균 score |
|---|---|---|
| private_person | TBD | TBD |
| private_address | TBD | TBD |
| ... | TBD | TBD |

> **결론 초안**: 휴먼 측정. 한국 이름·주소가 잡히면 보강 도구로서 가치, 잘 안 잡히면 NER 후보 기본 OFF + 사용자 검수 정책의 정당성이 더 강해짐.

---

## Q5. NLP 빌드 사이즈

**측정 상태**: 완료 (1차 측정).

**측정 결과**:

| 항목 | 크기 |
|---|---|
| `dist-nlp/index-nlp.html` 총 크기 | **63 MB (63,374 KB)** |
| gzip 후 | 17 MB (17,556 KB) |
| 35MB 예산 통과 | **NO** (1.8x 초과) |
| 정규식 단독 빌드 (`dist/index.html`) | 13.24 MB (회귀 0) |

**비중 추정** (산출 HTML 안에 inline 된 marker 검색):
- mupdf-wasm: 약 13 MB (기본 빌드와 동일)
- transformers.js + onnxruntime-web (wasm 백엔드 + JS): 추가 ~50 MB
- 기존 react/mupdf 코드: 변동 없음

**옵션 분석**:
1. **예산 상향 (예: 70 MB)** — 단순. 사용자는 70MB 단일 HTML 을 받게 됨. 더블클릭 UX 그대로. spec N7 갱신.
2. **코드 분할** — transformers.js / onnxruntime 청크를 viteSingleFile 에서 제외하고 별도 파일로 산출. 단일 HTML 원칙 깨짐 (file:// 에서 cross-file fetch 가능 여부 검증 필요).
3. **모델뿐 아니라 onnxruntime-web wasm 도 BYO** — 사용자가 모델과 함께 onnxruntime-web wasm 도 직접 가져옴. 사이즈는 줄지만 UX 복잡, 사용자가 어디서 가져와야 할지 안내 필요.
4. **q4 보다 더 강한 양자화 / 더 작은 백엔드** — transformers.js 의 백엔드 옵션을 줄임 (예: WebGPU 만, WASM 제거). file:// 의 WebGPU 가용성에 의존.

> **결론 초안**: spec N7 의 **35MB 예산은 비현실적**. 본구현 plan 작성 시 **70MB 로 상향 (옵션 1)** 이 가장 단순. 다만 사용자가 다운로드 받을 단일 HTML 이 70MB 가 되는 것이 받아들여지는지 본인 결정 필요. 받아들여지지 않으면 옵션 2 (코드 분할) 검토.

---

## Q6. WebGPU / WASM 환경 매트릭스 — **휴먼 측정 미완료**

dist-nlp/index-nlp.html 더블클릭 후 콘솔 확인 필요.

| 브라우저 | OS | WebGPU | WASM | 모델 로드 시간 | 영문 추론 시간 |
|---|---|---|---|---|---|
| Chrome | macOS 14 | TBD | TBD | TBD ms | TBD ms |
| Edge | Windows | TBD | TBD | TBD ms | TBD ms |
| Safari | macOS 14 | TBD | TBD | TBD ms | TBD ms |

> **결론 초안**: 휴먼 측정.

---

## 본구현 plan (M1~M5) 에 미치는 영향 (초안)

### Spec 갱신 후보

| Spec 항목 | 현 결정 | 갱신 제안 |
|---|---|---|
| N7. NLP 빌드 예산 | 35 MB | **70 MB 상향** (실측 63MB) |
| 5.4. 외부 네트워크 가드 | "transformers.js 가 출력하는 dev URL 만 추가 (있다면)" | **이중 정책**: (1) 안내용 string URL 은 prefix allow list 로 통과 (`huggingface.co/`, `web.dev/`, `developer.mozilla.org/`, `github.com/huggingface/transformers.js/`). (2) **실제 fetch 가 발생하는 `cdn.jsdelivr.net/npm/onnxruntime-web@...`** 는 allow 가 아니라 **로컬 서빙으로 차단** — onnxruntime-web 의 wasm 을 `node_modules/onnxruntime-web/dist/` 에서 vite middleware 로 서빙하고 `env.backends.onnx.wasm.wasmPaths` 로 가리킴. |
| **신규** N10. onnxruntime wasm 로컬화 | — | onnxruntime-web 의 wasm 백엔드를 빌드/dev 모두에서 로컬에서 가져온다. dev: vite middleware. 빌드: viteSingleFile 의 inline 동작 검증 + 필요 시 별도 base64 임베드. |
| 4.2 NER worker 의 모델 로딩 | "transformers.js `pipeline` + `env.allowRemoteModels=false`" | + `env.backends.onnx.wasm.wasmPaths` 설정 명시. |
| 7. 비기능 요구사항 | "페이지당 추론 < 3s on WebGPU, < 15s on WASM" | wasm 백엔드 로컬화 후 실측 기반으로 갱신 |

### 인프라 변경 후보 (본구현 plan 의 task 후보)

- **(최우선) onnxruntime-web wasm 의 로컬 서빙** — 본구현 plan 의 첫 phase. 이게 안 풀리면 외부 네트워크 0 정책이 깨져 spec 의 핵심 가정이 무너진다.
- `verify-no-external.mjs` 의 NLP 모드 정책 — 안내 string 은 allow, 실 fetch 는 차단 (현재 코드는 둘을 구분 못함 → 정규식이 둘 다 잡음). 정책 강화 필요.
- `verify-build-size.mjs` 의 NLP 모드 예산 (70 MB)
- viteSingleFile 이 onnxruntime-web wasm 을 빌드에 inline 하는지 정밀 검증 (산출 HTML 안에 wasm 의 base64 가 실제로 박혀있는지 grep) — 만약 안 들어가 있으면 본구현 plan 에 별도 임베드 스크립트 (mupdf 와 동일 패턴) 추가

---

## 다음 단계 (휴먼 측정 가이드)

다음 순서로 진행:

1. **OpenAI privacy-filter 모델 다운로드**
   - `huggingface.co/openai/privacy-filter` 에서 ONNX 변형 (q4 또는 fp16) 의 디렉토리 (`config.json`, `tokenizer.json`, `model.onnx` 등) 를 로컬에 받아둔다.

2. **`verify-no-external` 임시 우회**
   - 기록된 외부 URL 들이 모두 string-only 임을 확인했으니, allow list 에 임시 추가하거나 NLP 모드에서는 verify 를 우회한 빌드를 만든다.

3. **dev:nlp 실행**
   - `npm run dev:nlp` → `http://localhost:5173/index-nlp.html` 열기
   - "모델 폴더 선택" 클릭 → 받아둔 모델 디렉토리 선택
   - 콘솔에서 `[en/...]`, `[ko/...]`, `[en/...] compare`, `모델 로드 ...ms` 출력 확인
   - 자동 다운로드되는 `ner-ko-baseline.json` 을 `tests/fixtures/ner-ko-baseline.json` 으로 이동

4. **file:// 동작 확인**
   - `npm run build:nlp` (가드 우회 또는 allow list 적용 후) → `dist-nlp/index-nlp.html` 더블클릭
   - 동일 흐름으로 모델 로드 + 영문 추론 확인. 브라우저별 매트릭스 작성

5. **이 보고서의 TBD 채우기**
   - Q2/Q3/Q4/Q6 의 측정값 기입
   - 결론 초안을 실제 결론으로 갱신

6. **본구현 plan 작성**
   - 갱신된 보고서를 근거로 `docs/superpowers/plans/2026-04-29-ner-integration-impl.md` 작성
   - spec 갱신이 필요하면 spec 도 함께 수정

---

## PoC 코드 처리 방침 (Task 8 — 본구현 시점에 결정)

| 파일 | 본구현 시점에 |
|---|---|
| `src/poc/ner-poc.ts` | 폐기 → `workers/ner.worker.ts` 로 정식 분리 |
| `src/poc/poc-fixtures.ts` | `tests/fixtures/` 로 승격 (영문 통합 테스트에 재사용) |
| `src/poc/compareEntityOffsets.ts` | `tests/util/` 로 승격 (성능 모니터에 재사용) |
| `tests/unit/charOffset-baseline.test.ts` | 유지 — `compareEntityOffsets` 의 회귀 테스트 |
| `index-nlp.html` | NLP 빌드 진입점으로 정식화 (또는 `index.html` 로 통합 + mode 분기) |

방침은 본구현 plan 작성 시 확정.
