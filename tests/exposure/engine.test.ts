import { describe, expect, it } from 'vitest';
import { computeExposure, computePortfolioExposure } from '@/lib/exposure/compute';
import { mergeOverlappingWindows } from '@/lib/exposure/windows';
import { PROFILE_INVOICE_SPLIT, TEST_CATALOGUE } from '../fixtures/profiles';
import { cert, dollars, payment, policy, sub } from '../fixtures/scenario';

/**
 * The engine's own behaviour, held under one profile so the arithmetic is the subject.
 * How that behaviour changes between jurisdictions is in rules-profiles.test.ts.
 */
const PROFILE = PROFILE_INVOICE_SPLIT;

/** Work performed on the given day, paid a fortnight later. */
function work(on: string, amount: number, extra: Record<string, unknown> = {}) {
  return payment({ workFrom: on, workTo: on, paidOn: on, amount, ...extra });
}

describe('partial coverage', () => {
  it('prices only the uncovered slice: 200,000 paid, 120,000 covered → 80,000 payroll', () => {
    const payments = [
      work('2025-02-01', dollars(70_000)),
      work('2025-04-15', dollars(50_000)),
      work('2025-07-01', dollars(45_000)),
      work('2025-10-20', dollars(35_000)),
    ];
    const certificates = [cert({ wcEffective: '2025-01-01', wcExpiration: '2025-04-30' })];

    const result = computeExposure(sub(), payments, certificates, policy(), PROFILE);

    expect(result.paidTotal).toBe(dollars(200_000));
    expect(result.coveredTotal).toBe(dollars(120_000));
    expect(result.uncoveredTotal).toBe(dollars(80_000));
    expect(result.addedPayroll).toBe(dollars(80_000));
    expect(result.zeroReason).toBeNull();
  });

  it('flags a certificate that ends before the term while work continues', () => {
    const result = computeExposure(
      sub(),
      [work('2025-02-01', dollars(10_000)), work('2025-08-01', dollars(10_000))],
      [cert({ wcEffective: '2025-01-01', wcExpiration: '2025-04-30' })],
      policy(),
      PROFILE,
    );
    expect(result.flags.map((f) => f.flag)).toContain('CERT_EXPIRES_MID_TERM');
  });
});

describe('overlapping certificates', () => {
  it('merges overlapping windows instead of double-counting the overlap', () => {
    expect(
      mergeOverlappingWindows([
        { from: '2025-01-01', to: '2025-06-30', certificateIds: ['a'] },
        { from: '2025-05-01', to: '2025-12-31', certificateIds: ['b'] },
      ]),
    ).toEqual([{ from: '2025-01-01', to: '2025-12-31', certificateIds: ['a', 'b'] }]);
  });

  it('treats a same-day renewal as continuous coverage', () => {
    expect(
      mergeOverlappingWindows([
        { from: '2025-01-01', to: '2025-06-30', certificateIds: ['a'] },
        { from: '2025-07-01', to: '2025-12-31', certificateIds: ['b'] },
      ]),
    ).toHaveLength(1);
  });

  it('keeps a real gap between terms as two windows', () => {
    expect(
      mergeOverlappingWindows([
        { from: '2025-01-01', to: '2025-06-30', certificateIds: ['a'] },
        { from: '2025-07-03', to: '2025-12-31', certificateIds: ['b'] },
      ]),
    ).toHaveLength(2);
  });

  it('covers every payment once when two certificates overlap', () => {
    const result = computeExposure(
      sub(),
      [
        work('2025-03-01', dollars(50_000)),
        work('2025-05-15', dollars(50_000)),
        work('2025-11-01', dollars(50_000)),
      ],
      [
        cert({ id: 'c1', wcEffective: '2025-01-01', wcExpiration: '2025-06-30' }),
        cert({ id: 'c2', wcEffective: '2025-05-01', wcExpiration: '2025-12-31' }),
      ],
      policy(),
      PROFILE,
    );
    expect(result.coverageWindows).toHaveLength(1);
    expect(result.uncoveredTotal).toBe(0);
    expect(result.addedPremium).toBe(0);
    expect(result.zeroReason).toBe('covered');
  });

  it('counts a day covered by two certificates once when prorating', () => {
    // Two overlapping certificates cover 1 Jan – 31 Mar between them; work runs through
    // April, so 90 of 120 days are covered, not 180 of 120.
    const result = computeExposure(
      sub(),
      [payment({ workFrom: '2025-01-01', workTo: '2025-04-30', paidOn: '2025-05-15', amount: dollars(120_000) })],
      [
        cert({ id: 'c1', wcEffective: '2025-01-01', wcExpiration: '2025-02-28' }),
        cert({ id: 'c2', wcEffective: '2025-02-01', wcExpiration: '2025-03-31' }),
      ],
      policy(),
      { ...PROFILE, coveragePeriod: { ...PROFILE.coveragePeriod, partialOverlap: 'prorate_by_covered_days' } },
    );
    expect(result.assessments[0]?.coveredDays).toBe(90);
    expect(result.assessments[0]?.totalDays).toBe(120);
    expect(result.coveredTotal).toBe(dollars(90_000));
  });
});

