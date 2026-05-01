import { useCallback } from 'react';
import { useAppStore } from '@/state/store';
import { getPdfWorker } from '@/workers/pdfWorkerClient';
import { fileToArrayBuffer } from '@/utils/fileIO';

const LARGE_FILE_THRESHOLD = 200 * 1024 * 1024;
const sizeMb = (n: number) => Math.round(n / (1024 * 1024));

type LoadOptions = {
  sourceId?: string;
  shouldCommit?: () => boolean;
};

export function usePdfDocument() {
  const setDoc = useAppStore((s) => s.setDoc);
  const reset = useAppStore((s) => s.reset);

  const load = useCallback(
    async (f: File, options: LoadOptions = {}) => {
      const shouldCommit = options.shouldCommit ?? (() => true);
      if (f.size > LARGE_FILE_THRESHOLD) {
        const ok = window.confirm(
          `이 파일은 ${sizeMb(f.size)}MB로 매우 큽니다. 처리 시 메모리 부담이 클 수 있는데 계속하시겠습니까?`,
        );
        if (!ok) return;
      }
      reset();

      let attempt = 0;
      let password: string | undefined;
      while (attempt < 4) {
        try {
          if (!shouldCommit()) return;
          setDoc({ kind: 'loading' });
          const buf = await fileToArrayBuffer(f);
          const opts = password !== undefined ? { password } : undefined;
          const api = await getPdfWorker();
          const { pages } = await api.open(buf, opts);
          if (!shouldCommit()) return;
          setDoc({
            kind: 'ready',
            pages,
            fileName: f.name,
            ...(options.sourceId !== undefined ? { sourceId: options.sourceId } : {}),
          });
          return;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes('PASSWORD_REQUIRED') || msg.includes('PASSWORD_WRONG')) {
            attempt += 1;
            if (attempt > 3) {
              if (!shouldCommit()) return;
              setDoc({ kind: 'error', message: '비밀번호 인증 실패' });
              return;
            }
            const promptMsg = msg.includes('PASSWORD_WRONG')
              ? `비밀번호가 틀립니다. 다시 입력하세요. (${attempt}/3)`
              : '암호화된 PDF 입니다. 비밀번호를 입력하세요.';
            const pwd = window.prompt(promptMsg);
            if (pwd === null) {
              if (!shouldCommit()) return;
              setDoc({ kind: 'error', message: '비밀번호 입력이 취소되었습니다.' });
              return;
            }
            password = pwd;
            continue;
          }
          if (!shouldCommit()) return;
          setDoc({ kind: 'error', message: msg });
          return;
        }
      }
    },
    [setDoc, reset],
  );

  return { load };
}
