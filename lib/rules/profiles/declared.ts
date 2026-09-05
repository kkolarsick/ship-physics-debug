import type { RulesProfile, SourceCitation, SourceAuthority } from '../types';

/**
 * A jurisdiction the product recognises but does not yet price.
 *
 * Declaring a state is not the same as supporting it. A declared profile resolves — so the
 * product knows the jurisdiction exists, can name the authority that governs it, and can
 * tell the user exactly what is missing — but every rule family is `not_modeled`, so the
 * engine returns "estimate unavailable" rather than borrowing another jurisdiction's
 * treatment.
 *
 * Populating one is a data change in that state's file: replace the rule families with
 * values, attach the citation for each, work through `openQuestions`, then set `status`
 * to `verified` with who checked it and when. Nothing in the core engine changes, and the
 * public state page and the supported-states list follow automatically because they read
 * from the registry rather than from hand-written copy.
 */
export function declaredProfile(input: {
  rulesetId: string;
  rulesetVersion: string;
  label: string;
  jurisdictions: readonly string[];
  ratingBureau: string;
  sourceAuthority: SourceAuthority;
  effectiveFrom: string;
  sources: readonly SourceCitation[];
  openQuestions: readonly string[];
}): RulesProfile {
  const noCitations: readonly SourceCitation[] = [];
  const unpopulated = 'Not yet transcribed from the governing manual.';

  return {
    rulesetId: input.rulesetId,
    rulesetVersion: input.rulesetVersion,
    label: input.label,
    jurisdictions: input.jurisdictions,
    ratingBureau: input.ratingBureau,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: null,
    status: 'draft',
    verifiedBy: null,
    verifiedAt: null,
    sourceAuthority: input.sourceAuthority,
    sources: input.sources,

    // `not_modeled` is what makes the engine fail closed for this jurisdiction. Every
    // other family below is inert while that is true; they are present so the shape of
    // the work is visible, not so the profile looks complete.
    uninsuredSubcontractor: {
      treatment: 'not_modeled',
      deemedLaborShare: null,
      citations: noCitations,
      notes: unpopulated,
    },
    payrollBasis: {
      actualPayrollPreferred: false,
      acceptedPayrollEvidence: [],
      subcontractPriceFallback: 'not_permitted',
      deemedLaborShare: null,
      citations: noCitations,
      notes: unpopulated,
    },
    laborMaterial: {
      separationPermitted: false,
      acceptedEvidence: [],
      cap: { kind: 'none' },
      citations: noCitations,
      notes: unpopulated,
    },
    classification: {
      basis: 'subcontractor_trade_class',
      governingRateProxyPermitted: false,
      citations: noCitations,
      notes: unpopulated,
    },
    experienceMod: {
      appliesToAddedPayroll: false,
      citations: noCitations,
      notes: unpopulated,
    },
    specialCategories: [],
    coveragePeriod: {
      paymentDateProxyPermitted: false,
      partialOverlap: 'treat_as_uncovered',
      citations: noCitations,
      notes: unpopulated,
    },
    auditNoncompliance: {
      supported: false,
      triggers: [],
      charge: { kind: 'not_modeled' },
      citations: noCitations,
      notes: unpopulated,
    },

    unsupportedConditions: [],
    exceptions: [],
    openQuestions: input.openQuestions,

    largeUntriagedVendorThreshold: 1_000_000,
    statements: [
      `${input.label} is recognised, and ${input.ratingBureau} is the authority whose rules govern it. Its treatment of uninsured subcontract cost has not been transcribed into this build, so no premium estimate is produced for it.`,
    ],
  };
}

/** The questions every state profile has to answer before it can price anything. */
export const STANDARD_OPEN_QUESTIONS: readonly string[] = [
  'How is the cost of an uninsured subcontractor treated: is the full subcontract price payroll, or a deemed share of it?',
  'Where the hiring contractor can produce the subcontractor’s own payroll records, do those displace the subcontract price, and which records count?',
  'Is a labor/material separation permitted, what evidence supports one, and what is it capped at?',
  'What share of a labor-only contract is payroll, if the treatment differs?',
  'How is equipment hired with an operator treated, and at what share?',
  'How is piecework treated?',
  'How are sole proprietors, owners, officers, and partners with no employees treated?',
  'How is an independent contractor distinguished from a subcontractor for audit purposes?',
  'Is added payroll rated at the subcontractor’s trade class or at the governing class?',
  'May the governing rate stand in when the subcontractor’s class is unknown?',
  'Does the experience modification factor apply to premium on this added payroll?',
  'Is coverage tested against the period the work was performed, and is a payment date ever an acceptable stand-in?',
  'What conditions can trigger an audit noncompliance charge, and how is it computed?',
];
