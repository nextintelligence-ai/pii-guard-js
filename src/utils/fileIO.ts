export async function fileToArrayBuffer(f: File): Promise<ArrayBuffer> {
  return await f.arrayBuffer();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ANONYMIZED_SUFFIX = '-anonymized';

export function buildAnonymizedFileName(originalName: string | undefined | null): string {
  const trimmed = (originalName ?? '').trim();
  if (!trimmed) return `output${ANONYMIZED_SUFFIX}.pdf`;
  const base = trimmed.replace(/\.pdf$/i, '');
  return `${base}${ANONYMIZED_SUFFIX}.pdf`;
}
