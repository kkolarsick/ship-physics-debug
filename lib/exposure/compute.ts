/**
 * The exposure engine.
 *
 * Pure functions, no I/O, no clock except the one the caller passes in, and — the change
 * that matters most — no global ruleset. Treatment comes from a jurisdiction rules profile
 * that the caller resolves, and where no profile can be resolved the engine returns
 * "estimate unavailable" rather than a dollar figure produced under someone else's rules.
 *
 * Three things the old engine got wrong are fixed here and are worth stating plainly:
 * coverage is tested against the period the work was performed rather than the date the
 * check cleared; the rate carries its provenance and an unknown class yields payroll with
 * no premium instead of a proxy dressed up as a fact; and the audit noncompliance charge
 * is computed from audit conditions, never from the presence of uninsured subcontract cost.
 */
import { multiplyByFraction, ratePayroll, sumCents, type Cents } from '@/lib/money';
import {
  profileProducesEstimates,
  resolveRulesProfile,
  RULES_RESOLUTION_MESSAGES,
  type RulesResolution,
} from '@/lib/rules/registry';
import { specialCategoryRule, type Fraction, type RulesProfile } from '@/lib/rules/types';
import {
  buildConfidence,
  combineConfidence,
  factor,
  type ConfidenceFactor,
  type EstimateConfidence,
} from './confidence';
import { assessPayment, isInTerm, uncoveredMaterialShare } from './coverage';
import { computeFlags } from './flags';
import { assessAuditNoncompliance } from './noncompliance';
import { isProxyRate, selectRate } from './rating';
import { windowsFromCertificates } from './windows';
import type {
  AuditNoncomplianceAssessment,
  CertificateInput,
  EstimateUnavailable,
  ExposureProvenance,
  PaymentAssessment,
  PaymentInput,
  PolicyInput,
  PortfolioExposure,
  RateSelection,
  SubExposure,
  SubcontractorInput,
  ZeroReason,
} from './types';

export interface ExposureRequest {
  readonly subs: readonly SubcontractorInput[];
  readonly payments: readonly PaymentInput[];
  readonly certificates: readonly CertificateInput[];
  readonly policy: PolicyInput;
  readonly computedAt?: string;
  /** Override the shipped profile catalogue. Used by tests and by pinned reproductions. */
  readonly catalogue?: readonly RulesProfile[];
}

export function computePortfolioExposure(request: ExposureRequest): PortfolioExposure {
  const computedAt = request.computedAt ?? new Date().toISOString();
  const { policy } = request;

  const resolution: RulesResolution = resolveRulesProfile(
    {
      jurisdiction: policy.jurisdiction,
      ratingBureau: policy.ratingBureau,
      rulesetId: policy.rulesetId,
      rulesetVersion: policy.rulesetVersion,
    },
    request.catalogue,
  );

  if (!resolution.ok) {
    return unavailablePortfolio(request, computedAt, {
      reason: resolution.failure,
      message: resolution.message,
    });
  }

  const profile = resolution.profile;

  if (!profileProducesEstimates(profile)) {
    return unavailablePortfolio(
      request,
      computedAt,
      {
        reason: 'rules_not_populated',
        message: `${profile.label} is recognised, but its treatment of uninsured subcontract cost has not been populated in this build, so no estimate is produced.`,
      },
      profile,
    );
  }

  const paymentsBySub = groupBy(request.payments, (payment) => payment.subcontractorId);
  const results = request.subs.map((sub) =>
    computeExposure(
      sub,
      paymentsBySub.get(sub.id) ?? [],
      request.certificates,
      policy,
      profile,
      computedAt,
    ),
  );

  const rated = results.filter((result) => result.addedPremium !== null);
  const addedPayroll = sumCents(results.map((result) => result.addedPayroll));
  const addedPremiumBeforeSurcharge = sumCents(rated.map((result) => result.addedPremium ?? 0));
  const unrated = results.filter(
    (result) => result.addedPremium === null && result.addedPayroll > 0,
  );
  const proxyRatedPremium = sumCents(
    results
      .filter((result) => isProxyRate(result.rate.provenance))
      .map((result) => result.addedPremium ?? 0),
  );

  const auditNoncompliance = assessAuditNoncompliance(policy, profile.auditNoncompliance);
  const clearedBySplitInvoice = sumCents(rated.map((result) => result.ifSplitInvoiceObtained ?? 0));

  const provenance = portfolioProvenance(request, profile, computedAt);

  return {
    policyId: policy.id,
    status: 'estimated',
    unavailable: null,
    subs: [...results].sort(
      (a, b) => (b.addedPremium ?? 0) - (a.addedPremium ?? 0) || compareNames(a, b),
    ),
    addedPayroll,
    addedPremiumBeforeSurcharge,
    unratedPayroll: sumCents(unrated.map((result) => result.addedPayroll)),
    unratedSubcontractorCount: unrated.length,
    proxyRatedPremium,
    auditNoncompliance,
    totalExposure: addedPremiumBeforeSurcharge + auditNoncompliance.charge,
    clearedByCertificateOnly: addedPremiumBeforeSurcharge - clearedBySplitInvoice,
    clearedBySplitInvoice,
    // Only the subcontractors whose inputs actually bear on a dollar count toward the
    // portfolio's confidence. A vendor triaged out as a material supplier contributes
    // nothing to the figure, so the quality of its class code and work dates should not
    // drag the whole estimate down.
    confidence: combineConfidence(
      results
        .filter((result) => contributesToFigures(result))
        .map((result) => result.confidence),
      sharedFactors(profile),
    ),
    provenance,
    rulesProfile: profile,
  };
}

