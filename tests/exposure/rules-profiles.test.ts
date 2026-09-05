import { describe, expect, it } from 'vitest';
import { computeExposure, computePortfolioExposure } from '@/lib/exposure/compute';
import { PROFILE_DEEMED_SHARE, PROFILE_INVOICE_SPLIT, TEST_CATALOGUE } from '../fixtures/profiles';
import { dollars, payment, policy, sub } from '../fixtures/scenario';

/**
 * The same subcontract cost, run under two jurisdictions, has to come out differently and
 * for stated reasons. If these ever converge, the rules layer has become decoration.
 */
const WORK = { workFrom: '2025-03-01', workTo: '2025-03-31' } as const;

describe('the same $100,000 under two jurisdictions', () => {
  const payments = [payment({ ...WORK, paidOn: '2025-04-15', amount: dollars(100_000) })];

  const underInvoiceSplit = computeExposure(sub(), payments, [], policy(), PROFILE_INVOICE_SPLIT);
  const underDeemedShare = computeExposure(
    sub(),
    payments,
    [],
    policy({ jurisdiction: 'US-XB' }),
    PROFILE_DEEMED_SHARE,
  );

  it('adds the full cost to payroll under the invoice-split profile', () => {
    expect(underInvoiceSplit.addedPayroll).toBe(dollars(100_000));
  });

  it('adds only the deemed share under the deemed-share profile', () => {
    // Three fifths of $100,000.
    expect(underDeemedShare.addedPayroll).toBe(dollars(60_000));
    expect(underDeemedShare.deemedLaborShareApplied).toEqual({ numerator: 3, denominator: 5 });
  });

  it('produces materially different premium from identical inputs', () => {
    expect(underInvoiceSplit.addedPremium).toBe(dollars(10_000)); // 100,000/100 × 10.00
    expect(underDeemedShare.addedPremium).toBe(dollars(6_000)); // 60,000/100 × 10.00
    expect(underInvoiceSplit.addedPremium).not.toBe(underDeemedShare.addedPremium);
  });

  it('names the ruleset that produced each figure', () => {
    expect(underInvoiceSplit.provenance.rulesetId).toBe('test-invoice-split');
    expect(underDeemedShare.provenance.rulesetId).toBe('test-deemed-share');
  });
});

describe('an original invoice is worth something in one jurisdiction and nothing in the other', () => {
  const payments = [
    payment({
      ...WORK,
      paidOn: '2025-04-15',
      amount: dollars(100_000),
      materialAmount: dollars(60_000),
      materialEvidence: 'original_invoice',
    }),
  ];

  const underInvoiceSplit = computeExposure(sub(), payments, [], policy(), PROFILE_INVOICE_SPLIT);
  const underDeemedShare = computeExposure(
    sub(),
    payments,
    [],
    policy({ jurisdiction: 'US-XB' }),
    PROFILE_DEEMED_SHARE,
  );

  it('allows a capped deduction where separation is permitted', () => {
    expect(underInvoiceSplit.materialClaimed).toBe(dollars(60_000));
    expect(underInvoiceSplit.materialAllowed).toBe(dollars(50_000)); // capped at half
    expect(underInvoiceSplit.addedPayroll).toBe(dollars(50_000));
  });

  it('ignores the invoice entirely where separation is not permitted', () => {
    expect(underDeemedShare.materialClaimed).toBe(0);
    expect(underDeemedShare.materialAllowed).toBe(0);
    expect(underDeemedShare.addedPayroll).toBe(dollars(60_000));
  });

  it('values chasing a split invoice differently under each', () => {
    // Under the split profile the cap is already exhausted, so a further invoice is worth
    // nothing; under the deemed-share profile no invoice is ever worth anything.
    expect(underInvoiceSplit.ifSplitInvoiceObtained).toBe(0);
    expect(underDeemedShare.ifSplitInvoiceObtained).toBe(0);
  });

  it('values a split invoice where the cap is not yet exhausted', () => {
    const noInvoice = computeExposure(
      sub(),
      [payment({ ...WORK, paidOn: '2025-04-15', amount: dollars(100_000) })],
      [],
      policy(),
      PROFILE_INVOICE_SPLIT,
    );
    expect(noInvoice.ifSplitInvoiceObtained).toBe(dollars(5_000)); // half the premium
  });
});

