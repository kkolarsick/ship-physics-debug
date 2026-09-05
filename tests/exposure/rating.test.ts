import { describe, expect, it } from 'vitest';
import { computeExposure, computePortfolioExposure } from '@/lib/exposure/compute';
import { selectRate } from '@/lib/exposure/rating';
import { PROFILE_DEEMED_SHARE, PROFILE_INVOICE_SPLIT, TEST_CATALOGUE } from '../fixtures/profiles';
import { dollars, payment, policy, sub } from '../fixtures/scenario';

const WORK = { workFrom: '2025-03-01', workTo: '2025-03-31', paidOn: '2025-04-15' } as const;
const HUNDRED_K = [payment({ ...WORK, amount: dollars(100_000) })];

/**
 * Falling straight through to the governing rate was the old engine's most quietly wrong
 * behaviour: a roofer's payroll rated at a carpentry rate is not an estimate of that
 * roofer's exposure. Every rate now says where it came from.
 */
describe('rate provenance', () => {
  it('prefers the class recorded for the subcontractor’s own trade', () => {
    const selection = selectRate(
      sub({ classCodeOverride: { classCode: '5551', rate: 315_000 } }),
      policy(),
      PROFILE_INVOICE_SPLIT.classification,
    );
    expect(selection.provenance).toBe('subcontractor_class');
    expect(selection.rate).toBe(315_000);
  });

  it('uses the rate an auditor actually applied before, over any proxy', () => {
    const selection = selectRate(
      sub({ classCodeOverride: null, priorAuditRate: { classCode: '5551', rate: 300_000 } }),
      policy(),
      PROFILE_INVOICE_SPLIT.classification,
    );
    expect(selection.provenance).toBe('prior_audit_rate');
    expect(selection.rate).toBe(300_000);
    expect(selection.statement).toContain('prior audit');
  });

  it('marks a governing-rate fallback as a proxy, not as a known rate', () => {
    const selection = selectRate(
      sub({ classCodeOverride: null }),
      policy(),
      PROFILE_INVOICE_SPLIT.classification,
    );
    expect(selection.provenance).toBe('governing_rate_proxy');
    expect(selection.statement).toContain('stands in as a proxy');
  });

  it('produces no rate at all where the profile forbids the proxy', () => {
    const selection = selectRate(
      sub({ classCodeOverride: null }),
      policy(),
      { ...PROFILE_INVOICE_SPLIT.classification, governingRateProxyPermitted: false },
    );
    expect(selection.provenance).toBe('unknown');
    expect(selection.rate).toBeNull();
  });
});

describe('an unknown rate yields payroll without a premium', () => {
  const unrated = computeExposure(
    sub({ classCodeOverride: null }),
    HUNDRED_K,
    [],
    policy(),
    { ...PROFILE_INVOICE_SPLIT, classification: { ...PROFILE_INVOICE_SPLIT.classification, governingRateProxyPermitted: false } },
  );

  it('reports the payroll it is sure of', () => {
    expect(unrated.addedPayroll).toBe(dollars(100_000));
  });

  it('produces no premium figure rather than inventing one', () => {
    expect(unrated.addedPremium).toBeNull();
    expect(unrated.ifCertificateObtained).toBeNull();
    expect(unrated.ifSplitInvoiceObtained).toBeNull();
  });

  it('says so on the figure', () => {
    expect(unrated.flags.map((flag) => flag.flag)).toContain('NO_RATE_AVAILABLE');
    expect(unrated.status).toBe('estimated');
  });
});