export function computeExposure(
  sub: SubcontractorInput,
  payments: readonly PaymentInput[],
  certificates: readonly CertificateInput[],
  policy: PolicyInput,
  profile: RulesProfile,
  computedAt: string = new Date().toISOString(),
): SubExposure {
  const coverageWindows = windowsFromCertificates(sub.id, certificates);

  const inTerm = payments.filter(
    (payment) =>
      payment.subcontractorId === sub.id && isInTerm(payment, policy.termStart, policy.termEnd),
  );

  const assessments: PaymentAssessment[] = inTerm.map((payment) =>
    assessPayment(payment, coverageWindows, profile.coveragePeriod),
  );

  const paidTotal = sumCents(inTerm.map((payment) => payment.amount));
  const rate = selectRate(sub, policy, profile.classification);
  const provenance = subProvenance(profile, policy, coverageWindows, assessments, computedAt);

  // A profile that refuses the payment-date proxy cannot price a ledger row with no work
  // dates. That is a missing input, not a zero.
  const unevaluable = assessments.filter((entry) => entry.basis === 'not_evaluable');
  if (unevaluable.length > 0) {
    return unavailableSub(sub, paidTotal, assessments, coverageWindows, rate, policy, provenance, {
      reason: 'work_period_required',
      message: `${profile.label} does not permit the payment date to stand in for the work period, and ${unevaluable.length} of ${assessments.length} payments have no work dates on file.`,
    });
  }

  const coveredTotal = sumCents(assessments.map((entry) => entry.coveredAmount));
  const uncoveredTotal = sumCents(assessments.map((entry) => entry.uncoveredAmount));
  const usedPaymentDateProxy = assessments.some((entry) => entry.basis === 'payment_date_proxy');

  const specialRule = sub.specialCategory
    ? specialCategoryRule(profile, sub.specialCategory)
    : null;

  const payrollBasis = derivePayroll({
    profile,
    specialRule,
    assessments,
    payments: inTerm,
    paidTotal,
    uncoveredTotal,
  });

  const addedPremium =
    rate.rate === null ? null : ratePayroll(payrollBasis.addedPayroll, rate.rate, policy.experienceMod);

  const counterfactuals = deriveCounterfactuals({
    profile,
    specialRule,
    uncoveredTotal,
    paidTotal,
    addedPremium,
    rate,
    policy,
    deemedShare: payrollBasis.deemedLaborShareApplied,
  });

  const flags = computeFlags({
    sub,
    policy,
    profile,
    payments: inTerm,
    assessments,
    certificates,
    windows: coverageWindows,
    rate,
    specialRule,
    paidTotal,
    uncoveredTotal,
    materialClaimed: payrollBasis.materialClaimed,
    materialAllowed: payrollBasis.materialAllowed,
  });

  const confidence = subConfidence({
    sub,
    profile,
    certificates: certificates.filter((cert) => cert.subcontractorId === sub.id),
    assessments,
    rate,
    specialRuleTreatment: specialRule?.treatment ?? null,
    payments: inTerm,
  });

  const base = {
    subcontractorId: sub.id,
    subcontractorName: sub.name,
    status: 'estimated' as const,
    unavailable: null,
    paidTotal,
    coveredTotal,
    uncoveredTotal,
    assessments,
    coverageWindows,
    usedPaymentDateProxy,
    materialClaimed: payrollBasis.materialClaimed,
    materialAllowed: payrollBasis.materialAllowed,
    deemedLaborShareApplied: payrollBasis.deemedLaborShareApplied,
    rate,
    experienceMod: policy.experienceMod,
    flags,
    confidence,
    provenance,
  };

  const zeroReason = resolveZeroReason(sub, inTerm.length, uncoveredTotal, specialRule?.treatment);
  if (zeroReason !== null) {
    return {
      ...base,
      addedPayroll: 0,
      addedPremium: rate.rate === null ? null : 0,
      ifCertificateObtained: rate.rate === null ? null : 0,
      ifSplitInvoiceObtained: rate.rate === null ? null : 0,
      zeroReason,
    };
  }

  return {
    ...base,
    addedPayroll: payrollBasis.addedPayroll,
    addedPremium,
    ifCertificateObtained: counterfactuals.ifCertificateObtained,
    ifSplitInvoiceObtained: counterfactuals.ifSplitInvoiceObtained,
    zeroReason: null,
  };
}

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

