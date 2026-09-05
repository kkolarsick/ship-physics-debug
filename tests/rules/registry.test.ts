import { describe, expect, it } from 'vitest';
import {
  profileProducesEstimates,
  resolveRulesProfile,
  supportedJurisdictions,
} from '@/lib/rules/registry';
import { SHIPPED_PROFILES, US_CA_WCIRB, US_NCCI_BASIC_MANUAL } from '@/lib/rules/profiles';
import {
  PROFILE_DEEMED_SHARE,
  PROFILE_INVOICE_SPLIT,
  TEST_CATALOGUE,
} from '../fixtures/profiles';
import type { RulesProfile } from '@/lib/rules/types';

describe('fail closed', () => {
  it('resolves nothing when the policy names no jurisdiction', () => {
    const result = resolveRulesProfile({ jurisdiction: null }, TEST_CATALOGUE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('jurisdiction_not_set');
  });

  it('resolves nothing for a blank jurisdiction', () => {
    const result = resolveRulesProfile({ jurisdiction: '   ' }, TEST_CATALOGUE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('jurisdiction_not_set');
  });

  it('refuses to borrow another jurisdiction’s rules', () => {
    const result = resolveRulesProfile({ jurisdiction: 'US-ZZ' }, TEST_CATALOGUE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('jurisdiction_not_supported');
  });

  it('ships no catch-all profile', () => {
    // Any profile claiming to cover everything would be the national default this
    // product must not have.
    for (const profile of SHIPPED_PROFILES) {
      expect(profile.jurisdictions.length).toBeGreaterThan(0);
      expect(profile.jurisdictions).not.toContain('*');
    }
    expect(resolveRulesProfile({ jurisdiction: 'ZZ-ZZ' }).ok).toBe(false);
  });

  it('rejects a rating bureau that contradicts the jurisdiction', () => {
    const result = resolveRulesProfile(
      { jurisdiction: 'US-XA', ratingBureau: 'TEST-B' },
      TEST_CATALOGUE,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('bureau_mismatch');
  });

  it('accepts a rating bureau that agrees with the jurisdiction', () => {
    const result = resolveRulesProfile(
      { jurisdiction: 'US-XA', ratingBureau: 'TEST-A' },
      TEST_CATALOGUE,
    );
    expect(result.ok).toBe(true);
  });
});

describe('resolution', () => {
  it('resolves a supported jurisdiction to its profile', () => {
    const result = resolveRulesProfile({ jurisdiction: 'US-XB' }, TEST_CATALOGUE);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profile.rulesetId).toBe('test-deemed-share');
  });

  it('prefers the most recently effective profile for a jurisdiction', () => {
    const older: RulesProfile = { ...PROFILE_INVOICE_SPLIT, effectiveFrom: '2020-01-01', rulesetVersion: '0.9.0' };
    const newer: RulesProfile = { ...PROFILE_INVOICE_SPLIT, effectiveFrom: '2026-01-01', rulesetVersion: '2.0.0' };
    const result = resolveRulesProfile({ jurisdiction: 'US-XA' }, [older, newer]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profile.rulesetVersion).toBe('2.0.0');
  });

  it('skips retired profiles entirely', () => {
    const retired: RulesProfile = { ...PROFILE_INVOICE_SPLIT, status: 'retired' };
    const result = resolveRulesProfile({ jurisdiction: 'US-XA' }, [retired]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('jurisdiction_not_supported');
  });

  it('lists only jurisdictions this build can price', () => {
    const listed = supportedJurisdictions(TEST_CATALOGUE).map((entry) => entry.jurisdiction);
    expect(listed).toEqual(['US-XA', 'US-XB', 'US-XC']);
  });
});

describe('pinning, for reproducibility', () => {
  it('returns the exact version a saved figure was produced under', () => {
    const v1: RulesProfile = { ...PROFILE_INVOICE_SPLIT, rulesetVersion: '1.0.0' };
    const v2: RulesProfile = {
      ...PROFILE_INVOICE_SPLIT,
      rulesetVersion: '2.0.0',
      effectiveFrom: '2026-06-01',
    };

    const pinned = resolveRulesProfile(
      { jurisdiction: 'US-XA', rulesetId: 'test-invoice-split', rulesetVersion: '1.0.0' },
      [v1, v2],
    );
    expect(pinned.ok).toBe(true);
    if (pinned.ok) expect(pinned.profile.rulesetVersion).toBe('1.0.0');
  });

  it('reports a pinned version that is not in this build rather than substituting one', () => {
    const result = resolveRulesProfile(
      { jurisdiction: 'US-XA', rulesetId: 'test-invoice-split', rulesetVersion: '0.0.1' },
      TEST_CATALOGUE,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('ruleset_version_not_found');
  });

  it('reports a pinned ruleset that does not exist at all', () => {
    const result = resolveRulesProfile(
      { jurisdiction: 'US-XA', rulesetId: 'nope' },
      TEST_CATALOGUE,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('ruleset_not_found');
  });

  it('lets a pinned ruleset override the jurisdiction, so history reproduces', () => {
    const result = resolveRulesProfile(
      { jurisdiction: 'US-XB', rulesetId: 'test-invoice-split', rulesetVersion: '1.0.0' },
      TEST_CATALOGUE,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profile).toBe(PROFILE_INVOICE_SPLIT);
  });
});

describe('shipped profiles', () => {
  it('models NCCI states and produces estimates for them', () => {
    const result = resolveRulesProfile({ jurisdiction: 'US-TN' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.rulesetId).toBe(US_NCCI_BASIC_MANUAL.rulesetId);
      expect(profileProducesEstimates(result.profile)).toBe(true);
    }
  });

  it('recognises California without pricing it', () => {
    const result = resolveRulesProfile({ jurisdiction: 'US-CA' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.rulesetId).toBe(US_CA_WCIRB.rulesetId);
      // Declared so the product knows the jurisdiction exists, but deliberately not
      // modelled: California's plan is not the NCCI Basic Manual and has not been
      // transcribed. Borrowing NCCI treatment here would be a wrong number, not a gap.
      expect(profileProducesEstimates(result.profile)).toBe(false);
    }
  });

  it('marks every unreviewed profile as a draft so its estimates are flagged', () => {
    for (const profile of SHIPPED_PROFILES) {
      if (profile.status === 'verified') {
        expect(profile.verifiedBy).not.toBeNull();
        expect(profile.verifiedAt).not.toBeNull();
      } else {
        expect(profile.verifiedBy).toBeNull();
      }
    }
  });

  it('gives every shipped profile at least one source to check it against', () => {
    for (const profile of SHIPPED_PROFILES) {
      expect(profile.sources.length).toBeGreaterThan(0);
    }
  });
});

describe('the fixtures disagree, which is the point', () => {
  it('differs on every axis that moves a dollar', () => {
    expect(PROFILE_INVOICE_SPLIT.uninsuredSubcontractor.treatment).not.toBe(
      PROFILE_DEEMED_SHARE.uninsuredSubcontractor.treatment,
    );
    expect(PROFILE_INVOICE_SPLIT.laborMaterial.separationPermitted).not.toBe(
      PROFILE_DEEMED_SHARE.laborMaterial.separationPermitted,
    );
    expect(PROFILE_INVOICE_SPLIT.classification.basis).not.toBe(
      PROFILE_DEEMED_SHARE.classification.basis,
    );
    expect(PROFILE_INVOICE_SPLIT.coveragePeriod.paymentDateProxyPermitted).not.toBe(
      PROFILE_DEEMED_SHARE.coveragePeriod.paymentDateProxyPermitted,
    );
    expect(PROFILE_INVOICE_SPLIT.coveragePeriod.partialOverlap).not.toBe(
      PROFILE_DEEMED_SHARE.coveragePeriod.partialOverlap,
    );
    expect(PROFILE_INVOICE_SPLIT.auditNoncompliance.charge.kind).not.toBe(
      PROFILE_DEEMED_SHARE.auditNoncompliance.charge.kind,
    );
  });
});
