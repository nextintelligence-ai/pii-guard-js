# 릴리스 체크리스트

## 빌드 / 검증
- [ ] `npm test` — 모든 단위/통합 테스트 통과
- [ ] `npm run lint` — 타입 체크 통과
- [ ] `public/models/paddleocr/PP-OCRv5_mobile_det_onnx.tar` 존재
- [ ] `public/models/paddleocr/korean_PP-OCRv5_mobile_rec_onnx.tar` 존재
- [ ] `npm run build` 성공 + `dist/index.html`, JS chunks, WASM, `/ort/`, `/models/paddleocr/` 자산 생성
- [ ] `node scripts/verify-no-external.mjs` 통과 (외부 URL 0개) — postbuild로 자동 실행됨
- [ ] 빌드 산출물 안에 외부 fetch 발생 URL(jsdelivr, paddle-model-ecology 등) 0개

## 수동 검증 (사용자/QA)
- [ ] 정적 서버/CloudFront URL에서 앱 로드 확인
- [ ] 작은 디지털 PDF 업로드 → 자동 탐지 → 적용 → 다운로드 → 결과 PDF 텍스트에 PII 부재 확인
- [ ] 스캔 PDF 업로드 → OCR 상태 표시 → 후보 패널에 `OCR` 배지 표시 → 선택한 OCR 박스가 저장 PDF에서 마스킹되는지 확인
- [ ] DevTools Network에 `/models/paddleocr/` 및 `/ort/` 404가 없는지 확인
- [ ] 회전된 페이지 PDF — 박스가 시각적으로 정렬되는지
- [ ] 암호화 PDF — 비밀번호 프롬프트 동작
- [ ] 큰 파일(>200MB) 업로드 시 경고 모달 표시
- [ ] DevTools 콘솔에 경고/에러 없는지
- [ ] `NER 모델 로드` → 받아둔 모델로 영문/한국어 추론 성공

## 결과 PDF 메타데이터 확인
- [ ] Author, Producer, Title, Creator 등이 비어있는지

## 배포
- [ ] 변경 로그(CHANGELOG.md) 갱신 (없으면 새로 만들기)
- [ ] `dist/index.html`은 짧은 cache-control로 업로드
- [ ] `dist/assets/**`, `dist/ort/**`, `dist/models/**`는 긴 immutable cache-control로 업로드
- [ ] CloudFront invalidation 실행
- [ ] 배포 채널 안내:
  - 1차: CloudFront 정적 사이트 URL
  - 옵션: 사내 인트라넷 정적 호스팅 (`dist/` 전체)
