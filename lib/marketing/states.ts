/**
 * Everything the public pages say about a state, derived from the rules registry.
 *
 * This module exists so the marketing surface cannot drift away from what the engine
 * implements. A state page does not contain a hand-written claim about what SubLedger can
 * calculate — it asks the profile. When a profile is populated, the page changes with it;
 * when it is not, the page says so in the same words the product does.
 */
import {
  profileProducesEstimates,
  resolveRulesProfile,
  supportedJurisdictions,
} from '@/lib/rules/registry';
import { LAUNCH_JURISDICTIONS } from '@/lib/rules/profiles';
import { profileCitations, type RulesProfile, type SourceCitation } from '@/lib/rules/types';
import { stateName, stateSlug } from './jurisdictions';

export type StateSupport =
  /** A populated, reviewed profile. Estimates are produced and the page may say so. */
  | 'supported'
  /** A populated profile nobody has checked against the manual yet. */
  | 'supported_draft'
  /** Recognised, authority named, rules not transcribed. No estimate is produced. */
  | 'declared'
  /** Nothing in this build covers it. */
  | 'unsupported';

export interface StateProfileSummary {
  readonly jurisdiction: string;
  readonly name: string;
  readonly slug: string;
  readonly path: string;
  readonly support: StateSupport;
  readonly producesEstimates: boolean;
  readonly ratingBureau: string | null;
  readonly rulesetId: string | null;
  readonly rulesetVersion: string | null;
  readonly effectiveFrom: string | null;
  readonly citations: readonly SourceCitation[];
  /** What the engine will calculate here, in plain sentences. Empty when it will not. */
  readonly canCalculate: readonly string[];
  /** What it will not, and why. Never empty — there is always something. */
  readonly willNotCalculate: readonly string[];
  /** Inputs that lower confidence when they are missing or proxied. */
  readonly confidenceCaveats: readonly string[];
  readonly isLaunchState: boolean;
}

export function supportOf(profile: RulesProfile | null): StateSupport {
  if (!profile) return 'unsupported';
  if (!profileProducesEstimates(profile)) return 'declared';
  return profile.status === 'verified' ? 'supported' : 'supported_draft';
}

/**
 * What the engine will actually do for this state, read off the profile rather than
 * asserted by a copywriter.
 */
export function canCalculate(profile: RulesProfile): string[] {
  const lines: string[] = [];
  const { uninsuredSubcontractor: uninsured, laborMaterial, payrollBasis, classification } = profile;

  if (uninsured.treatment === 'full_cost_included') {
    lines.push(
      'Amounts paid to a subcontractor with no workers’ compensation evidenced for the period of the work, treated as subject to inclusion in your auditable payroll.',
    );
  } else if (uninsured.treatment === 'labor_share_included' && uninsured.deemedLaborShare) {
    const { numerator, denominator } = uninsured.deemedLaborShare;
    lines.push(
      `A deemed labor share of ${numerator}/${denominator} of the uncovered subcontract cost, treated as auditable payroll.`,
    );
  }

  if (payrollBasis.actualPayrollPreferred) {
    lines.push(
      'The subcontractor’s own payroll for the work, used in place of the amount paid where you hold records for it.',
    );
  }

  if (laborMaterial.separationPermitted) {
    const cap =
      laborMaterial.cap.kind === 'none'
        ? 'with no cap'
        : `capped at ${laborMaterial.cap.share.numerator}/${laborMaterial.cap.share.denominator} of the ${laborMaterial.cap.kind === 'share_of_uncovered' ? 'uncovered amount' : 'total paid'}`;
    lines.push(`A labor/material separation ${cap}, where the accepted evidence is on file.`);
  }

  lines.push(
    classification.basis === 'governing_class'
      ? 'Rating at your policy’s governing class, which this jurisdiction applies to uninsured subcontract payroll.'
      : 'Rating at the class applicable to each subcontractor’s own trade.',
  );

  lines.push(
    profile.coveragePeriod.partialOverlap === 'prorate_by_covered_days'
      ? 'Coverage tested against the period the work was performed, with a period that straddles a lapse split across covered and uncovered days.'
      : 'Coverage tested against the period the work was performed, with a period that is not fully covered treated as uncovered.',
  );

  for (const rule of profile.specialCategories) {
    if (rule.treatment === 'deemed_labor_share_included' && rule.deemedLaborShare) {
      lines.push(
        `${categoryLabel(rule.category)}: ${rule.deemedLaborShare.numerator}/${rule.deemedLaborShare.denominator} of the contract treated as payroll.`,
      );
    } else if (rule.treatment === 'excluded_from_payroll') {
      lines.push(`${categoryLabel(rule.category)}: excluded from auditable payroll.`);
    }
  }

  if (profile.auditNoncompliance.supported) {
    lines.push(
      'An audit noncompliance charge, where your policy carries the endorsement and an audit condition applies. It is never inferred from uninsured subcontract cost.',
    );
  }

  return lines;
}

