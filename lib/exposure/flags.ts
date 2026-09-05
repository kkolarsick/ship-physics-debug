import { compareDates, formatUsDate } from '@/lib/dates';
import { formatDollars } from '@/lib/money';
import type { RulesProfile, SpecialCategoryRule } from '@/lib/rules/types';
import type {
  CertificateInput,
  CoverageWindow,
  FlagDetail,
  PaymentAssessment,
  PaymentInput,
  PolicyInput,
  RateSelection,
  SubcontractorInput,
} from './types';

/**
 * Flags are annotations — "worth a question to your auditor" — and never move a dollar.
 * Nothing in here returns a number that feeds the premium calculation; the figures a flag
 * carries are there so the UI can show the same arithmetic the engine already did.
 *
 * Several flags now describe the *quality of the inputs* rather than the documents: which
 * assumptions the figure rests on, and what would have to be true for it to be exact.
 */
export function computeFlags(input: {
  readonly sub: SubcontractorInput;
  readonly policy: PolicyInput;
  readonly profile: RulesProfile;
  readonly payments: readonly PaymentInput[];
  readonly assessments: readonly PaymentAssessment[];
  readonly certificates: readonly CertificateInput[];
  readonly windows: readonly CoverageWindow[];
  readonly rate: RateSelection;
  readonly specialRule: SpecialCategoryRule | null;
  readonly paidTotal: number;
  readonly uncoveredTotal: number;
  readonly materialClaimed: number;
  readonly materialAllowed: number;
}): FlagDetail[] {
  const { sub, policy, profile, payments, certificates, windows, assessments } = input;
  const flags: FlagDetail[] = [];
  const own = certificates.filter((c) => c.subcontractorId === sub.id);

  // An unverified rules profile is a fact about the whole estimate, not about any one
  // subcontractor. It is carried by the rules_verification confidence factor and stated
  // once at the top of the dashboard and on the export's methodology page — repeating it
  // on every row would drown the flags that are actually per-subcontractor.

  // --- Input quality -------------------------------------------------------

  const proxied = assessments.filter((entry) => entry.basis === 'payment_date_proxy');
  if (proxied.length > 0) {
    flags.push({
      flag: 'PAYMENT_DATE_PROXY_USED',
      detail: `${proxied.length} of ${assessments.length} payments have no work dates on file, so the payment date was used to test coverage. Work performed before a certificate lapsed but paid after it — or the reverse — will be assessed wrongly. Adding work dates removes the assumption.`,
      figures: { proxied: proxied.reduce((total, entry) => total + entry.amount, 0) },
    });
  }

  const straddling = assessments.filter((entry) => entry.partialOverlap);
  if (straddling.length > 0) {
    flags.push({
      flag: 'PARTIAL_WORK_PERIOD_COVERAGE',
      detail:
        profile.coveragePeriod.partialOverlap === 'prorate_by_covered_days'
          ? `${straddling.length} work ${straddling.length === 1 ? 'period straddles' : 'periods straddle'} a coverage boundary. This rules profile splits the amount across covered and uncovered days.`
          : `${straddling.length} work ${straddling.length === 1 ? 'period straddles' : 'periods straddle'} a coverage boundary. This rules profile treats a period that is not fully covered as uncovered in full.`,
      figures: { affected: straddling.reduce((total, entry) => total + entry.amount, 0) },
    });
  }

  if (input.rate.provenance === 'governing_rate_proxy') {
    flags.push({
      flag: 'GOVERNING_RATE_PROXY_USED',
      detail: `No class code is recorded for this subcontractor's trade, so the policy's governing rate stands in. The class an auditor applies may rate materially higher or lower. If a prior audit rated this subcontractor, entering that rate replaces the proxy.`,
    });
  }

  if (input.rate.provenance === 'unknown') {
    flags.push({
      flag: 'NO_RATE_AVAILABLE',
      detail:
        'No defensible rate exists for this subcontractor and this rules profile does not permit a governing-rate proxy. The payroll figure stands; no premium figure is produced.',
    });
  }

  if (own.length > 0 && own.every((c) => c.evidence === 'model_extracted')) {
    flags.push({
      flag: 'CERTIFICATE_NOT_REVIEWED',
      detail:
        'The coverage dates behind this figure came from an automated reading of the certificate and have not been confirmed by a person. A misread date moves the dollars.',
    });
  }

  if (own.some((c) => c.matchMethod === 'auto_trigram')) {
    flags.push({
      flag: 'MATCH_NOT_REVIEWED',
      detail:
        'A certificate was matched to this vendor by name similarity rather than by a person. If the match is wrong, coverage is being credited to the wrong company.',
    });
  }

  // --- Documents and categories -------------------------------------------

  if (sub.entityType === 'sole_proprietor') {
    flags.push({
      flag: 'SOLE_PROPRIETOR_NO_EMPLOYEES',
      detail:
        'Recorded as a sole proprietor. A sole proprietor with no employees is often not required to carry coverage on themselves, and treatment at audit varies. Worth confirming with your auditor.',
    });
  }

  if (input.specialRule?.treatment === 'requires_review') {
    flags.push({
      flag: 'SPECIAL_CATEGORY_REQUIRES_REVIEW',
      detail: `This subcontractor is recorded as ${input.specialRule.category.replace(/_/g, ' ')}, which this rules profile does not settle: ${input.specialRule.notes} The figure below prices it under the default uninsured-subcontractor treatment, which is the conservative reading.`,
    });
  }

  if (input.specialRule?.treatment === 'deemed_labor_share_included' && input.specialRule.deemedLaborShare) {
    const { numerator, denominator } = input.specialRule.deemedLaborShare;
    flags.push({
      flag: 'DEEMED_LABOR_SHARE_APPLIED',
      detail: `This rules profile deems ${numerator}/${denominator} of the uncovered amount to be payroll for this kind of arrangement, in place of a labor/material split. ${input.specialRule.notes}`,
    });
  }

  if (own.some((c) => c.wcPresent && c.wcOfficerExclusionNoted)) {
    flags.push({
      flag: 'OFFICER_EXCLUSION_NOTED',
      detail:
        'A certificate on file shows workers’ comp but notes an owner, officer, member, or partner exclusion. The policy may not extend to the person who did the work.',
    });
  }

  if (own.length > 0 && own.every((c) => !c.wcPresent)) {
    flags.push({
      flag: 'GL_ONLY_CERTIFICATE',
      detail:
        'A certificate is on file, but its workers’ compensation section is empty. General liability on a certificate does not evidence workers’ comp for audit purposes.',
    });
  }

  const lastWorked = payments.reduce<string | null>((latest, payment) => {
    const end = payment.workTo ?? payment.paidOn;
    return latest === null || compareDates(end, latest) > 0 ? end : latest;
  }, null);

  for (const window of windows) {
    const endsBeforeTerm = compareDates(window.to, policy.termEnd) < 0;
    const stillActive = lastWorked !== null && compareDates(lastWorked, window.to) > 0;
    if (endsBeforeTerm && stillActive) {
      flags.push({
        flag: 'CERT_EXPIRES_MID_TERM',
        detail: `A covered window ends ${formatUsDate(window.to)}, before the policy term ends ${formatUsDate(policy.termEnd)}, and work or payments continue through ${formatUsDate(lastWorked)}.`,
      });
      break;
    }
  }

  if (input.materialClaimed > input.materialAllowed) {
    flags.push({
      flag: 'MATERIAL_CAP_BINDING',
      detail: `Claimed material of ${formatDollars(input.materialClaimed)} exceeds what ${profile.label} allows, so ${formatDollars(input.materialAllowed)} is the deduction this profile permits.`,
      figures: {
        claimed: input.materialClaimed,
        allowed: input.materialAllowed,
        disallowed: input.materialClaimed - input.materialAllowed,
      },
    });
  }

  if (
    sub.triage === 'undecided' &&
    own.length === 0 &&
    input.paidTotal >= profile.largeUntriagedVendorThreshold
  ) {
    flags.push({
      flag: 'LARGE_UNMATCHED_VENDOR',
      detail: `${formatDollars(input.paidTotal)} paid, no certificate on file, and no triage decision recorded. Until this vendor is triaged it is priced as a subcontractor.`,
      figures: { paid: input.paidTotal },
    });
  }

  return flags;
}
