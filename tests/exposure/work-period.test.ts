import { describe, expect, it } from 'vitest';
import { computeExposure, computePortfolioExposure } from '@/lib/exposure/compute';
import { evaluationPeriod } from '@/lib/exposure/coverage';
import { PROFILE_DEEMED_SHARE, PROFILE_INVOICE_SPLIT, TEST_CATALOGUE } from '../fixtures/profiles';
import { cert, dollars, payment, policy, sub } from '../fixtures/scenario';

/**
 * The relevant period is when the work was performed, not when the check cleared. These
 * tests are the ones that would have caught the original engine's mistake.
 */
describe('work period versus payment date', () => {
  // A certificate that lapsed at the end of June, and work done in May that was not paid
  // until August. The payment date says uncovered; the work period says covered.
  const lapsedInJune = [cert({ wcEffective: '2025-01-01', wcExpiration: '2025-06-30' })];

  it('follows the work period when it is on file', () => {
    const result = computeExposure(
      sub(),
      [
        payment({
          workFrom: '2025-05-01',
          workTo: '2025-05-28',
          paidOn: '2025-08-15',
          amount: dollars(100_000),
        }),
      ],
      lapsedInJune,
      policy(),
      PROFILE_INVOICE_SPLIT,
    );

    expect(result.coveredTotal).toBe(dollars(100_000));
    expect(result.uncoveredTotal).toBe(0);
    expect(result.addedPremium).toBe(0);
    expect(result.assessments[0]?.basis).toBe('work_period');
    expect(result.usedPaymentDateProxy).toBe(false);
  });

  it('reaches the opposite answer from the payment date alone', () => {
    const result = computeExposure(
      sub(),
      [payment({ paidOn: '2025-08-15', amount: dollars(100_000) })],
      lapsedInJune,
      policy(),
      PROFILE_INVOICE_SPLIT,
    );

    // Same money, same certificate, no work dates: the proxy prices it as fully exposed.
    expect(result.uncoveredTotal).toBe(dollars(100_000));
    expect(result.addedPremium).toBe(dollars(10_000));
    expect(result.assessments[0]?.basis).toBe('payment_date_proxy');
    expect(result.usedPaymentDateProxy).toBe(true);
  });

  it('catches the reverse case too: work after a lapse, paid before it', () => {
    const result = computeExposure(
      sub(),
      [
        payment({
          workFrom: '2025-08-01',
          workTo: '2025-08-20',
          paidOn: '2025-06-15',
          amount: dollars(50_000),
        }),
      ],
      lapsedInJune,
      policy(),
      PROFILE_INVOICE_SPLIT,
    );
    expect(result.uncoveredTotal).toBe(dollars(50_000));
    expect(result.assessments[0]?.basis).toBe('work_period');
  });

  it('labels the proxy everywhere it is used', () => {
    const result = computeExposure(
      sub(),
      [payment({ paidOn: '2025-08-15', amount: dollars(100_000) })],
      lapsedInJune,
      policy(),
      PROFILE_INVOICE_SPLIT,
    );
    expect(result.flags.map((flag) => flag.flag)).toContain('PAYMENT_DATE_PROXY_USED');
    const factor = result.confidence.factors.find((entry) => entry.id === 'coverage_period_basis');
    expect(factor?.level).toBe('medium');
    expect(factor?.assumption).toContain('payment date');
  });

  it('does not pretend the proxy has the same confidence as a work period', () => {
    const withDates = computeExposure(
      sub(),
      [payment({ workFrom: '2025-08-01', workTo: '2025-08-20', paidOn: '2025-09-01', amount: dollars(10_000) })],
      lapsedInJune,
      policy(),
      PROFILE_INVOICE_SPLIT,
    );
    const withoutDates = computeExposure(
      sub(),
      [payment({ paidOn: '2025-09-01', amount: dollars(10_000) })],
      lapsedInJune,
      policy(),
      PROFILE_INVOICE_SPLIT,
    );

    const basis = (result: typeof withDates) =>
      result.confidence.factors.find((entry) => entry.id === 'coverage_period_basis')?.level;

    expect(basis(withDates)).toBe('deterministic');
    expect(basis(withoutDates)).toBe('medium');
    expect(withDates.confidence.assumptions).toHaveLength(0);
    expect(withoutDates.confidence.assumptions.length).toBeGreaterThan(0);
  });
});

describe('evaluationPeriod', () => {
  it('uses the work period when both ends are present and ordered', () => {
    expect(
      evaluationPeriod(payment({ workFrom: '2025-01-05', workTo: '2025-02-10', amount: 1 })),
    ).toEqual({ from: '2025-01-05', to: '2025-02-10', basis: 'work_period' });
  });

  it('falls back when only one end is present', () => {
    expect(
      evaluationPeriod(payment({ workFrom: '2025-01-05', workTo: null, paidOn: '2025-03-01', amount: 1 })),
    ).toEqual({ from: '2025-03-01', to: '2025-03-01', basis: 'payment_date_proxy' });
  });

  it('falls back when the period is inverted, rather than testing it backwards', () => {
    expect(
      evaluationPeriod(
        payment({ workFrom: '2025-05-01', workTo: '2025-01-01', paidOn: '2025-03-01', amount: 1 }),
      ).basis,
    ).toBe('payment_date_proxy');
  });
});

