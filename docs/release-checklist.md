# 릴리스 체크리스트

## 빌드 / 검증
- [ ] `npm test` — 모든 단위/통합 테스트 통과
- [ ] `npm run lint` — 타입 체크 통과
- [ ] `npm run build` 성공 + `dist/index.html` 생성
- [ ] `node scripts/verify-no-external.mjs` 통과 (외부 URL 0개) — postbuild로 자동 실행됨

## 수동 검증 (사용자/QA)
- [ ] 단일 HTML 더블클릭(`file://`) — Chrome / Edge / Firefox 모두 동작 확인
- [ ] 작은 디지털 PDF 업로드 → 자동 탐지 → 적용 → 다운로드 → 결과 PDF 텍스트에 PII 부재 확인
- [ ] 회전된 페이지 PDF — 박스가 시각적으로 정렬되는지
- [ ] 암호화 PDF — 비밀번호 프롬프트 동작
- [ ] 큰 파일(>200MB) 업로드 시 경고 모달 표시
- [ ] DevTools 콘솔에 경고/에러 없는지

## 결과 PDF 메타데이터 확인
- [ ] Author, Producer, Title, Creator 등이 비어있는지

## 배포
- [ ] 변경 로그(CHANGELOG.md) 갱신 (없으면 새로 만들기)
- [ ] 태그 + GitHub 릴리스에 산출물 업로드:
  - `pdf-anony-vX.Y.Z.html`
  - `SHA256SUMS` (체크섬 파일)
- [ ] 배포 채널 안내:
  - 1차: 사내 메일/공유폴더에 단일 HTML 배포
  - 옵션: 사내 인트라넷 정적 호스팅 (`dist-multi/`)
