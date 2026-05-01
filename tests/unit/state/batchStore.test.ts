import { beforeEach, describe, expect, it } from 'vitest';
import { useBatchStore } from '@/state/batchStore';

describe('BatchStore', () => {
  beforeEach(() => useBatchStore.getState().reset());

  it('PDF 파일 여러 개를 queued job 으로 추가한다', () => {
    const files = [
      new File(['a'], 'a.pdf', { type: 'application/pdf' }),
      new File(['b'], 'b.pdf', { type: 'application/pdf' }),
    ];

    useBatchStore.getState().addFiles(files);

    const jobs = useBatchStore.getState().jobs;
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ fileName: 'a.pdf', status: 'queued' });
    expect(jobs[1]).toMatchObject({ fileName: 'b.pdf', status: 'queued' });
  });

  it('상태별 요약 카운트를 계산한다', () => {
    const files = [
      new File(['a'], 'a.pdf', { type: 'application/pdf' }),
      new File(['b'], 'b.pdf', { type: 'application/pdf' }),
      new File(['c'], 'c.pdf', { type: 'application/pdf' }),
    ];
    const store = useBatchStore.getState();
    store.addFiles(files);

    const ids = useBatchStore.getState().jobs.map((job) => job.id);
    store.updateJob(ids[0]!, { status: 'done' });
    store.updateJob(ids[1]!, { status: 'warning' });
    store.updateJob(ids[2]!, { status: 'failed' });

    expect(useBatchStore.getState().getSummary()).toEqual({
      total: 3,
      queued: 0,
      running: 0,
      done: 1,
      warning: 1,
      failed: 1,
      cancelled: 0,
    });
  });

  it('batch 설정 기본값은 OCR 사용, NER 자동 적용 ON 이다', () => {
    expect(useBatchStore.getState().settings).toEqual({
      useOcr: true,
      autoApplyNer: true,
    });
  });
});
