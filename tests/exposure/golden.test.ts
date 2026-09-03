import { describe, expect, it } from 'vitest';
import { computeExposure, computePortfolioExposure } from '@/lib/exposure/compute';
import {
  GOLDEN_CERTIFICATES,
  GOLDEN_EXPECTATIONS,
  GOLDEN_PAYMENTS,
  GOLDEN_POLICY,
  GOLDEN_SUBS,
  GOLDEN_TOTALS,
} from '@/lib/exposure/fixtures';
import { formatDollars } from '@/lib/money';

describe('golden fixtures (brief §6d)', () => {
  const portfolio = computePortfolioExposure(
    GOLDEN_SUBS,
    GOLDEN_PAYMENTS,
    GOLDEN_CERTIFICATES,
    GOLDEN_POLICY,
    '2026-01-15T00:00:00.000Z',
  );
  const bySub = new Map(portfolio.subs.map((s) => [s.subcontractorId, s]));

  for (const expectation of GOLDEN_EXPECTATIONS) {
    it(`prices ${expectation.subcontractorId}`, () => {
      const result = bySub.get(expectation.subcontractorId);
      expect(result, 'sub is present in the portfolio').toBeDefined();
      expect(result?.paidTotal).toBe(expectation.paid);
      expect(result?.addedPayroll).toBe(expectation.addedPayroll);
      expect(result?.addedPremium).toBe(expectation.addedPremium);
    });
  }

  it('totals $405,700 added payroll', () => {
    expect(portfolio.addedPayroll).toBe(GOLDEN_TOTALS.addedPayroll);
    expect(formatDollars(portfolio.addedPayroll)).toBe('$405,700');
  });

  it('totals $52,822 added premium', () => {
    expect(portfolio.addedPremiumBeforeSurcharge).toBe(GOLDEN_TOTALS.addedPremium);
    expect(formatDollars(portfolio.totalExposure)).toBe('$52,822');
  });

  it('adds no surcharge when the policy percentage is zero', () => {
    expect(portfolio.surcharge).toBe(0);
    expect(portfolio.totalExposure).toBe(portfolio.addedPremiumBeforeSurcharge);
  });

  it('is the cap-binding case for Vega Concrete: $81,000 claimed, $64,500 allowed', () => {
    const vega = bySub.get('vega');
    expect(vega?.materialClaimed).toBe(8_100_000);
    expect(vega?.materialAllowed).toBe(6_450_000);
    expect(vega?.flags.map((f) => f.flag)).toContain('MATERIAL_CAP_BINDING');
  });

  it('ranks the chase list by premium removed per call, not by invoice size', () => {
    // B&K at $58,200 with nothing on file outranks nobody here, but Ridgeline at $143,000
    // whose certificate is merely late does not outrank Kowalczyk's larger exposure.
    const ranked = portfolio.subs.filter((s) => s.addedPremium > 0).map((s) => s.subcontractorId);
    expect(ranked).toEqual(['ridgeline', 'kowalczyk', 'vega', 'bk-drywall']);
  });

  it('splits the total into what only a certificate clears and what a split invoice reaches', () => {
    expect(portfolio.clearedBySplitInvoice + portfolio.clearedByCertificateOnly).toBe(
      portfolio.addedPremiumBeforeSurcharge,
    );
    // A certificate takes every dollar; a split invoice can only ever reach the capped half.
    expect(portfolio.clearedBySplitInvoice).toBeLessThan(portfolio.addedPremiumBeforeSurcharge);
  });

  it('stamps the ruleset version on every result', () => {
    for (const result of portfolio.subs) {
      expect(result.rulesetVersion).toBe(portfolio.rulesetVersion);
    }
  });

  it('recomputes identically one sub at a time', () => {
    for (const sub of GOLDEN_SUBS) {
      const single = computeExposure(sub, GOLDEN_PAYMENTS, GOLDEN_CERTIFICATES, GOLDEN_POLICY);
      expect(single.addedPremium).toBe(bySub.get(sub.id)?.addedPremium);
    }
  });
});
