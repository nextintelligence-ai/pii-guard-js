# 2026-04-29 WASM 워커 초기화 오류 사고

## 증상

S3+CloudFront 배포 후 파일 업로드 시 `pdf.worker init error: Uncaught RuntimeError: Aborted(... Invalid URL)` 가 발생했다. 로컬(`file://`)에서는 정상 동작했기 때문에 배포 전에는 발견하지 못했다.

## 근본 원인

`mupdf.js`가 `import` 평가 시점에 `globalThis.$libmupdf_wasm_Module.wasmBinary`를 읽는 top-level await를 포함한다. `file://` 환경에서는 `fileProtocolInlineModuleWorker` Vite 플러그인이 bootstrapper 워커를 통해 모듈 import 전에 wasmBinary를 주입했지만, `https://` 환경에서는 해당 분기(`protocol === "file:"`)가 실행되지 않아 wasmBinary 없이 WASM 초기화가 시도됐다.

## 수정

`vite.config.ts`의 `deferredWasmModuleWorker` 플러그인에서 프로토콜 분기 조건을 제거해 모든 환경에서 bootstrapper 방식을 적용.

## 교훈

`file://` 로컬 동작 ≠ `https://` CDN 동작. 특히 Web Worker + WASM + 동적 import 조합은 프로토콜마다 다른 경로를 탄다.
