import { readFile } from 'node:fs/promises';

const f = await readFile('dist/index.html', 'utf8');

// XMLNS / XHTML / SVG / MathML namespaces 는 inline SVG/XML spec URI 로 네트워크 호출이 아니다.
// React production runtime 에 minified 로 박혀있는 react.dev/errors/ 도 string concat 일 뿐
// 실제 fetch 가 아니므로 allow list 에 둔다.
const allowList = [
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/XML/1998/namespace',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/1998/Math/MathML',
  'https://react.dev/errors/',
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
  `OK — 외부 URL 0개 (검사 ${f.length} bytes, ${(f.length / 1024 / 1024).toFixed(1)} MB)`,
);
