import { describe, expect, it } from 'vitest';
import {
  LAUNCH_JURISDICTIONS,
  SHIPPED_PROFILES,
  US_NCCI_BASIC_MANUAL,
} from '@/lib/rules/profiles';
import {
  profileProducesEstimates,
  resolveRulesProfile,
  supportedJurisdictions,
} from '@/lib/rules/registry';
import { profileCitations } from '@/lib/rules/types';
import { PROFILE_DEEMED_SHARE, PROFILE_INVOICE_SPLIT } from '../fixtures/profiles';
import { runMatrix, runScenario, STATE_SCENARIOS } from './scenarios';

/**
 * What every shipped profile has to be true of, and the matrix each supported state has to
 * answer. Populating a launch state means these go from "declared" to a golden table.
 */
describe('the catalogue is coherent', () => {
  it('lets exactly one profile claim each jurisdiction', () => {
    const claims = new Map<string, string[]>();
    for (const profile of SHIPPED_PROFILES) {
      if (profile.status === 'retired') continue;
      for (const jurisdiction of profile.jurisdictions) {
        claims.set(jurisdiction, [...(claims.get(jurisdiction) ?? []), profile.rulesetId]);
      }
    }
    const contested = [...claims.entries()].filter(([, ids]) => ids.length > 1);
    expect(contested).toEqual([]);
  });

  it('recognises every launch state', () => {
    for (const jurisdiction of LAUNCH_JURISDICTIONS) {
      const result = resolveRulesProfile({ jurisdiction });
      expect(result.ok, `${jurisdiction} resolves to a profile`).toBe(true);
    }
  });

  it('names an authority and at least one source for every profile', () => {
    for (const profile of SHIPPED_PROFILES) {
      expect(profile.sourceAuthority, profile.rulesetId).toBeTruthy();
      expect(profileCitations(profile).length, profile.rulesetId).toBeGreaterThan(0);
    }
  });

  it('cites only primary or authoritative sources', () => {
    // There is no authority value that admits a blog post, and this asserts nobody added
    // one by widening the type.
    const allowed = new Set([
      'rating_bureau_manual',
      'state_regulation',
      'state_regulator_guidance',
      'ncci_manual',
      'carrier_audit_manual',
    ]);
    for (const profile of SHIPPED_PROFILES) {
      for (const citation of profileCitations(profile)) {
        expect(allowed.has(citation.authority), `${profile.rulesetId}: ${citation.label}`).toBe(true);
      }
    }
  });

  it('gives every unpopulated profile the open questions that would populate it', () => {
    for (const profile of SHIPPED_PROFILES) {
      if (profileProducesEstimates(profile)) continue;
      expect(profile.openQuestions.length, profile.rulesetId).toBeGreaterThan(5);
    }
  });

  it('marks a profile verified only when a person is recorded against it', () => {
    for (const profile of SHIPPED_PROFILES) {
      if (profile.status !== 'verified') continue;
      expect(profile.verifiedBy).toBeTruthy();
      expect(profile.verifiedAt).toBeTruthy();
    }
  });
});

describe('launch states are declared and fail closed until populated', () => {
  for (const jurisdiction of LAUNCH_JURISDICTIONS) {
    const resolution = resolveRulesProfile({ jurisdiction });
    const profile = resolution.ok ? resolution.profile : null;

    describe(jurisdiction, () => {
      it('resolves to its own profile, not to the NCCI one', () => {
        expect(profile).not.toBeNull();
        expect(profile?.rulesetId).not.toBe(US_NCCI_BASIC_MANUAL.rulesetId);
      });

      it('produces no dollar figure for any scenario in the matrix', () => {
        if (!profile || profileProducesEstimates(profile)) return; // populated: covered below
        for (const outcome of runMatrix(profile, jurisdiction)) {
          expect(outcome.status, `${jurisdiction}/${outcome.id}`).toBe('unavailable');
          expect(outcome.reason, `${jurisdiction}/${outcome.id}`).toBe('rules_not_populated');
          expect(outcome.addedPremium).toBeNull();
          expect(outcome.addedPayroll).toBe(0);
          expect(outcome.noncomplianceCharge).toBe(0);
        }
      });

      it('names the authority whose manual has to be transcribed', () => {
        expect(profile?.ratingBureau).toBeTruthy();
        expect(profileCitations(profile!).some((citation) => citation.url !== null)).toBe(true);
      });
    });
  }
});

