export async function fileToArrayBuffer(f: File): Promise<ArrayBuffer> {
  if (typeof f.arrayBuffer === 'function') {
    return await f.arrayBuffer();
  }
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }
      reject(new Error('파일을 ArrayBuffer로 읽지 못했습니다.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('파일 읽기 실패'));
    reader.readAsArrayBuffer(f);
  });
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
