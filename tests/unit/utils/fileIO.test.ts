import { describe, expect, it } from 'vitest';
import { buildAnonymizedFileName } from '@/utils/fileIO';

describe('buildAnonymizedFileName', () => {
  it('소문자 .pdf 확장자를 제거하고 -anonymized.pdf 를 붙인다', () => {
    expect(buildAnonymizedFileName('보고서.pdf')).toBe('보고서-anonymized.pdf');
  });

  it('대문자 .PDF 확장자도 제거하고 소문자 .pdf 로 통일한다', () => {
    expect(buildAnonymizedFileName('report.PDF')).toBe('report-anonymized.pdf');
  });

  it('확장자가 없으면 그대로 두고 -anonymized.pdf 만 붙인다', () => {
    expect(buildAnonymizedFileName('보고서')).toBe('보고서-anonymized.pdf');
  });

  it('파일명 중간의 점은 보존하고 마지막 .pdf 만 제거한다', () => {
    expect(buildAnonymizedFileName('my.report.pdf')).toBe('my.report-anonymized.pdf');
  });

  it('빈 문자열이면 output-anonymized.pdf 폴백을 반환한다', () => {
    expect(buildAnonymizedFileName('')).toBe('output-anonymized.pdf');
  });

  it('공백만 있는 문자열도 폴백을 반환한다', () => {
    expect(buildAnonymizedFileName('   ')).toBe('output-anonymized.pdf');
  });

  it('null/undefined 도 폴백을 반환한다', () => {
    expect(buildAnonymizedFileName(null)).toBe('output-anonymized.pdf');
    expect(buildAnonymizedFileName(undefined)).toBe('output-anonymized.pdf');
  });
});
