import { stat } from 'node:fs/promises';
import path from 'node:path';

// 빌드 사이즈 회귀 가드. 현재 약 13MB. 18MB 이상이면 최적화가 망가진 것.
// 의존성 업데이트(특히 mupdf 신버전)나 stripMupdfWasmAsset 플러그인 패턴 미스매치 시
// 즉시 빌드를 실패시킨다.
const BUDGET_BYTES = 18 * 1024 * 1024;
const targetPath = path.resolve('dist/index.html');

const { size } = await stat(targetPath);
const sizeMb = (size / 1024 / 1024).toFixed(2);
const budgetMb = (BUDGET_BYTES / 1024 / 1024).toFixed(0);

if (size > BUDGET_BYTES) {
  console.error(
    `verify-build-size: dist/index.html 이 예산을 초과했습니다 (${sizeMb} MB > ${budgetMb} MB).\n` +
      `최적화 회귀일 가능성이 높습니다. ` +
      `vite.config.ts 의 stripMupdfWasmAsset 패턴 매칭, 워커 번들 mupdfBinary import 여부를 확인하세요.`,
  );
  process.exit(1);
}

console.log(`OK — dist/index.html ${sizeMb} MB (예산 ${budgetMb} MB 이하)`);