describe('every scenario in the matrix has a defined outcome under a populated profile', () => {
  for (const entry of STATE_SCENARIOS) {
    it(entry.id, () => {
      const outcome = runScenario(PROFILE_INVOICE_SPLIT, entry, 'US-XA');
      // Either a figure, or a stated refusal. Never a silent zero standing in for both.
      if (outcome.status === 'estimated') {
        expect(outcome.addedPremium).not.toBeNull();
      } else {
        expect(outcome.reason).toBeTruthy();
      }
    });
  }
});

/**
 * The architectural test the plan calls for: the same subcontractor scenario, run under two
 * jurisdictions whose rules differ, has to come out differently. If these ever converge,
 * the rules layer has stopped being load-bearing.
 */
describe('the same scenario diverges between jurisdictions', () => {
  const underA = new Map(runMatrix(PROFILE_INVOICE_SPLIT, 'US-XA').map((row) => [row.id, row]));
  const underB = new Map(runMatrix(PROFILE_DEEMED_SHARE, 'US-XB').map((row) => [row.id, row]));

  it.each([
    ['uninsured_no_payroll_records', 'full contract price versus a deemed labor share'],
    ['labor_and_material_contract', 'a capped invoice deduction versus no separation at all'],
    ['equipment_with_operator', 'a one-third deemed share versus no relief'],
    ['coverage_lapses_mid_work_period', 'all-or-nothing versus a split by covered days'],
  ])('%s differs: %s', (id) => {
    const a = underA.get(id);
    const b = underB.get(id);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a?.addedPayroll).not.toBe(b?.addedPayroll);
  });

  it('diverges on whether a payment date may stand in for the work period', () => {
    expect(underA.get('work_period_unknown_payment_date_proxy')?.status).toBe('estimated');
    expect(underB.get('work_period_unknown_payment_date_proxy')?.status).toBe('unavailable');
  });

  it('diverges on whether an unknown class can be rated at all', () => {
    expect(underA.get('governing_rate_proxy')?.rateProvenance).toBe('governing_rate_proxy');
    expect(underB.get('governing_rate_proxy')?.rateProvenance).toBe('rules_profile_derived');
  });

  it('diverges on the audit noncompliance charge', () => {
    expect(underA.get('audit_noncompliance')?.noncomplianceCharge).not.toBe(
      underB.get('audit_noncompliance')?.noncomplianceCharge,
    );
  });

  it('builds payroll from actual records only where the profile prefers them', () => {
    expect(underA.get('actual_payroll_available')?.payrollBasis).toBe('actual_payroll');
    expect(underB.get('actual_payroll_available')?.payrollBasis).toBe('deemed_share');
  });
});

describe('supported-states listing', () => {
  it('separates jurisdictions that can be priced from those merely recognised', () => {
    const listed = supportedJurisdictions();
    const priceable = listed.filter((entry) => profileProducesEstimates(entry.profile));
    const declaredOnly = listed.filter((entry) => !profileProducesEstimates(entry.profile));

    // Every launch state is recognised; none is priceable until its profile is populated.
    for (const jurisdiction of LAUNCH_JURISDICTIONS) {
      expect(listed.some((entry) => entry.jurisdiction === jurisdiction)).toBe(true);
    }
    expect(declaredOnly.map((entry) => entry.jurisdiction).sort()).toEqual(
      [...LAUNCH_JURISDICTIONS].sort(),
    );
    expect(priceable.length).toBeGreaterThan(0);
  });
});
