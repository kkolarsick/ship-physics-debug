import { describe, expect, it } from 'vitest';
import { computeExposure, computePortfolioExposure } from '@/lib/exposure/compute';
import { mergeOverlappingWindows } from '@/lib/exposure/windows';
import type {
  CertificateInput,
  PaymentInput,
  PolicyInput,
  SubcontractorInput,
} from '@/lib/exposure/types';

const dollars = (amount: number): number => Math.round(amount * 100);

const POLICY: PolicyInput = {
  id: 'p1',
  termStart: '2025-01-01',
  termEnd: '2025-12-31',
  experienceMod: 1_050,
  estimatedAnnualPremium: dollars(180_000),
  noncomplianceSurchargePct: 0,
  governingClassCode: '5645',
  governingRate: 124_000,
};

function sub(overrides: Partial<SubcontractorInput> = {}): SubcontractorInput {
  return {
    id: 's1',
    name: 'Test Sub',
    entityType: 'llc',
    trade: 'General',
    triage: 'subcontractor',
    classCodeOverride: null,
    ...overrides,
  };
}

function payment(overrides: Partial<PaymentInput> & { paidOn: string; amount: number }): PaymentInput {
  return {
    id: `pay-${overrides.paidOn}-${overrides.amount}`,
    subcontractorId: 's1',
    sourceRef: null,
    materialAmount: null,
    materialEvidence: 'none',
    ...overrides,
  };
}

function cert(overrides: Partial<CertificateInput> = {}): CertificateInput {
  return {
    id: 'c1',
    subcontractorId: 's1',
    namedInsured: 'Test Sub LLC',
    wcPresent: true,
    wcEffective: '2025-01-01',
    wcExpiration: '2025-12-31',
    wcOfficerExclusionNoted: false,
    glPresent: true,
    producerName: null,
    producerEmail: null,
    ...overrides,
  };
}

describe('partial coverage', () => {
  it('prices only the uncovered slice: 200,000 paid, 120,000 covered → 80,000 payroll', () => {
    const payments = [
      payment({ paidOn: '2025-02-01', amount: dollars(70_000) }),
      payment({ paidOn: '2025-04-15', amount: dollars(50_000) }),
      payment({ paidOn: '2025-07-01', amount: dollars(45_000) }),
      payment({ paidOn: '2025-10-20', amount: dollars(35_000) }),
    ];
    const certificates = [cert({ wcEffective: '2025-01-01', wcExpiration: '2025-04-30' })];

    const result = computeExposure(sub(), payments, certificates, POLICY);

    expect(result.paidTotal).toBe(dollars(200_000));
    expect(result.coveredTotal).toBe(dollars(120_000));
    expect(result.uncoveredTotal).toBe(dollars(80_000));
    expect(result.addedPayroll).toBe(dollars(80_000));
    expect(result.zeroReason).toBeNull();
  });

  it('flags a certificate that ends before the term while the sub is still being paid', () => {
    const result = computeExposure(
      sub(),
      [
        payment({ paidOn: '2025-02-01', amount: dollars(10_000) }),
        payment({ paidOn: '2025-08-01', amount: dollars(10_000) }),
      ],
      [cert({ wcEffective: '2025-01-01', wcExpiration: '2025-04-30' })],
      POLICY,
    );
    expect(result.flags.map((f) => f.flag)).toContain('CERT_EXPIRES_MID_TERM');
  });
});

describe('overlapping certificates', () => {
  it('merges overlapping windows instead of double-counting the overlap', () => {
    const merged = mergeOverlappingWindows([
      { from: '2025-01-01', to: '2025-06-30', certificateIds: ['a'] },
      { from: '2025-05-01', to: '2025-12-31', certificateIds: ['b'] },
    ]);
    expect(merged).toEqual([
      { from: '2025-01-01', to: '2025-12-31', certificateIds: ['a', 'b'] },
    ]);
  });

  it('treats a same-day renewal as continuous coverage', () => {
    const merged = mergeOverlappingWindows([
      { from: '2025-01-01', to: '2025-06-30', certificateIds: ['a'] },
      { from: '2025-07-01', to: '2025-12-31', certificateIds: ['b'] },
    ]);
    expect(merged).toHaveLength(1);
  });

  it('keeps a real gap between terms as two windows', () => {
    const merged = mergeOverlappingWindows([
      { from: '2025-01-01', to: '2025-06-30', certificateIds: ['a'] },
      { from: '2025-07-03', to: '2025-12-31', certificateIds: ['b'] },
    ]);
    expect(merged).toHaveLength(2);
  });

  it('covers every payment once when two certificates overlap', () => {
    const result = computeExposure(
      sub(),
      [
        payment({ paidOn: '2025-03-01', amount: dollars(50_000) }),
        payment({ paidOn: '2025-05-15', amount: dollars(50_000) }),
        payment({ paidOn: '2025-11-01', amount: dollars(50_000) }),
      ],
      [
        cert({ id: 'c1', wcEffective: '2025-01-01', wcExpiration: '2025-06-30' }),
        cert({ id: 'c2', wcEffective: '2025-05-01', wcExpiration: '2025-12-31' }),
      ],
      POLICY,
    );
    expect(result.coverageWindows).toHaveLength(1);
    expect(result.uncoveredTotal).toBe(0);
    expect(result.addedPremium).toBe(0);
    expect(result.zeroReason).toBe('covered');
  });
});

