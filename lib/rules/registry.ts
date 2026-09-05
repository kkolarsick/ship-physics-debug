/**
 * Rules profile resolution — the fail-closed boundary.
 *
 * Nothing in this product falls back to a national default. A policy that does not name a
 * jurisdiction, or names one no shipped profile covers, or pins a ruleset version that is
 * not on disk, resolves to a failure with a reason the UI can show. The engine turns that
 * into "estimate unavailable", never into a dollar figure.
 *
 * Pinning matters as much as resolving. A saved calculation records the exact
 * `rulesetId` and `rulesetVersion` it used, and re-resolving that pair returns that exact
 * profile, so a figure produced in March can be reproduced in November even after the
 * live profile for that jurisdiction has moved on.
 */
import { SHIPPED_PROFILES } from './profiles';
import type { Jurisdiction, RatingBureau, RulesProfile } from './types';

export type RulesResolutionFailure =
  | 'jurisdiction_not_set'
  | 'jurisdiction_not_supported'
  | 'ruleset_not_found'
  | 'ruleset_version_not_found'
  | 'ruleset_retired'
  | 'bureau_mismatch';

export const RULES_RESOLUTION_MESSAGES: Readonly<Record<RulesResolutionFailure, string>> = {
  jurisdiction_not_set:
    'No jurisdiction is set on this policy, so no rules profile applies and no estimate can be produced.',
  jurisdiction_not_supported:
    'No rules profile in this build covers that jurisdiction. Estimates are withheld rather than borrowing another jurisdiction’s treatment.',
  ruleset_not_found: 'The ruleset this policy pins is not present in this build.',
  ruleset_version_not_found:
    'The ruleset version this figure was produced under is not present in this build, so it cannot be reproduced exactly.',
  ruleset_retired: 'The ruleset this policy pins has been retired and no longer produces estimates.',
  bureau_mismatch:
    'The rating bureau on this policy does not match the profile resolved for its jurisdiction.',
};

export type RulesResolution =
  | { readonly ok: true; readonly profile: RulesProfile }
  | { readonly ok: false; readonly failure: RulesResolutionFailure; readonly message: string };

export interface RulesQuery {
  readonly jurisdiction: Jurisdiction | null;
  readonly ratingBureau?: RatingBureau | null;
  /** Set on a saved calculation to reproduce it exactly. */
  readonly rulesetId?: string | null;
  readonly rulesetVersion?: string | null;
}

function fail(failure: RulesResolutionFailure): RulesResolution {
  return { ok: false, failure, message: RULES_RESOLUTION_MESSAGES[failure] };
}

export function resolveRulesProfile(
  query: RulesQuery,
  catalogue: readonly RulesProfile[] = SHIPPED_PROFILES,
): RulesResolution {
  // An explicitly pinned ruleset wins, so historical figures reproduce byte for byte.
  if (query.rulesetId) {
    const byId = catalogue.filter((profile) => profile.rulesetId === query.rulesetId);
    if (byId.length === 0) return fail('ruleset_not_found');

    if (query.rulesetVersion) {
      const pinned = byId.find((profile) => profile.rulesetVersion === query.rulesetVersion);
      if (!pinned) return fail('ruleset_version_not_found');
      if (pinned.status === 'retired') return fail('ruleset_retired');
      return { ok: true, profile: pinned };
    }

    const latest = newest(byId);
    if (!latest) return fail('ruleset_not_found');
    if (latest.status === 'retired') return fail('ruleset_retired');
    return { ok: true, profile: latest };
  }

  if (!query.jurisdiction || query.jurisdiction.trim() === '') {
    return fail('jurisdiction_not_set');
  }

  const matches = catalogue.filter(
    (profile) =>
      profile.status !== 'retired' && profile.jurisdictions.includes(query.jurisdiction as string),
  );
  if (matches.length === 0) return fail('jurisdiction_not_supported');

  const profile = newest(matches);
  if (!profile) return fail('jurisdiction_not_supported');

  if (query.ratingBureau && query.ratingBureau !== profile.ratingBureau) {
    return fail('bureau_mismatch');
  }

  return { ok: true, profile };
}

function newest(profiles: readonly RulesProfile[]): RulesProfile | undefined {
  return [...profiles].sort(
    (a, b) =>
      b.effectiveFrom.localeCompare(a.effectiveFrom) ||
      b.rulesetVersion.localeCompare(a.rulesetVersion),
  )[0];
}

/** Jurisdictions this build can price at all, for the setup screen's picker. */
export function supportedJurisdictions(
  catalogue: readonly RulesProfile[] = SHIPPED_PROFILES,
): { jurisdiction: Jurisdiction; profile: RulesProfile }[] {
  const rows: { jurisdiction: Jurisdiction; profile: RulesProfile }[] = [];
  for (const profile of catalogue) {
    if (profile.status === 'retired') continue;
    for (const jurisdiction of profile.jurisdictions) rows.push({ jurisdiction, profile });
  }
  return rows.sort((a, b) => a.jurisdiction.localeCompare(b.jurisdiction));
}

/**
 * Whether a profile actually models enough to produce a figure. A profile may be declared
 * for a jurisdiction — so the product knows the jurisdiction exists — without its rules
 * having been transcribed yet.
 */
export function profileProducesEstimates(profile: RulesProfile): boolean {
  return profile.uninsuredSubcontractor.treatment !== 'not_modeled';
}
