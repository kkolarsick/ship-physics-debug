import { describe, expect, it } from 'vitest';
import { computePortfolioExposure } from '@/lib/exposure/compute';
import { activeTriggers, assessAuditNoncompliance } from '@/lib/exposure/noncompliance';
import { PROFILE_DEEMED_SHARE, PROFILE_INVOICE_SPLIT, TEST_CATALOGUE } from '../fixtures/profiles';
import { auditCompliance, dollars, payment, policy, sub } from '../fixtures/scenario';

/**
 * An audit noncompliance charge is about the audit. The old engine applied it whenever any
 * subcontractor carried exposure, which is a different mechanism entirely — a contractor
 * who cooperates fully with their audit does not owe it however much uninsured
 * subcontract cost they have.
 */
const WORK = { workFrom: '2025-03-01', workTo: '2025-03-31', paidOn: '2025-04-15' } as const;

function portfolio(compliance = auditCompliance(), jurisdiction = 'US-XA') {
  return computePortfolioExposure({
    subs: [sub()],
    payments: [payment({ ...WORK, amount: dollars(200_000) })],
    certificates: [],
    policy: policy({ jurisdiction, auditCompliance: compliance }),
    computedAt: '2026-01-01T00:00:00.000Z',
    catalogue: TEST_CATALOGUE,
  });
}

describe('independence from uninsured-subcontractor exposure', () => {
  it('charges nothing when the audit went fine, however large the exposure', () => {
    const result = portfolio();
    expect(result.addedPremiumBeforeSurcharge).toBe(dollars(20_000));
    expect(result.auditNoncompliance.applies).toBe(false);
    expect(result.auditNoncompliance.charge).toBe(0);
    expect(result.totalExposure).toBe(dollars(20_000));
  });

  it('says plainly that exposure does not trigger it', () => {
    expect(portfolio().auditNoncompliance.statement).toContain(
      'Uninsured subcontract exposure does not trigger',
    );
  });

  it('charges even with no subcontractor exposure at all, when the audit conditions are met', () => {
    const result = computePortfolioExposure({
      subs: [],
      payments: [],
      certificates: [],
      policy: policy({
        auditCompliance: auditCompliance({
          endorsementOnPolicy: true,
          recordsFurnished: false,
          carrierConfiguredPct: 100_000, // 10%
        }),
      }),
      computedAt: '2026-01-01T00:00:00.000Z',
      catalogue: TEST_CATALOGUE,
    });

    expect(result.addedPremiumBeforeSurcharge).toBe(0);
    expect(result.auditNoncompliance.applies).toBe(true);
    expect(result.auditNoncompliance.charge).toBe(dollars(18_000)); // 10% of 180,000
    expect(result.totalExposure).toBe(dollars(18_000));
  });
});

describe('triggering conditions', () => {
  it('needs more than the endorsement alone', () => {
    const result = portfolio(auditCompliance({ endorsementOnPolicy: true, carrierConfiguredPct: 100_000 }));
    expect(result.auditNoncompliance.applies).toBe(false);
    expect(result.auditNoncompliance.statement).toContain('records were furnished');
  });

  it('applies when records were not furnished and the endorsement is on the policy', () => {
    const result = portfolio(
      auditCompliance({
        endorsementOnPolicy: true,
        recordsFurnished: false,
        carrierConfiguredPct: 50_000,
      }),
    );
    expect(result.auditNoncompliance.applies).toBe(true);
    expect(result.auditNoncompliance.charge).toBe(dollars(9_000)); // 5% of 180,000
    expect(result.auditNoncompliance.triggersPresent).toHaveLength(2);
  });

  it('applies when the audit was not permitted', () => {
    const result = portfolio(
      auditCompliance({
        endorsementOnPolicy: true,
        auditPermitted: false,
        carrierConfiguredPct: 50_000,
      }),
    );
    expect(result.auditNoncompliance.applies).toBe(true);
  });

  it('ignores a condition the profile does not recognise', () => {
    // The deemed-share profile recognises the endorsement and a refused audit, but not
    // "records not furnished".
    const triggers = activeTriggers(
      auditCompliance({ endorsementOnPolicy: true, recordsFurnished: false }),
      PROFILE_DEEMED_SHARE.auditNoncompliance,
    );
    expect(triggers).toEqual(['endorsement_on_policy']);
  });

  it('is zero where the percentage on the policy is zero, and says why', () => {
    const result = portfolio(
      auditCompliance({ endorsementOnPolicy: true, recordsFurnished: false, carrierConfiguredPct: 0 }),
    );
    expect(result.auditNoncompliance.applies).toBe(false);
    expect(result.auditNoncompliance.statement).toContain('works out to zero');
  });
});

describe('the charge mechanism comes from the profile', () => {
  it('takes a percentage off the insured’s own policy under one profile', () => {
    const assessment = assessAuditNoncompliance(
      policy({
        auditCompliance: auditCompliance({
          endorsementOnPolicy: true,
          recordsFurnished: false,
          carrierConfiguredPct: 250_000, // 25%
        }),
      }),
      PROFILE_INVOICE_SPLIT.auditNoncompliance,
    );
    expect(assessment.charge).toBe(dollars(45_000));
    expect(assessment.basis).toBe('carrier_configured_percentage');
  });

  it('adds a further premium under a multiple-of-premium profile', () => {
    const assessment = assessAuditNoncompliance(
      policy({
        auditCompliance: auditCompliance({ endorsementOnPolicy: true, auditPermitted: false }),
      }),
      PROFILE_DEEMED_SHARE.auditNoncompliance,
    );
    // Two times premium means one further premium is added on top of the estimate.
    expect(assessment.charge).toBe(dollars(180_000));
    expect(assessment.basis).toBe('multiple_of_estimated_premium');
  });

  it('models nothing where the profile does not support a charge', () => {
    const assessment = assessAuditNoncompliance(
      policy({
        auditCompliance: auditCompliance({ endorsementOnPolicy: true, recordsFurnished: false }),
      }),
      { supported: false, triggers: [], charge: { kind: 'not_modeled' }, notes: '' },
    );
    expect(assessment.applies).toBe(false);
    expect(assessment.charge).toBe(0);
    expect(assessment.statement).toContain('does not model');
  });
});
