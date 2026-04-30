import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

function parseArg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const targetRel = parseArg('target') ?? 'dist';
const targetPath = path.resolve(targetRel);
const textExtensions = new Set(['.html', '.js', '.css', '.json', '.mjs', '.map']);

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
  'https://gist.github.com/hollance/',
];

async function collectFiles(filePath) {
  const info = await stat(filePath);
  if (info.isFile()) {
    return textExtensions.has(path.extname(filePath)) ? [filePath] : [];
  }

  if (!info.isDirectory()) {
    return [];
  }

  const entries = await readdir(filePath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => collectFiles(path.join(filePath, entry.name))),
  );
  return nested.flat();
}

const files = await collectFiles(targetPath);
const matches = [];
let totalBytes = 0;

for (const filePath of files) {
  const content = await readFile(filePath, 'utf8');
  totalBytes += Buffer.byteLength(content);
  for (const match of content.matchAll(/https?:\/\/[^"'\s)>]+/g)) {
    const url = match[0];
    if (!allowList.some((allowed) => url.startsWith(allowed))) {
      matches.push({ filePath, url });
    }
  }
}

if (matches.length > 0) {
  console.error('외부 URL 발견:');
  for (const match of matches) {
    console.error(`  ${path.relative(process.cwd(), match.filePath)}: ${match.url}`);
  }
  process.exit(1);
}

console.log(
  `OK — ${targetRel} 외부 URL 0개 (검사 ${files.length} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB text)`,
);
