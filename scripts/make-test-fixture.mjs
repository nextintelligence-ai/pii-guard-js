import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const doc = await PDFDocument.create();
const page = doc.addPage([595, 842]); // A4
const font = await doc.embedFont(StandardFonts.Helvetica);

// Helvetica 는 한글을 지원하지 않으므로 ASCII 라벨 + 패턴으로 합성 PII 작성.
// 탐지기는 email/phone/card 등 라틴 패턴 기반이므로 그대로 매칭된다.
const lines = [
  'Test PDF for integration testing',
  '',
  'Email: dummy@example.com',
  'Phone: 010-1234-5678',
  'Card: 4242-4242-4242-4242',
];

let y = 800;
for (const line of lines) {
  page.drawText(line, { x: 50, y, size: 14, font, color: rgb(0, 0, 0) });
  y -= 24;
}

const bytes = await doc.save();
const outDir = path.resolve('tests/fixtures');
await mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, 'digital-with-pii.pdf');
await writeFile(outPath, bytes);
console.log(
  `make-test-fixture: ${bytes.length} bytes → tests/fixtures/digital-with-pii.pdf`,
);