describe('material credit', () => {
  it('ignores material claimed on a covered payment — the exposure is already zero', () => {
    const result = computeExposure(
      sub(),
      [
        payment({
          paidOn: '2025-03-01',
          amount: dollars(100_000),
          materialAmount: dollars(40_000),
          materialEvidence: 'original_invoice',
        }),
      ],
      [cert()],
      POLICY,
    );
    expect(result.materialClaimed).toBe(0);
    expect(result.materialAllowed).toBe(0);
    expect(result.addedPremium).toBe(0);
    expect(result.zeroReason).toBe('covered');
  });

  it('allows no deduction without an original invoice', () => {
    const result = computeExposure(
      sub(),
      [
        payment({
          paidOn: '2025-03-01',
          amount: dollars(100_000),
          materialAmount: dollars(40_000),
          materialEvidence: 'contract_schedule',
        }),
      ],
      [],
      POLICY,
    );
    expect(result.materialClaimed).toBe(0);
    expect(result.addedPayroll).toBe(dollars(100_000));
  });

  it('caps the deduction at half of the uncovered total and reports both figures', () => {
    const result = computeExposure(
      sub(),
      [
        payment({
          paidOn: '2025-03-01',
          amount: dollars(100_000),
          materialAmount: dollars(90_000),
          materialEvidence: 'original_invoice',
        }),
      ],
      [],
      POLICY,
    );
    expect(result.materialClaimed).toBe(dollars(90_000));
    expect(result.materialAllowed).toBe(dollars(50_000));
    expect(result.addedPayroll).toBe(dollars(50_000));
    const flag = result.flags.find((f) => f.flag === 'MATERIAL_CAP_BINDING');
    expect(flag?.figures).toEqual({
      claimed: dollars(90_000),
      allowed: dollars(50_000),
      disallowed: dollars(40_000),
    });
  });

  it('does not let a claimed material figure exceed the payment it sits on', () => {
    const result = computeExposure(
      sub(),
      [
        payment({
          paidOn: '2025-03-01',
          amount: dollars(10_000),
          materialAmount: dollars(25_000),
          materialEvidence: 'original_invoice',
        }),
      ],
      [],
      POLICY,
    );
    expect(result.materialClaimed).toBe(dollars(10_000));
    expect(result.materialAllowed).toBe(dollars(5_000));
  });
});

describe('degenerate inputs', () => {
  it('does not crash or divide by zero with no payments and a certificate on file', () => {
    const result = computeExposure(sub(), [], [cert()], POLICY);
    expect(result.paidTotal).toBe(0);
    expect(result.addedPayroll).toBe(0);
    expect(result.addedPremium).toBe(0);
    expect(result.ifCertificateObtained).toBe(0);
    expect(result.ifSplitInvoiceObtained).toBe(0);
    expect(result.zeroReason).toBe('no_payments');
  });

  it('does not crash with no payments and no documents at all', () => {
    const result = computeExposure(sub(), [], [], POLICY);
    expect(result.addedPremium).toBe(0);
    expect(result.coverageWindows).toEqual([]);
  });

  it('produces no coverage window from a certificate with an empty WC section', () => {
    const result = computeExposure(
      sub(),
      [payment({ paidOn: '2025-03-01', amount: dollars(20_000) })],
      [cert({ wcPresent: false, wcEffective: null, wcExpiration: null })],
      POLICY,
    );
    expect(result.coverageWindows).toEqual([]);
    expect(result.addedPayroll).toBe(dollars(20_000));
    expect(result.flags.map((f) => f.flag)).toContain('GL_ONLY_CERTIFICATE');
  });

  it('produces no coverage window from a WC section with a missing date', () => {
    const result = computeExposure(
      sub(),
      [payment({ paidOn: '2025-03-01', amount: dollars(20_000) })],
      [cert({ wcExpiration: null })],
      POLICY,
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
        payment({ paidOn: '2025-03-01', amount: dollars(10_000) }), // exact start
        payment({ paidOn: '2025-06-30', amount: dollars(10_000) }), // exact end
        payment({ paidOn: '2025-02-28', amount: dollars(10_000) }), // day before
        payment({ paidOn: '2025-07-01', amount: dollars(10_000) }), // day after
      ],
      [cert({ wcEffective: '2025-03-01', wcExpiration: '2025-06-30' })],
      POLICY,
    );
    expect(result.coveredTotal).toBe(dollars(20_000));
    expect(result.uncoveredTotal).toBe(dollars(20_000));
  });

  it('excludes payments outside the policy term from the audit period entirely', () => {
    const result = computeExposure(
      sub(),
      [
        payment({ paidOn: '2024-12-31', amount: dollars(50_000) }),
        payment({ paidOn: '2025-01-01', amount: dollars(10_000) }),
        payment({ paidOn: '2025-12-31', amount: dollars(10_000) }),
        payment({ paidOn: '2026-01-01', amount: dollars(50_000) }),
      ],
      [],
      POLICY,
    );
    expect(result.paidTotal).toBe(dollars(20_000));
  });
});