describe('classification differs by profile', () => {
  const payments = [payment({ ...WORK, paidOn: '2025-04-15', amount: dollars(100_000) })];
  const noClass = sub({ classCodeOverride: null });

  it('falls back to the governing rate as a flagged proxy where the profile permits it', () => {
    const result = computeExposure(noClass, payments, [], policy(), PROFILE_INVOICE_SPLIT);
    expect(result.rate.provenance).toBe('governing_rate_proxy');
    expect(result.addedPremium).not.toBeNull();
    expect(result.flags.map((flag) => flag.flag)).toContain('GOVERNING_RATE_PROXY_USED');
  });

  it('treats the governing class as the correct basis where the profile says so', () => {
    const result = computeExposure(
      noClass,
      payments,
      [],
      policy({ jurisdiction: 'US-XB' }),
      PROFILE_DEEMED_SHARE,
    );
    // Not a proxy: this profile rates uninsured subcontract payroll at the governing class
    // by rule, so the same fallback rate carries different provenance and confidence.
    expect(result.rate.provenance).toBe('rules_profile_derived');
    expect(result.flags.map((flag) => flag.flag)).not.toContain('GOVERNING_RATE_PROXY_USED');
  });
});

describe('special categories differ by profile', () => {
  const payments = [payment({ ...WORK, paidOn: '2025-04-15', amount: dollars(90_000) })];
  const operator = sub({ specialCategory: 'equipment_with_operator' });

  it('deems a third of the contract payroll under one profile', () => {
    const result = computeExposure(operator, payments, [], policy(), PROFILE_INVOICE_SPLIT);
    expect(result.addedPayroll).toBe(dollars(30_000));
    expect(result.flags.map((flag) => flag.flag)).toContain('DEEMED_LABOR_SHARE_APPLIED');
  });

  it('gives no relief at all under the other', () => {
    const result = computeExposure(
      operator,
      payments,
      [],
      policy({ jurisdiction: 'US-XB' }),
      PROFILE_DEEMED_SHARE,
    );
    // This profile's own deemed share still applies; the category buys nothing extra.
    expect(result.addedPayroll).toBe(dollars(54_000)); // three fifths
  });

  it('excludes a category the profile excludes, and says why', () => {
    const result = computeExposure(
      sub({ specialCategory: 'licensed_professional' }),
      payments,
      [],
      policy(),
      PROFILE_INVOICE_SPLIT,
    );
    expect(result.addedPayroll).toBe(0);
    expect(result.zeroReason).toBe('special_category_excluded');
  });

  it('prices a category the profile does not settle, conservatively, and flags it', () => {
    const result = computeExposure(
      sub({ specialCategory: 'owner_operator_vehicle' }),
      payments,
      [],
      policy(),
      PROFILE_INVOICE_SPLIT,
    );
    expect(result.addedPayroll).toBe(dollars(90_000));
    expect(result.flags.map((flag) => flag.flag)).toContain('SPECIAL_CATEGORY_REQUIRES_REVIEW');
    expect(result.confidence.level).toBe('low');
  });
});

describe('an unsupported jurisdiction produces no figure', () => {
  const request = {
    subs: [sub()],
    payments: [payment({ ...WORK, paidOn: '2025-04-15', amount: dollars(100_000) })],
    certificates: [],
    computedAt: '2026-01-01T00:00:00.000Z',
    catalogue: TEST_CATALOGUE,
  };

  it('withholds the estimate rather than borrowing a ruleset', () => {
    const portfolio = computePortfolioExposure({
      ...request,
      policy: policy({ jurisdiction: 'US-ZZ' }),
    });
    expect(portfolio.status).toBe('unavailable');
    expect(portfolio.unavailable?.reason).toBe('jurisdiction_not_supported');
    expect(portfolio.totalExposure).toBe(0);
    expect(portfolio.addedPayroll).toBe(0);
  });

  it('still shows the ledger, so the work already done is not lost', () => {
    const portfolio = computePortfolioExposure({
      ...request,
      policy: policy({ jurisdiction: 'US-ZZ' }),
    });
    expect(portfolio.subs).toHaveLength(1);
    expect(portfolio.subs[0]?.paidTotal).toBe(dollars(100_000));
    expect(portfolio.subs[0]?.addedPremium).toBeNull();
  });

  it('withholds the estimate when the jurisdiction is recognised but not populated', () => {
    const portfolio = computePortfolioExposure({
      ...request,
      policy: policy({ jurisdiction: 'US-XC' }),
    });
    expect(portfolio.status).toBe('unavailable');
    expect(portfolio.unavailable?.reason).toBe('rules_not_populated');
    expect(portfolio.rulesProfile?.rulesetId).toBe('test-declared-only');
  });

  it('withholds the estimate when no jurisdiction is set at all', () => {
    const portfolio = computePortfolioExposure({
      ...request,
      policy: policy({ jurisdiction: null }),
    });
    expect(portfolio.status).toBe('unavailable');
    expect(portfolio.unavailable?.reason).toBe('jurisdiction_not_set');
    expect(portfolio.confidence.level).toBe('unavailable');
  });
});