describe('a period that straddles a coverage boundary', () => {
  // Work through the whole of June and July; coverage ends 30 June. Thirty of sixty-one
  // days are covered.
  const straddling = [
    payment({ workFrom: '2025-06-01', workTo: '2025-07-31', paidOn: '2025-08-10', amount: dollars(61_000) }),
  ];
  const coverage = [cert({ wcEffective: '2025-01-01', wcExpiration: '2025-06-30' })];

  it('is uncovered in full where the profile says all or nothing', () => {
    const result = computeExposure(sub(), straddling, coverage, policy(), PROFILE_INVOICE_SPLIT);
    expect(result.uncoveredTotal).toBe(dollars(61_000));
    expect(result.assessments[0]?.partialOverlap).toBe(true);
    expect(result.assessments[0]?.coveredDays).toBe(30);
    expect(result.assessments[0]?.totalDays).toBe(61);
    expect(result.flags.map((flag) => flag.flag)).toContain('PARTIAL_WORK_PERIOD_COVERAGE');
  });

  it('is split by covered days where the profile prorates', () => {
    const result = computeExposure(
      sub(),
      straddling,
      coverage,
      policy({ jurisdiction: 'US-XB' }),
      PROFILE_DEEMED_SHARE,
    );
    // 30 of 61 days covered: $30,000 covered, $31,000 uncovered.
    expect(result.coveredTotal).toBe(dollars(30_000));
    expect(result.uncoveredTotal).toBe(dollars(31_000));
    // Then three fifths of the uncovered slice is deemed payroll.
    expect(result.addedPayroll).toBe(dollars(18_600));
  });

  it('records which certificates covered the part that was covered', () => {
    const result = computeExposure(sub(), straddling, coverage, policy(), PROFILE_INVOICE_SPLIT);
    expect(result.assessments[0]?.certificateIds).toEqual(['c1']);
  });
});

describe('a profile that refuses the proxy', () => {
  it('reports the estimate as unavailable rather than guessing from the check date', () => {
    const result = computeExposure(
      sub(),
      [payment({ paidOn: '2025-08-15', amount: dollars(100_000) })],
      [],
      policy({ jurisdiction: 'US-XB' }),
      PROFILE_DEEMED_SHARE,
    );

    expect(result.status).toBe('unavailable');
    expect(result.unavailable?.reason).toBe('work_period_required');
    expect(result.addedPremium).toBeNull();
    expect(result.addedPayroll).toBe(0);
    // The ledger figure survives; only the pricing is withheld.
    expect(result.paidTotal).toBe(dollars(100_000));
  });

  it('prices the same subcontractor once work dates are recorded', () => {
    const result = computeExposure(
      sub(),
      [
        payment({
          workFrom: '2025-08-01',
          workTo: '2025-08-20',
          paidOn: '2025-08-15',
          amount: dollars(100_000),
        }),
      ],
      [],
      policy({ jurisdiction: 'US-XB' }),
      PROFILE_DEEMED_SHARE,
    );
    expect(result.status).toBe('estimated');
    expect(result.addedPayroll).toBe(dollars(60_000));
  });
});

describe('accounting records with no work dates stay usable', () => {
  it('imports and prices under a profile that permits the proxy', () => {
    const portfolio = computePortfolioExposure({
      subs: [sub()],
      payments: [
        payment({ paidOn: '2025-03-01', amount: dollars(40_000) }),
        payment({ paidOn: '2025-09-01', amount: dollars(60_000) }),
      ],
      certificates: [],
      policy: policy(),
      computedAt: '2026-01-01T00:00:00.000Z',
      catalogue: TEST_CATALOGUE,
    });

    expect(portfolio.status).toBe('estimated');
    expect(portfolio.addedPayroll).toBe(dollars(100_000));
    // Usable, but never presented as equivalent to a work-period answer.
    expect(portfolio.confidence.level).toBe('medium');
    expect(portfolio.subs[0]?.usedPaymentDateProxy).toBe(true);
  });

  it('mixes proxied and dated payments on one subcontractor without losing either', () => {
    const result = computeExposure(
      sub(),
      [
        payment({ workFrom: '2025-02-01', workTo: '2025-02-20', paidOn: '2025-03-01', amount: dollars(40_000) }),
        payment({ paidOn: '2025-09-01', amount: dollars(60_000) }),
      ],
      [cert({ wcEffective: '2025-01-01', wcExpiration: '2025-06-30' })],
      policy(),
      PROFILE_INVOICE_SPLIT,
    );

    expect(result.assessments.map((entry) => entry.basis)).toEqual([
      'work_period',
      'payment_date_proxy',
    ]);
    expect(result.coveredTotal).toBe(dollars(40_000));
    expect(result.uncoveredTotal).toBe(dollars(60_000));
    expect(result.usedPaymentDateProxy).toBe(true);
  });
});