describe('counterfactuals', () => {
  it('values a certificate at the whole exposure and a split invoice at half of it', () => {
    const result = computeExposure(
      sub(),
      [payment({ paidOn: '2025-03-01', amount: dollars(100_000) })],
      [],
      POLICY,
    );
    expect(result.ifCertificateObtained).toBe(result.addedPremium);
    expect(result.ifSplitInvoiceObtained).toBe(Math.round(result.addedPremium / 2));
  });

  it('values a split invoice at zero once the cap is already exhausted', () => {
    const result = computeExposure(
      sub(),
      [
        payment({
          paidOn: '2025-03-01',
          amount: dollars(100_000),
          materialAmount: dollars(50_000),
          materialEvidence: 'original_invoice',
        }),
      ],
      [],
      POLICY,
    );
    expect(result.ifSplitInvoiceObtained).toBe(0);
    expect(result.ifCertificateObtained).toBe(result.addedPremium);
  });
});

describe('rating', () => {
  it('uses a class code override in place of the governing rate', () => {
    const result = computeExposure(
      sub({ classCodeOverride: { classCode: '5551', rate: 315_000 } }),
      [payment({ paidOn: '2025-03-01', amount: dollars(100_000) })],
      [],
      POLICY,
    );
    expect(result.rateSource).toBe('class_code_override');
    expect(result.classCode).toBe('5551');
    // 100,000 / 100 * 31.50 * 1.05 = 33,075.00
    expect(result.addedPremium).toBe(dollars(33_075));
  });

  it('rounds to the cent exactly once, at the end', () => {
    const result = computeExposure(
      sub(),
      [payment({ paidOn: '2025-03-01', amount: dollars(143_000) })],
      [],
      POLICY,
    );
    // 143,000 / 100 * 12.40 * 1.05 = 18,618.60
    expect(result.addedPremium).toBe(1_861_860);
  });
});

describe('triage', () => {
  it('prices an untriaged vendor as a subcontractor and flags it above the threshold', () => {
    const result = computeExposure(
      sub({ triage: 'undecided' }),
      [payment({ paidOn: '2025-03-01', amount: dollars(60_000) })],
      [],
      POLICY,
    );
    expect(result.addedPayroll).toBe(dollars(60_000));
    expect(result.flags.map((f) => f.flag)).toContain('LARGE_UNMATCHED_VENDOR');
  });

  it('removes a vendor the contractor triaged as a material supplier', () => {
    const result = computeExposure(
      sub({ triage: 'supplier' }),
      [payment({ paidOn: '2025-03-01', amount: dollars(60_000) })],
      [],
      POLICY,
    );
    expect(result.paidTotal).toBe(dollars(60_000));
    expect(result.addedPremium).toBe(0);
    expect(result.zeroReason).toBe('not_a_subcontractor');
  });
});

describe('policy-level surcharge', () => {
  const surchargePolicy: PolicyInput = { ...POLICY, noncomplianceSurchargePct: 50_000 }; // 5%

  it('applies only when at least one sub carries exposure', () => {
    const withExposure = computePortfolioExposure(
      [sub()],
      [payment({ paidOn: '2025-03-01', amount: dollars(100_000) })],
      [],
      surchargePolicy,
    );
    expect(withExposure.surcharge).toBe(dollars(9_000)); // 5% of 180,000
    expect(withExposure.totalExposure).toBe(
      withExposure.addedPremiumBeforeSurcharge + dollars(9_000),
    );

    const withoutExposure = computePortfolioExposure(
      [sub()],
      [payment({ paidOn: '2025-03-01', amount: dollars(100_000) })],
      [cert()],
      surchargePolicy,
    );
    expect(withoutExposure.surcharge).toBe(0);
    expect(withoutExposure.totalExposure).toBe(0);
  });
});

describe('officer exclusion', () => {
  it('flags a certificate that shows WC but notes an officer exclusion', () => {
    const result = computeExposure(
      sub(),
      [payment({ paidOn: '2025-03-01', amount: dollars(20_000) })],
      [cert({ wcOfficerExclusionNoted: true })],
      POLICY,
    );
    expect(result.flags.map((f) => f.flag)).toContain('OFFICER_EXCLUSION_NOTED');
    // The flag annotates; it never moves a dollar.
    expect(result.addedPremium).toBe(0);
  });
});