export function willNotCalculate(profile: RulesProfile | null, support: StateSupport): string[] {
  if (support === 'unsupported') {
    return ['Anything. No rules profile in this build covers this state, so no estimate is produced.'];
  }
  if (!profile || support === 'declared') {
    return [
      'A premium estimate of any kind. This state is recognised and the authority whose rules govern it is named, but those rules have not been transcribed into the product, so nothing is estimated from them.',
    ];
  }

  const lines: string[] = [];
  if (!profile.laborMaterial.separationPermitted) {
    lines.push('A labor/material deduction. This jurisdiction’s profile does not model one.');
  }
  if (!profile.classification.governingRateProxyPermitted) {
    lines.push(
      'Premium for a subcontractor whose class is unknown. Payroll is reported and no premium figure is produced.',
    );
  }
  if (!profile.coveragePeriod.paymentDateProxyPermitted) {
    lines.push(
      'An estimate from payment dates alone. This jurisdiction requires the period the work was performed.',
    );
  }
  for (const rule of profile.specialCategories) {
    if (rule.treatment === 'requires_review') {
      lines.push(`${categoryLabel(rule.category)}: not settled by this profile. ${rule.notes}`);
    }
  }
  for (const exception of profile.exceptions) {
    lines.push(exception.summary);
  }
  if (!profile.auditNoncompliance.supported) {
    lines.push('An audit noncompliance charge. This profile does not model one.');
  }
  lines.push(
    'Whether a carrier will actually bill any of this. SubLedger estimates what an auditor is likely to include; it is not a determination of premium.',
  );
  return lines;
}

export function confidenceCaveats(profile: RulesProfile | null, support: StateSupport): string[] {
  if (!profile || support === 'declared' || support === 'unsupported') return [];

  const lines: string[] = [];
  if (profile.status !== 'verified') {
    lines.push(
      'This rules profile has not been checked line by line against the governing manual by a person, so the treatment applied is SubLedger’s model of the jurisdiction rather than a transcription of it.',
    );
  }
  if (profile.coveragePeriod.paymentDateProxyPermitted) {
    lines.push(
      'Where your ledger has no work dates, the payment date is used to test coverage. That is labelled a proxy everywhere it appears, and it can misstate exposure in either direction when work and payment fall on opposite sides of a certificate’s expiry.',
    );
  }
  if (profile.classification.governingRateProxyPermitted) {
    lines.push(
      'Where a subcontractor’s class code is unknown, your policy’s governing rate stands in. That is disclosed on the figure, and entering the rate an auditor actually applied replaces it.',
    );
  }
  if (profile.payrollBasis.actualPayrollPreferred) {
    lines.push(
      'Where you do not hold the subcontractor’s own payroll records, the amount you paid stands in for payroll.',
    );
  }
  lines.push(
    'Coverage status reflects the certificates you upload. SubLedger reads the document; it does not confirm with any carrier that a policy was in force.',
  );
  return lines;
}

function categoryLabel(category: string): string {
  return category
    .replace(/_/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

export function stateProfile(jurisdiction: string): StateProfileSummary {
  const resolution = resolveRulesProfile({ jurisdiction });
  const profile = resolution.ok ? resolution.profile : null;
  const support = supportOf(profile);

  return {
    jurisdiction,
    name: stateName(jurisdiction),
    slug: stateSlug(jurisdiction),
    path: `/${stateSlug(jurisdiction)}/workers-comp-audit`,
    support,
    producesEstimates: profile !== null && profileProducesEstimates(profile),
    ratingBureau: profile?.ratingBureau ?? null,
    rulesetId: profile?.rulesetId ?? null,
    rulesetVersion: profile?.rulesetVersion ?? null,
    effectiveFrom: profile?.effectiveFrom ?? null,
    citations: profile ? profileCitations(profile) : [],
    canCalculate: profile && support !== 'declared' ? canCalculate(profile) : [],
    willNotCalculate: willNotCalculate(profile, support),
    confidenceCaveats: confidenceCaveats(profile, support),
    isLaunchState: LAUNCH_JURISDICTIONS.includes(jurisdiction),
  };
}

/** The six launch states, in the order the plan prioritises them. */
export function launchStates(): StateProfileSummary[] {
  return LAUNCH_JURISDICTIONS.map(stateProfile);
}

/** Every jurisdiction this build recognises, whether or not it can price it. */
export function recognisedStates(): StateProfileSummary[] {
  const seen = new Set<string>();
  return supportedJurisdictions()
    .map((entry) => entry.jurisdiction)
    .filter((jurisdiction) => {
      if (seen.has(jurisdiction)) return false;
      seen.add(jurisdiction);
      return true;
    })
    .map(stateProfile)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const SUPPORT_LABELS: Readonly<Record<StateSupport, string>> = {
  supported: 'Supported',
  supported_draft: 'Supported — rules profile in review',
  declared: 'Not yet estimating',
  unsupported: 'Not supported',
};
