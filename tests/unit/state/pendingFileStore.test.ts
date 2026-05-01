import { beforeEach, describe, expect, it } from 'vitest';
import { usePendingFileStore } from '@/state/pendingFileStore';

describe('pending file store', () => {
  beforeEach(() => usePendingFileStore.getState().reset());

  it('단일 처리용 파일을 한 번만 소비한다', () => {
    const file = new File(['pdf'], 'single.pdf', { type: 'application/pdf' });

    usePendingFileStore.getState().setSingleFile(file);

    expect(usePendingFileStore.getState().consumeSingleFile()).toBe(file);
    expect(usePendingFileStore.getState().consumeSingleFile()).toBeNull();
  });

  it('batch 처리용 파일 목록을 한 번만 소비한다', () => {
    const files = [
      new File(['a'], 'a.pdf', { type: 'application/pdf' }),
      new File(['b'], 'b.pdf', { type: 'application/pdf' }),
    ];

    usePendingFileStore.getState().setBatchFiles(files);

    expect(usePendingFileStore.getState().consumeBatchFiles()).toEqual(files);
    expect(usePendingFileStore.getState().consumeBatchFiles()).toEqual([]);
  });
});