interface PayrollBasis {
  readonly addedPayroll: Cents;
  readonly materialClaimed: Cents;
  readonly materialAllowed: Cents;
  readonly deemedLaborShareApplied: Fraction | null;
}

function derivePayroll(input: {
  profile: RulesProfile;
  specialRule: ReturnType<typeof specialCategoryRule>;
  assessments: readonly PaymentAssessment[];
  payments: readonly PaymentInput[];
  paidTotal: Cents;
  uncoveredTotal: Cents;
}): PayrollBasis {
  const { profile, specialRule, uncoveredTotal } = input;

  if (specialRule?.treatment === 'excluded_from_payroll') {
    return { addedPayroll: 0, materialClaimed: 0, materialAllowed: 0, deemedLaborShareApplied: null };
  }

  // A deemed share replaces the labor/material question rather than stacking with it.
  const deemed =
    specialRule?.treatment === 'deemed_labor_share_included'
      ? specialRule.deemedLaborShare
      : profile.uninsuredSubcontractor.treatment === 'labor_share_included'
        ? profile.uninsuredSubcontractor.deemedLaborShare
        : null;

  if (deemed) {
    return {
      addedPayroll: multiplyByFraction(uncoveredTotal, deemed.numerator, deemed.denominator),
      materialClaimed: 0,
      materialAllowed: 0,
      deemedLaborShareApplied: deemed,
    };
  }

  const materialClaimed = claimedMaterial(input.assessments, input.payments, profile);
  const materialAllowed = allowedMaterial(materialClaimed, input, profile);

  return {
    addedPayroll: Math.max(0, uncoveredTotal - materialAllowed),
    materialClaimed,
    materialAllowed,
    deemedLaborShareApplied: null,
  };
}

