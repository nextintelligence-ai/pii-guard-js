import { describe, expect, it, vi } from 'vitest';
import { installOrtWarningFilter } from '@/workers/ortRuntimePaths';

describe('ORT runtime config', () => {
  it('suppresses known WebGPU EP assignment warnings only', () => {
    const originalWarn = vi.fn();
    const originalLog = vi.fn();
    const originalError = vi.fn();
    const target = {
      warn: originalWarn,
      log: originalLog,
      error: originalError,
    };

    installOrtWarningFilter(target);

    target.warn(
      '2026-04-30 [W:onnxruntime:, session_state.cc:1359 VerifyEachNodeIsAssignedToAnEp] Some nodes were not assigned to the preferred execution providers.',
    );
    target.log(
      '2026-04-30 [W:onnxruntime:, session_state.cc:1361 VerifyEachNodeIsAssignedToAnEp] Rerunning with verbose output on a non-minimal build will show node assignments.',
    );
    target.error(
      '2026-04-30 [W:onnxruntime:, session_state.cc:1359 VerifyEachNodeIsAssignedToAnEp] Some nodes were not assigned to the preferred execution providers.',
    );
    target.warn('다른 경고');
    target.log('다른 로그');
    target.error('다른 에러');

    expect(originalWarn).toHaveBeenCalledTimes(1);
    expect(originalWarn).toHaveBeenCalledWith('다른 경고');
    expect(originalLog).toHaveBeenCalledTimes(1);
    expect(originalLog).toHaveBeenCalledWith('다른 로그');
    expect(originalError).toHaveBeenCalledTimes(1);
    expect(originalError).toHaveBeenCalledWith('다른 에러');
  });
});