describe('material credit', () => {
  it('ignores material claimed on a covered payment — the exposure is already zero', () => {
    const result = computeExposure(
      sub(),
      [
        work('2025-03-01', dollars(100_000), {
          materialAmount: dollars(40_000),
          materialEvidence: 'original_invoice',
        }),
      ],
      [cert()],
      policy(),
      PROFILE,
    );
    expect(result.materialClaimed).toBe(0);
    expect(result.materialAllowed).toBe(0);
    expect(result.addedPremium).toBe(0);
    expect(result.zeroReason).toBe('covered');
  });

  it('allows no deduction for evidence the profile does not accept', () => {
    const result = computeExposure(
      sub(),
      [
        work('2025-03-01', dollars(100_000), {
          materialAmount: dollars(40_000),
          materialEvidence: 'contract_schedule',
        }),
      ],
      [],
      policy(),
      PROFILE,
    );
    expect(result.materialClaimed).toBe(0);
    expect(result.addedPayroll).toBe(dollars(100_000));
  });

  it('caps the deduction and reports both figures', () => {
    const result = computeExposure(
      sub(),
      [
        work('2025-03-01', dollars(100_000), {
          materialAmount: dollars(90_000),
          materialEvidence: 'original_invoice',
        }),
      ],
      [],
      policy(),
      PROFILE,
    );
    expect(result.materialClaimed).toBe(dollars(90_000));
    expect(result.materialAllowed).toBe(dollars(50_000));
    expect(result.addedPayroll).toBe(dollars(50_000));
    expect(result.flags.find((f) => f.flag === 'MATERIAL_CAP_BINDING')?.figures).toEqual({
      claimed: dollars(90_000),
      allowed: dollars(50_000),
      disallowed: dollars(40_000),
    });
  });

  it('does not let a claimed material figure exceed the payment it sits on', () => {
    const result = computeExposure(
      sub(),
      [
        work('2025-03-01', dollars(10_000), {
          materialAmount: dollars(25_000),
          materialEvidence: 'original_invoice',
        }),
      ],
      [],
      policy(),
      PROFILE,
    );
    expect(result.materialClaimed).toBe(dollars(10_000));
    expect(result.materialAllowed).toBe(dollars(5_000));
  });

  it('pro-rates material on a payment that is only partly uncovered', () => {
    const result = computeExposure(
      sub(),
      [
        payment({
          workFrom: '2025-01-01',
          workTo: '2025-04-30',
          paidOn: '2025-05-15',
          amount: dollars(120_000),
          materialAmount: dollars(60_000),
          materialEvidence: 'original_invoice',
        }),
      ],
      [cert({ wcEffective: '2025-01-01', wcExpiration: '2025-03-31' })],
      policy(),
      { ...PROFILE, coveragePeriod: { ...PROFILE.coveragePeriod, partialOverlap: 'prorate_by_covered_days' } },
    );
    // 30 of 120 days uncovered → $30,000 uncovered, and a quarter of the claimed material.
    expect(result.uncoveredTotal).toBe(dollars(30_000));
    expect(result.materialClaimed).toBe(dollars(15_000));
    expect(result.materialAllowed).toBe(dollars(15_000));
    expect(result.addedPayroll).toBe(dollars(15_000));
  });
});