function claimedMaterial(
  assessments: readonly PaymentAssessment[],
  payments: readonly PaymentInput[],
  profile: RulesProfile,
): Cents {
  if (!profile.laborMaterial.separationPermitted) return 0;
  const byId = new Map(payments.map((payment) => [payment.id, payment]));

  return sumCents(
    assessments.map((assessment) => {
      const payment = byId.get(assessment.paymentId);
      if (!payment) return 0;
      if (!profile.laborMaterial.acceptedEvidence.includes(payment.materialEvidence)) return 0;
      return uncoveredMaterialShare(assessment, payment.materialAmount ?? 0);
    }),
  );
}

function allowedMaterial(
  claimed: Cents,
  input: { paidTotal: Cents; uncoveredTotal: Cents },
  profile: RulesProfile,
): Cents {
  if (!profile.laborMaterial.separationPermitted) return 0;
  return Math.min(claimed, materialCap(input, profile));
}

function materialCap(
  input: { paidTotal: Cents; uncoveredTotal: Cents },
  profile: RulesProfile,
): Cents {
  const { cap } = profile.laborMaterial;
  switch (cap.kind) {
    case 'none':
      return input.uncoveredTotal;
    case 'share_of_uncovered':
      return multiplyByFraction(
        input.uncoveredTotal,
        cap.share.numerator,
        cap.share.denominator,
      );
    case 'share_of_total_paid':
      return Math.min(
        input.uncoveredTotal,
        multiplyByFraction(input.paidTotal, cap.share.numerator, cap.share.denominator),
      );
  }
}

// ---------------------------------------------------------------------------
// Counterfactuals
// ---------------------------------------------------------------------------