describe('the portfolio keeps proxy-rated and unrated money visible', () => {
  const catalogue = TEST_CATALOGUE;

  it('separates unrated payroll from the premium total', () => {
    const strict = {
      ...PROFILE_INVOICE_SPLIT,
      rulesetId: 'test-strict-class',
      jurisdictions: ['US-XS'],
      classification: { ...PROFILE_INVOICE_SPLIT.classification, governingRateProxyPermitted: false },
    };

    const portfolio = computePortfolioExposure({
      subs: [
        sub({ id: 'known', name: 'Known Class' }),
        sub({ id: 'unknown', name: 'Unknown Class', classCodeOverride: null }),
      ],
      payments: [
        payment({ ...WORK, subcontractorId: 'known', amount: dollars(100_000) }),
        payment({ ...WORK, subcontractorId: 'unknown', amount: dollars(80_000) }),
      ],
      certificates: [],
      policy: policy({ jurisdiction: 'US-XS' }),
      computedAt: '2026-01-01T00:00:00.000Z',
      catalogue: [...catalogue, strict],
    });

    expect(portfolio.addedPayroll).toBe(dollars(180_000));
    expect(portfolio.addedPremiumBeforeSurcharge).toBe(dollars(10_000)); // only the known class
    expect(portfolio.unratedPayroll).toBe(dollars(80_000));
    expect(portfolio.unratedSubcontractorCount).toBe(1);
  });

  it('reports how much premium rests on the governing-rate proxy', () => {
    const portfolio = computePortfolioExposure({
      subs: [
        sub({ id: 'known', name: 'Known Class' }),
        sub({ id: 'proxied', name: 'Proxied', classCodeOverride: null }),
      ],
      payments: [
        payment({ ...WORK, subcontractorId: 'known', amount: dollars(100_000) }),
        payment({ ...WORK, subcontractorId: 'proxied', amount: dollars(50_000) }),
      ],
      certificates: [],
      policy: policy(),
      computedAt: '2026-01-01T00:00:00.000Z',
      catalogue,
    });

    expect(portfolio.addedPremiumBeforeSurcharge).toBe(dollars(15_000));
    expect(portfolio.proxyRatedPremium).toBe(dollars(5_000));
    // One weak input drags the whole figure's confidence down, deliberately.
    expect(portfolio.confidence.level).toBe('low');
  });

  it('does not count a rules-derived governing rate as a proxy', () => {
    const portfolio = computePortfolioExposure({
      subs: [sub({ classCodeOverride: null })],
      payments: [payment({ ...WORK, amount: dollars(100_000) })],
      certificates: [],
      policy: policy({ jurisdiction: 'US-XB' }),
      computedAt: '2026-01-01T00:00:00.000Z',
      catalogue,
    });
    expect(portfolio.subs[0]?.rate.provenance).toBe('rules_profile_derived');
    expect(portfolio.proxyRatedPremium).toBe(0);
  });
});

describe('replacing a proxy with a real rate', () => {
  it('raises confidence and changes the figure', () => {
    const proxied = computeExposure(
      sub({ classCodeOverride: null }),
      HUNDRED_K,
      [],
      policy(),
      PROFILE_INVOICE_SPLIT,
    );
    const corrected = computeExposure(
      sub({ classCodeOverride: null, priorAuditRate: { classCode: '5551', rate: 315_000 } }),
      HUNDRED_K,
      [],
      policy(),
      PROFILE_INVOICE_SPLIT,
    );

    expect(proxied.addedPremium).toBe(dollars(10_000));
    expect(corrected.addedPremium).toBe(dollars(31_500));

    const level = (result: typeof proxied) =>
      result.confidence.factors.find((entry) => entry.id === 'rate_provenance')?.level;
    expect(level(proxied)).toBe('low');
    expect(level(corrected)).toBe('deterministic');
  });
});

describe('the deemed-share profile still needs a rate', () => {
  it('rates its deemed payroll at the governing class by rule', () => {
    const result = computeExposure(
      sub({ classCodeOverride: null }),
      HUNDRED_K,
      [],
      policy({ jurisdiction: 'US-XB' }),
      PROFILE_DEEMED_SHARE,
    );
    expect(result.addedPayroll).toBe(dollars(60_000));
    expect(result.addedPremium).toBe(dollars(6_000));
  });
});
