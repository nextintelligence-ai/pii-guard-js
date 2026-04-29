import { stat } from 'node:fs/promises';
import path from 'node:path';

// 빌드 사이즈 회귀 가드. 기본 빌드(dist/index.html)는 약 13MB, 18MB 예산.
// NLP 모드(dist-nlp/index.html)는 transformers.js 가 포함되어 별도 예산이 필요하므로
// `--budget=<MB>` 인자로 예산을, `--target=<path>` 인자로 검증 대상 경로를 덮어쓸 수 있다.
// 의존성 업데이트(특히 mupdf 신버전)나 stripMupdfWasmAsset 플러그인 패턴 미스매치 시
// 즉시 빌드를 실패시킨다.

function parseArg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const budgetArg = parseArg('budget');
const targetArg = parseArg('target');

const budgetMbNumber = budgetArg ? Number(budgetArg) : 18;
if (!Number.isFinite(budgetMbNumber) || budgetMbNumber <= 0) {
  console.error(`verify-build-size: --budget 값이 올바르지 않습니다: ${budgetArg}`);
  process.exit(1);
}
const BUDGET_BYTES = budgetMbNumber * 1024 * 1024;
const targetRel = targetArg ?? 'dist/index.html';
const targetPath = path.resolve(targetRel);

const { size } = await stat(targetPath);
const sizeMb = (size / 1024 / 1024).toFixed(2);
const budgetMb = budgetMbNumber.toFixed(0);

if (size > BUDGET_BYTES) {
  console.error(
    `verify-build-size: ${targetRel} 이 예산을 초과했습니다 (${sizeMb} MB > ${budgetMb} MB).\n` +
      `최적화 회귀일 가능성이 높습니다. ` +
      `vite.config.ts 의 stripMupdfWasmAsset 패턴 매칭, 워커 번들 mupdfBinary import 여부를 확인하세요.`,
  );
  process.exit(1);
}

console.log(`OK — ${targetRel} ${sizeMb} MB (예산 ${budgetMb} MB 이하)`);
