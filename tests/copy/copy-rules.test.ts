import { describe, expect, it } from 'vitest';
import { DISCLAIMER, COVERAGE_LANGUAGE, findCopyViolations } from '@/lib/copy';

/**
 * The compliance posture is non-negotiable (brief §1), so the rules that enforce it get
 * tested like any other rule: they must catch the phrasings that cross the line, and they
 * must not fire on the audit-facing language the product is built on.
 */
describe('forbidden copy', () => {
  it.each([
    'This sub’s coverage is adequate for your requirements.',
    'Their certificate is compliant.',
    'Status: fully compliant',
    'Coverage verified with the carrier.',
    'Their policy is confirmed in force.',
    'We recommend adding a waiver of subrogation endorsement.',
    'You should require higher limits from this subcontractor.',
    'Your final premium will be $52,822.',
    'This guarantees savings of $18,000 in premium.',
  ])('catches %s', (line) => {
    expect(findCopyViolations(line)).not.toHaveLength(0);
  });

  it.each([
    'Will be included in auditable payroll.',
    'Will be excluded from auditable payroll.',
    'Based on the certificate on file. Not confirmed with any insurer.',
    'Estimated additional premium at audit.',
    'A covered window ends 04/30/2025, before the policy term ends 12/31/2025.',
    'Ask your auditor how they treat a sole proprietor with no employees.',
    'Request a certificate of insurance covering 03/03/2025 through 09/30/2025.',
    'The most common false sense of security in the whole dataset.',
  ])('leaves %s alone', (line) => {
    expect(findCopyViolations(line)).toEqual([]);
  });

  it('does not fire on the disclaimer, which must remain sayable verbatim', () => {
    expect(findCopyViolations(DISCLAIMER)).toEqual([]);
  });

  it('does not fire on the coverage language the product uses', () => {
    for (const line of Object.values(COVERAGE_LANGUAGE)) {
      expect(findCopyViolations(line)).toEqual([]);
    }
  });

  it('reports the line number and what to say instead', () => {
    const [violation] = findCopyViolations('ok line\ntheir coverage is adequate\nok line');
    expect(violation?.line).toBe(2);
    expect(violation?.instead).toContain('auditable payroll');
  });

  it('honours an explicit exemption marker', () => {
    expect(findCopyViolations('their coverage is adequate // copy-lint-ok')).toEqual([]);
  });
});

describe('disclaimer', () => {
  it('is the exact text the brief requires', () => {
    expect(DISCLAIMER).toBe(
      'Estimate based on documents and figures you provided. Not a determination of premium, ' +
        'not insurance advice, and not a substitute for your carrier’s audit. Coverage status ' +
        'reflects certificates on file and has not been confirmed with any insurer.',
    );
  });
});