describe('degenerate inputs', () => {
  it('does not crash or divide by zero with no payments and a certificate on file', () => {
    const result = computeExposure(sub(), [], [cert()], policy(), PROFILE);
    expect(result.paidTotal).toBe(0);
    expect(result.addedPayroll).toBe(0);
    expect(result.addedPremium).toBe(0);
    expect(result.ifCertificateObtained).toBe(0);
    expect(result.ifSplitInvoiceObtained).toBe(0);
    expect(result.zeroReason).toBe('no_payments');
  });

  it('does not crash with no payments and no documents at all', () => {
    const result = computeExposure(sub(), [], [], policy(), PROFILE);
    expect(result.addedPremium).toBe(0);
    expect(result.coverageWindows).toEqual([]);
  });

  it('produces no coverage window from a certificate with an empty WC section', () => {
    const result = computeExposure(
      sub(),
      [work('2025-03-01', dollars(20_000))],
      [cert({ wcPresent: false, wcEffective: null, wcExpiration: null })],
      policy(),
      PROFILE,
    );
    expect(result.coverageWindows).toEqual([]);
    expect(result.addedPayroll).toBe(dollars(20_000));
    expect(result.flags.map((f) => f.flag)).toContain('GL_ONLY_CERTIFICATE');
  });

  it('produces no coverage window from a WC section with a missing date', () => {
    const result = computeExposure(
      sub(),
      [work('2025-03-01', dollars(20_000))],
      [cert({ wcExpiration: null })],
      policy(),
      PROFILE,
    );
    expect(result.coverageWindows).toEqual([]);
    expect(result.addedPayroll).toBe(dollars(20_000));
  });
});

describe('coverage window boundaries', () => {
  it('is inclusive on both ends', () => {
    const result = computeExposure(
      sub(),
      [
        work('2025-03-01', dollars(10_000)), // exact start
        work('2025-06-30', dollars(10_000)), // exact end
        work('2025-02-28', dollars(10_000)), // day before
        work('2025-07-01', dollars(10_000)), // day after
      ],
      [cert({ wcEffective: '2025-03-01', wcExpiration: '2025-06-30' })],
      policy(),
      PROFILE,
    );
    expect(result.coveredTotal).toBe(dollars(20_000));
    expect(result.uncoveredTotal).toBe(dollars(20_000));
  });

  it('excludes payments outside the policy term from the audit period entirely', () => {
    const result = computeExposure(
      sub(),
      [
        work('2024-12-31', dollars(50_000)),
        work('2025-01-01', dollars(10_000)),
        work('2025-12-31', dollars(10_000)),
        work('2026-01-01', dollars(50_000)),
      ],
      [],
      policy(),
      PROFILE,
    );
    expect(result.paidTotal).toBe(dollars(20_000));
  });
});

describe('counterfactuals', () => {
  it('values a certificate at the whole exposure and a split invoice at half of it', () => {
    const result = computeExposure(
      sub(),
      [work('2025-03-01', dollars(100_000))],
      [],
      policy(),
      PROFILE,
    );
    expect(result.ifCertificateObtained).toBe(result.addedPremium);
    expect(result.ifSplitInvoiceObtained).toBe(dollars(5_000));
  });

  it('values a split invoice at zero once the cap is already exhausted', () => {
    const result = computeExposure(
      sub(),
      [
        work('2025-03-01', dollars(100_000), {
          materialAmount: dollars(50_000),
          materialEvidence: 'original_invoice',
        }),
      ],
      [],
      policy(),
      PROFILE,
    );
    expect(result.ifSplitInvoiceObtained).toBe(0);
    expect(result.ifCertificateObtained).toBe(result.addedPremium);
  });
});