function deriveCounterfactuals(input: {
  profile: RulesProfile;
  specialRule: ReturnType<typeof specialCategoryRule>;
  uncoveredTotal: Cents;
  paidTotal: Cents;
  addedPremium: Cents | null;
  rate: RateSelection;
  policy: PolicyInput;
  deemedShare: Fraction | null;
}): { ifCertificateObtained: Cents | null; ifSplitInvoiceObtained: Cents | null } {
  const { addedPremium, rate, policy } = input;
  if (addedPremium === null || rate.rate === null) {
    return { ifCertificateObtained: null, ifSplitInvoiceObtained: null };
  }

  // A certificate covering the work dates takes the whole figure to zero, whatever the
  // profile's material treatment.
  const ifCertificateObtained = addedPremium;

  // A split invoice is worth nothing where the profile does not permit separation, or
  // where a deemed share already replaced that question.
  if (!input.profile.laborMaterial.separationPermitted || input.deemedShare !== null) {
    return { ifCertificateObtained, ifSplitInvoiceObtained: 0 };
  }

  const maxDeduction = materialCap(input, input.profile);
  const residualPayroll = Math.max(0, input.uncoveredTotal - maxDeduction);
  const residualPremium = ratePayroll(residualPayroll, rate.rate, policy.experienceMod);

  return {
    ifCertificateObtained,
    ifSplitInvoiceObtained: Math.max(0, addedPremium - residualPremium),
  };
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

function sharedFactors(profile: RulesProfile): ConfidenceFactor[] {
  return [
    factor(
      'rules_profile',
      'deterministic',
      `${profile.label} (${profile.rulesetId} ${profile.rulesetVersion}) governs this estimate.`,
    ),
    profile.status === 'verified'
      ? factor(
          'rules_verification',
          'deterministic',
          `This rules profile was checked against the governing manual by ${profile.verifiedBy ?? 'a reviewer'} on ${profile.verifiedAt ?? 'an unrecorded date'}.`,
        )
      : factor(
          'rules_verification',
          'medium',
          'This rules profile has not been checked against the governing manual by a person.',
          'The treatment applied is this product’s model of the jurisdiction, not a transcription of the bureau’s manual.',
        ),
  ];
}

function subConfidence(input: {
  sub: SubcontractorInput;
  profile: RulesProfile;
  certificates: readonly CertificateInput[];
  assessments: readonly PaymentAssessment[];
  rate: RateSelection;
  specialRuleTreatment: string | null;
  payments: readonly PaymentInput[];
}): EstimateConfidence {
  const factors: ConfidenceFactor[] = [...sharedFactors(input.profile)];

  const proxied = input.assessments.filter((entry) => entry.basis === 'payment_date_proxy');
  const straddling = input.assessments.filter((entry) => entry.partialOverlap);
  if (input.assessments.length === 0) {
    factors.push(factor('coverage_period_basis', 'deterministic', 'No payments in the term.'));
  } else if (proxied.length === 0 && straddling.length === 0) {
    factors.push(
      factor(
        'coverage_period_basis',
        'deterministic',
        'Coverage was tested against the period the work was performed, for every payment.',
      ),
    );
  } else if (proxied.length > 0) {
    factors.push(
      factor(
        'coverage_period_basis',
        'medium',
        `${proxied.length} of ${input.assessments.length} payments have no work dates, so the payment date was used to test coverage.`,
        'Work performed inside a covered period but paid outside it — or the reverse — is assessed by the payment date, which can misstate the exposure in either direction.',
      ),
    );
  } else {
    factors.push(
      factor(
        'coverage_period_basis',
        'medium',
        `${straddling.length} work ${straddling.length === 1 ? 'period straddles' : 'periods straddle'} a coverage boundary.`,
        `Straddling periods are resolved by this rules profile's ${input.profile.coveragePeriod.partialOverlap.replace(/_/g, ' ')} rule.`,
      ),
    );
  }

  switch (input.rate.provenance) {
    case 'subcontractor_class':
    case 'prior_audit_rate':
      factors.push(factor('rate_provenance', 'deterministic', input.rate.statement));
      break;
    case 'rules_profile_derived':
      factors.push(factor('rate_provenance', 'high', input.rate.statement));
      break;
    case 'governing_rate_proxy':
      factors.push(
        factor(
          'rate_provenance',
          'low',
          input.rate.statement,
          'The premium figure rests on the governing rate standing in for a class nobody has established for this subcontractor.',
        ),
      );
      break;
    case 'unknown':
      factors.push(
        factor(
          'rate_provenance',
          'low',
          input.rate.statement,
          'Payroll is reported without a premium figure because no defensible rate exists.',
        ),
      );
      break;
  }

  if (input.certificates.length === 0) {
    factors.push(
      factor(
        'certificate_evidence',
        'deterministic',
        'No certificate is on file for this subcontractor. That absence is a fact, not a reading.',
      ),
    );
  } else if (input.certificates.every((cert) => cert.evidence !== 'model_extracted')) {
    factors.push(
      factor(
        'certificate_evidence',
        'deterministic',
        'Every certificate behind this figure was entered or confirmed by a person.',
      ),
    );
  } else {
    factors.push(
      factor(
        'certificate_evidence',
        'medium',
        'Coverage dates came from an automated reading of the certificate that nobody has confirmed.',
        'A misread effective or expiration date moves the dollars.',
      ),
    );
  }

  const autoMatched = input.certificates.filter((cert) => cert.matchMethod === 'auto_trigram');
  factors.push(
    autoMatched.length === 0
      ? factor(
          'subcontractor_match',
          'deterministic',
          'Certificates on file were matched to this vendor by a person or by a confirmed alias.',
        )
      : factor(
          'subcontractor_match',
          'medium',
          `${autoMatched.length} certificate${autoMatched.length === 1 ? '' : 's'} matched to this vendor by name similarity alone.`,
          'If the match is wrong, coverage is being credited to the wrong company.',
        ),
  );

  factors.push(
    input.specialRuleTreatment === 'requires_review'
      ? factor(
          'special_category',
          'low',
          'This subcontractor is in a category this rules profile does not settle.',
          'The figure prices it under the default uninsured-subcontractor treatment, which is the conservative reading.',
        )
      : factor(
          'special_category',
          'deterministic',
          input.specialRuleTreatment === null
            ? 'No special category is recorded for this subcontractor.'
            : `This rules profile settles the recorded category (${input.specialRuleTreatment.replace(/_/g, ' ')}).`,
        ),
  );

  factors.push(
    input.sub.triage === 'undecided'
      ? factor(
          'triage',
          'low',
          'This vendor has no triage decision, so it is priced as subcontracted labor.',
          'If it is a material supplier, this figure should not exist at all.',
        )
      : factor('triage', 'deterministic', `Triaged as ${input.sub.triage.replace(/_/g, ' ')}.`),
  );

  const overrides = describeOverrides(input.sub, input.payments);
  factors.push(
    overrides.length === 0
      ? factor('manual_override', 'deterministic', 'No figure on this subcontractor was overridden by hand.')
      : factor(
          'manual_override',
          'high',
          `Entered by hand: ${overrides.join('; ')}.`,
          'Hand-entered figures are the user’s assertion; nothing in this product verifies them against a document.',
        ),
  );

  return buildConfidence(factors);
}

/**
 * Only assertions that move a dollar away from what the documents say count here.
 *
 * A recorded class code or category is an input, and its quality is already reported by
 * the rate-provenance and special-category factors. A labor/material split or a
 * prior-audit rate is different: it is the user telling the engine what a document they
 * hold says, and nothing in this product has read that document.
 */
function describeOverrides(
  sub: SubcontractorInput,
  payments: readonly PaymentInput[],
): string[] {
  const overrides: string[] = [];
  if (sub.priorAuditRate) overrides.push(`prior-audit rate for class ${sub.priorAuditRate.classCode}`);
  const splits = payments.filter((payment) => payment.materialEvidence !== 'none').length;
  if (splits > 0) overrides.push(`${splits} labor/material split${splits === 1 ? '' : 's'}`);
  return overrides;
}

// ---------------------------------------------------------------------------
// Unavailable results
// ---------------------------------------------------------------------------

function unavailablePortfolio(
  request: ExposureRequest,
  computedAt: string,
  unavailable: EstimateUnavailable,
  profile?: RulesProfile,
): PortfolioExposure {
  const paymentsBySub = groupBy(request.payments, (payment) => payment.subcontractorId);

  const subs = request.subs.map((sub) => {
    const inTerm = (paymentsBySub.get(sub.id) ?? []).filter((payment) =>
      isInTerm(payment, request.policy.termStart, request.policy.termEnd),
    );
    return unavailableSub(
      sub,
      sumCents(inTerm.map((payment) => payment.amount)),
      [],
      [],
      {
        provenance: 'unknown',
        rate: null,
        classCode: null,
        statement: 'No estimate was produced, so no rate was selected.',
      },
      request.policy,
      {
        jurisdiction: request.policy.jurisdiction,
        ratingBureau: request.policy.ratingBureau,
        rulesetId: profile?.rulesetId ?? request.policy.rulesetId ?? 'unresolved',
        rulesetVersion: profile?.rulesetVersion ?? request.policy.rulesetVersion ?? 'unresolved',
        rulesProfileStatus: profile?.status ?? 'draft',
        computedAt,
        certificateIds: [],
        paymentIds: inTerm.map((payment) => payment.id),
      },
      unavailable,
    );
  });

  const confidence = buildConfidence([
    factor('rules_profile', 'unavailable', unavailable.message),
  ]);

  return {
    policyId: request.policy.id,
    status: 'unavailable',
    unavailable,
    subs: [...subs].sort((a, b) => b.paidTotal - a.paidTotal || compareNames(a, b)),
    addedPayroll: 0,
    addedPremiumBeforeSurcharge: 0,
    unratedPayroll: 0,
    unratedSubcontractorCount: 0,
    proxyRatedPremium: 0,
    auditNoncompliance: {
      applies: false,
      charge: 0,
      triggersPresent: [],
      basis: 'not_modeled',
      statement: 'No rules profile is in effect, so no audit noncompliance charge is modeled.',
    },
    totalExposure: 0,
    clearedByCertificateOnly: 0,
    clearedBySplitInvoice: 0,
    confidence,
    provenance: {
      jurisdiction: request.policy.jurisdiction,
      ratingBureau: request.policy.ratingBureau,
      rulesetId: profile?.rulesetId ?? request.policy.rulesetId ?? 'unresolved',
      rulesetVersion: profile?.rulesetVersion ?? request.policy.rulesetVersion ?? 'unresolved',
      rulesProfileStatus: profile?.status ?? 'draft',
      computedAt,
      certificateIds: [],
      paymentIds: request.payments.map((payment) => payment.id),
    },
    rulesProfile: profile ?? null,
  };
}

function unavailableSub(
  sub: SubcontractorInput,
  paidTotal: Cents,
  assessments: readonly PaymentAssessment[],
  coverageWindows: SubExposure['coverageWindows'],
  rate: RateSelection,
  policy: PolicyInput,
  provenance: ExposureProvenance,
  unavailable: EstimateUnavailable,
): SubExposure {
  return {
    subcontractorId: sub.id,
    subcontractorName: sub.name,
    status: 'unavailable',
    unavailable,
    paidTotal,
    coveredTotal: 0,
    uncoveredTotal: 0,
    assessments,
    coverageWindows,
    usedPaymentDateProxy: false,
    materialClaimed: 0,
    materialAllowed: 0,
    deemedLaborShareApplied: null,
    addedPayroll: 0,
    addedPremium: null,
    ifCertificateObtained: null,
    ifSplitInvoiceObtained: null,
    rate,
    experienceMod: policy.experienceMod,
    flags: [],
    zeroReason: null,
    confidence: buildConfidence([factor('rules_profile', 'unavailable', unavailable.message)]),
    provenance,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveZeroReason(
  sub: SubcontractorInput,
  paymentCount: number,
  uncoveredTotal: Cents,
  specialTreatment: string | undefined,
): ZeroReason | null {
  if (sub.triage === 'supplier' || sub.triage === 'not_applicable') return 'not_a_subcontractor';
  if (paymentCount === 0) return 'no_payments';
  if (specialTreatment === 'excluded_from_payroll') return 'special_category_excluded';
  if (uncoveredTotal === 0) return 'covered';
  return null;
}

function subProvenance(
  profile: RulesProfile,
  policy: PolicyInput,
  windows: SubExposure['coverageWindows'],
  assessments: readonly PaymentAssessment[],
  computedAt: string,
): ExposureProvenance {
  return {
    jurisdiction: policy.jurisdiction,
    ratingBureau: policy.ratingBureau,
    rulesetId: profile.rulesetId,
    rulesetVersion: profile.rulesetVersion,
    rulesProfileStatus: profile.status,
    computedAt,
    certificateIds: [...new Set(windows.flatMap((window) => window.certificateIds))],
    paymentIds: assessments.map((entry) => entry.paymentId),
  };
}

function portfolioProvenance(
  request: ExposureRequest,
  profile: RulesProfile,
  computedAt: string,
): ExposureProvenance {
  return {
    jurisdiction: request.policy.jurisdiction,
    ratingBureau: request.policy.ratingBureau,
    rulesetId: profile.rulesetId,
    rulesetVersion: profile.rulesetVersion,
    rulesProfileStatus: profile.status,
    computedAt,
    certificateIds: request.certificates.map((certificate) => certificate.id),
    paymentIds: request.payments.map((payment) => payment.id),
  };
}

/**
 * Whether this subcontractor's inputs bear on any figure in the portfolio.
 *
 * A sub priced at zero because a person triaged it out, or because the profile excludes
 * its category, or because it had no payments in the term, has no bearing on the total.
 * One priced at zero because its certificates cover the work very much does — a misread
 * date there would change the number.
 */
function contributesToFigures(result: SubExposure): boolean {
  if (result.status === 'unavailable') return true;
  return (
    result.zeroReason !== 'not_a_subcontractor' &&
    result.zeroReason !== 'special_category_excluded' &&
    result.zeroReason !== 'no_payments'
  );
}

function compareNames(a: SubExposure, b: SubExposure): number {
  return a.subcontractorName.localeCompare(b.subcontractorName);
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export { RULES_RESOLUTION_MESSAGES };
