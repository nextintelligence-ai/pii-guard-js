import { readFile } from 'node:fs/promises';

// 기본은 `dist/index.html` 이지만 NLP 모드 빌드(`dist-nlp/index.html`) 등 다른 산출물 검증을 위해
// `--target=<path>` 인자로 검사 대상 파일을 지정할 수 있다.
function parseArg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const targetRel = parseArg('target') ?? 'dist/index.html';

const f = await readFile(targetRel, 'utf8');

// XMLNS / XHTML / SVG / MathML namespaces 는 inline SVG/XML spec URI 로 네트워크 호출이 아니다.
// React production runtime 에 minified 로 박혀있는 react.dev/errors/ 도 string concat 일 뿐
// 실제 fetch 가 아니므로 allow list 에 둔다.
// Radix Primitives 의 a11y 경고 메시지(예: Dialog 가 Title 없을 때 console.error 로
// `radix-ui.com/primitives/docs/components/dialog` 를 안내) 도 fetch 가 아닌 string 이다.
//
// NLP 모드(`build:nlp`) 산출물에는 transformers.js / onnxruntime-web 의 inline 코드 안에
// 다음 anchor URL 들이 string 으로 박혀 있다 (런타임 fetch 가 아닌 에러 메시지/문서 링크):
// - huggingface.co/                           : transformers.js 의 모델/문서 링크
// - web.dev/cross-origin-isolation-guide/     : ort 가 SharedArrayBuffer 미지원 시 안내
// - developer.mozilla.org/                    : ort/transformers.js 가 표준 API 문서 링크
// - github.com/huggingface/transformers.js/   : 라이브러리 issue/repo 링크
// `cdn.jsdelivr.net/npm/onnxruntime-web` 은 절대 allow 하지 않는다 — 잡히면 본 task 의
// 로컬화가 깨진 것이므로 빌드를 실패시켜야 한다.
const allowList = [
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/XML/1998/namespace',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/1998/Math/MathML',
  'https://react.dev/errors/',
  'https://radix-ui.com/primitives/',
  'https://huggingface.co/',
  'https://web.dev/cross-origin-isolation-guide/',
  'https://developer.mozilla.org/',
  'https://github.com/huggingface/transformers.js/',
  // transformers.js 의 Whisper alignment_heads 안내 문구가 가리키는 gist (string only)
  'https://gist.github.com/hollance/',
];

const matches = [...f.matchAll(/https?:\/\/[^"'\s)>]+/g)]
  .map((m) => m[0])
  .filter((u) => !allowList.some((a) => u.startsWith(a)));

if (matches.length > 0) {
  console.error('외부 URL 발견:');
  for (const m of matches) console.error('  ', m);
  process.exit(1);
}
console.log(
  `OK — ${targetRel} 외부 URL 0개 (검사 ${f.length} bytes, ${(f.length / 1024 / 1024).toFixed(1)} MB)`,
);
