import { compareDates, formatUsDate } from '@/lib/dates';
import { formatDollars } from '@/lib/money';
import { RULESET } from './ruleset';
import type {
  CertificateInput,
  CoverageWindow,
  FlagDetail,
  PaymentInput,
  PolicyInput,
  SubcontractorInput,
} from './types';

/**
 * Flags are annotations — "worth a question to your auditor" — and never move a dollar.
 * Nothing in here returns a number that feeds the premium calculation; the figures a flag
 * carries are there so the UI can show the same arithmetic the engine already did.
 */
export function computeFlags(input: {
  readonly sub: SubcontractorInput;
  readonly policy: PolicyInput;
  readonly payments: readonly PaymentInput[];
  readonly certificates: readonly CertificateInput[];
  readonly windows: readonly CoverageWindow[];
  readonly paidTotal: number;
  readonly uncoveredTotal: number;
  readonly materialClaimed: number;
  readonly materialAllowed: number;
}): FlagDetail[] {
  const { sub, policy, payments, certificates, windows } = input;
  const flags: FlagDetail[] = [];
  const own = certificates.filter((c) => c.subcontractorId === sub.id);

  if (sub.entityType === 'sole_proprietor') {
    flags.push({
      flag: 'SOLE_PROPRIETOR_NO_EMPLOYEES',
      detail:
        'Recorded as a sole proprietor. A sole proprietor with no employees is often not required to carry coverage on themselves, and treatment at audit varies. Worth confirming with your auditor.',
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

  const lastPayment = payments.reduce<string | null>(
    (latest, payment) => (latest === null || compareDates(payment.paidOn, latest) > 0 ? payment.paidOn : latest),
    null,
  );
  for (const window of windows) {
    const endsBeforeTerm = compareDates(window.to, policy.termEnd) < 0;
    const stillActive = lastPayment !== null && compareDates(lastPayment, window.to) > 0;
    if (endsBeforeTerm && stillActive) {
      flags.push({
        flag: 'CERT_EXPIRES_MID_TERM',
        detail: `A covered window ends ${formatUsDate(window.to)}, before the policy term ends ${formatUsDate(policy.termEnd)}, and payments continue through ${formatUsDate(lastPayment)}.`,
      });
      break;
    }
  }

  if (input.materialClaimed > input.materialAllowed) {
    flags.push({
      flag: 'MATERIAL_CAP_BINDING',
      detail: `Claimed material of ${formatDollars(input.materialClaimed)} exceeds the ${describeCap()} cap, so ${formatDollars(input.materialAllowed)} is the deduction this model allows.`,
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
    input.paidTotal >= RULESET.LARGE_UNMATCHED_VENDOR_CENTS
  ) {
    flags.push({
      flag: 'LARGE_UNMATCHED_VENDOR',
      detail: `${formatDollars(input.paidTotal)} paid, no certificate on file, and no triage decision recorded. Until this vendor is triaged it is priced as a subcontractor.`,
      figures: { paid: input.paidTotal },
    });
  }

  return flags;
}

function describeCap(): string {
  const pct = (RULESET.MATERIAL_CAP_NUMERATOR / RULESET.MATERIAL_CAP_DENOMINATOR) * 100;
  return `${pct}% of the total paid`;
}