describe('rating', () => {
  it('uses the recorded class for the subcontractor’s trade', () => {
    const result = computeExposure(
      sub({ classCodeOverride: { classCode: '5551', rate: 315_000 } }),
      [work('2025-03-01', dollars(100_000))],
      [],
      policy(),
      PROFILE,
    );
    expect(result.rate.provenance).toBe('subcontractor_class');
    expect(result.rate.classCode).toBe('5551');
    // 100,000 / 100 × 31.50 × 1.000
    expect(result.addedPremium).toBe(dollars(31_500));
  });

  it('rounds to the cent exactly once, at the end', () => {
    const result = computeExposure(
      sub({ classCodeOverride: { classCode: '5645', rate: 124_000 } }),
      [work('2025-03-01', dollars(143_000))],
      [],
      policy({ experienceMod: 1_050 }),
      PROFILE,
    );
    // 143,000 / 100 × 12.40 × 1.05 = 18,618.60
    expect(result.addedPremium).toBe(1_861_860);
  });
});

describe('triage', () => {
  it('prices an untriaged vendor as a subcontractor and flags it above the threshold', () => {
    const result = computeExposure(
      sub({ triage: 'undecided' }),
      [work('2025-03-01', dollars(60_000))],
      [],
      policy(),
      PROFILE,
    );
    expect(result.addedPayroll).toBe(dollars(60_000));
    expect(result.flags.map((f) => f.flag)).toContain('LARGE_UNMATCHED_VENDOR');
  });

  it('removes a vendor the contractor triaged as a material supplier', () => {
    const result = computeExposure(
      sub({ triage: 'supplier' }),
      [work('2025-03-01', dollars(60_000))],
      [],
      policy(),
      PROFILE,
    );
    expect(result.paidTotal).toBe(dollars(60_000));
    expect(result.addedPremium).toBe(0);
    expect(result.zeroReason).toBe('not_a_subcontractor');
  });

  it('takes the flag threshold from the profile', () => {
    const result = computeExposure(
      sub({ triage: 'undecided' }),
      [work('2025-03-01', dollars(6_000))],
      [],
      policy(),
      { ...PROFILE, largeUntriagedVendorThreshold: dollars(5_000) },
    );
    expect(result.flags.map((f) => f.flag)).toContain('LARGE_UNMATCHED_VENDOR');
  });
});

describe('officer exclusion', () => {
  it('flags a certificate that shows WC but notes an officer exclusion', () => {
    const result = computeExposure(
      sub(),
      [work('2025-03-01', dollars(20_000))],
      [cert({ wcOfficerExclusionNoted: true })],
      policy(),
      PROFILE,
    );
    expect(result.flags.map((f) => f.flag)).toContain('OFFICER_EXCLUSION_NOTED');
    // The flag annotates; it never moves a dollar.
    expect(result.addedPremium).toBe(0);
  });
});

describe('portfolio roll-up', () => {
  it('ranks by premium and keeps the ledger total whole', () => {
    const portfolio = computePortfolioExposure({
      subs: [
        sub({ id: 'a', name: 'Alpha' }),
        sub({ id: 'b', name: 'Bravo' }),
        sub({ id: 'c', name: 'Charlie', triage: 'supplier' }),
      ],
      payments: [
        payment({ ...work('2025-03-01', dollars(30_000)), subcontractorId: 'a' }),
        payment({ ...work('2025-03-01', dollars(90_000)), subcontractorId: 'b' }),
        payment({ ...work('2025-03-01', dollars(50_000)), subcontractorId: 'c' }),
      ],
      certificates: [],
      policy: policy(),
      computedAt: '2026-01-01T00:00:00.000Z',
      catalogue: TEST_CATALOGUE,
    });

    expect(portfolio.subs.map((entry) => entry.subcontractorName)).toEqual([
      'Bravo',
      'Alpha',
      'Charlie',
    ]);
    expect(portfolio.addedPayroll).toBe(dollars(120_000));
    expect(portfolio.addedPremiumBeforeSurcharge).toBe(dollars(12_000));
  });
});
