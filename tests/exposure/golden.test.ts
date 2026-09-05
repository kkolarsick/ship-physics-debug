import { describe, expect, it } from 'vitest';
import { computeExposure, computePortfolioExposure } from '@/lib/exposure/compute';
import {
  GOLDEN_CERTIFICATES,
  GOLDEN_EXPECTATIONS,
  GOLDEN_PAYMENTS,
  GOLDEN_POLICY,
  GOLDEN_PROFILE,
  GOLDEN_SUBS,
  GOLDEN_TOTALS,
} from '@/lib/exposure/fixtures';
import { formatDollars } from '@/lib/money';

describe('golden fixtures (brief §6d)', () => {
  const portfolio = computePortfolioExposure({
    subs: GOLDEN_SUBS,
    payments: GOLDEN_PAYMENTS,
    certificates: GOLDEN_CERTIFICATES,
    policy: GOLDEN_POLICY,
    computedAt: '2026-01-15T00:00:00.000Z',
  });
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

  it('adds no audit noncompliance charge when the audit went fine', () => {
    expect(portfolio.auditNoncompliance.applies).toBe(false);
    expect(portfolio.auditNoncompliance.charge).toBe(0);
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
    const ranked = portfolio.subs
      .filter((s) => (s.addedPremium ?? 0) > 0)
      .map((s) => s.subcontractorId);
    expect(ranked).toEqual(['ridgeline', 'kowalczyk', 'vega', 'bk-drywall']);
  });

  it('splits the total into what only a certificate clears and what a split invoice reaches', () => {
    expect(portfolio.clearedBySplitInvoice + portfolio.clearedByCertificateOnly).toBe(
      portfolio.addedPremiumBeforeSurcharge,
    );
    // A certificate takes every dollar; a split invoice can only ever reach the capped half.
    expect(portfolio.clearedBySplitInvoice).toBeLessThan(portfolio.addedPremiumBeforeSurcharge);
  });

  it('resolves the NCCI profile from the jurisdiction on the policy', () => {
    expect(portfolio.status).toBe('estimated');
    expect(portfolio.rulesProfile?.rulesetId).toBe(GOLDEN_PROFILE.rulesetId);
    expect(portfolio.provenance.jurisdiction).toBe('US-TN');
  });

  it('stamps the ruleset on every result', () => {
    for (const result of portfolio.subs) {
      expect(result.provenance.rulesetId).toBe(portfolio.provenance.rulesetId);
      expect(result.provenance.rulesetVersion).toBe(portfolio.provenance.rulesetVersion);
    }
  });

  it('tests coverage against the period the work was performed, not the check date', () => {
    for (const result of portfolio.subs) {
      expect(result.usedPaymentDateProxy).toBe(false);
      for (const assessment of result.assessments) {
        expect(assessment.basis).toBe('work_period');
      }
    }
  });

  it('rates every subcontractor at a class recorded for its own trade, not a proxy', () => {
    for (const result of portfolio.subs) {
      expect(result.rate.provenance).toBe('subcontractor_class');
    }
    expect(portfolio.proxyRatedPremium).toBe(0);
    expect(portfolio.unratedPayroll).toBe(0);
  });

  it('names exactly the two assumptions this set rests on', () => {
    // The shipped NCCI profile is a draft until someone checks it against the Basic
    // Manual, and two of these subcontractors have hand-entered labor/material splits.
    // Nothing else here is assumed, and the figure says so rather than implying otherwise.
    expect(portfolio.confidence.level).toBe('medium');
    expect(portfolio.confidence.assumptions).toEqual([
      'The treatment applied is this product’s model of the jurisdiction, not a transcription of the bureau’s manual.',
      'Hand-entered figures are the user’s assertion; nothing in this product verifies them against a document.',
    ]);
  });

  it('reports every subcontractor as estimated, none withheld', () => {
    for (const result of portfolio.subs) {
      expect(result.status).toBe('estimated');
      expect(result.unavailable).toBeNull();
    }
  });

  it('recomputes identically one sub at a time', () => {
    for (const sub of GOLDEN_SUBS) {
      const single = computeExposure(
        sub,
        GOLDEN_PAYMENTS,
        GOLDEN_CERTIFICATES,
        GOLDEN_POLICY,
        GOLDEN_PROFILE,
        '2026-01-15T00:00:00.000Z',
      );
      expect(single.addedPremium).toBe(bySub.get(sub.id)?.addedPremium);
    }
  });
});
