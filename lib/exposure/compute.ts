import { isOnOrBetween } from '@/lib/dates';
import { applyPct, multiplyByFraction, ratePayroll, sumCents, type Cents } from '@/lib/money';
import { computeFlags } from './flags';
import { RULESET } from './ruleset';
import { windowsFromCertificates } from './windows';
import type {
  CertificateInput,
  CoverageWindow,
  PaymentInput,
  PolicyInput,
  PortfolioExposure,
  SubExposure,
  SubcontractorInput,
  ZeroReason,
} from './types';

/**
 * The exposure engine (brief §6). Pure functions, no I/O, no database, no clock except the
 * one the caller passes in. This is the only place these calculations exist.
 *
 * Coverage is a date-window question, not a boolean. A certificate expiring 04/30 while the
 * sub worked through August covers the spring payments and not the summer ones, and the
 * exposure is the uncovered slice — partial coverage is the common real-world case.
 */
export function computeExposure(
  sub: SubcontractorInput,
  payments: readonly PaymentInput[],
  certificates: readonly CertificateInput[],
  policy: PolicyInput,
): SubExposure {
  const rate = sub.classCodeOverride?.rate ?? policy.governingRate;
  const rateSource = sub.classCodeOverride ? 'class_code_override' : 'governing';
  const classCode = sub.classCodeOverride?.classCode ?? policy.governingClassCode;

  // 1. Establish covered windows from the certificates on file.
  const coverageWindows = windowsFromCertificates(sub.id, certificates);

  // Only payments inside the audit period are auditable payroll for this term.
  const inTerm = payments.filter(
    (payment) =>
      payment.subcontractorId === sub.id &&
      isOnOrBetween(payment.paidOn, policy.termStart, policy.termEnd),
  );

  // 2. Split payments by whether the payment date falls inside a covered window.
  const covered: PaymentInput[] = [];
  const uncovered: PaymentInput[] = [];
  for (const payment of inTerm) {
    if (isCovered(payment, coverageWindows)) covered.push(payment);
    else uncovered.push(payment);
  }

  const paidTotal = sumCents(inTerm.map((p) => p.amount));
  const coveredTotal = sumCents(covered.map((p) => p.amount));
  const uncoveredTotal = sumCents(uncovered.map((p) => p.amount));

  // 3. Material credit — only against uncovered payments, only with an original invoice.
  const materialClaimed = sumCents(
    uncovered
      .filter((p) => isAcceptedEvidence(p.materialEvidence))
      .map((p) => clampToPayment(p.materialAmount ?? 0, p.amount)),
  );
  const materialCap = multiplyByFraction(
    uncoveredTotal,
    RULESET.MATERIAL_CAP_NUMERATOR,
    RULESET.MATERIAL_CAP_DENOMINATOR,
  );
  const materialAllowed = Math.min(materialClaimed, materialCap);

  const addedPayroll = Math.max(0, uncoveredTotal - materialAllowed);

  // 4. Rate it.
  const addedPremium = ratePayroll(addedPayroll, rate, policy.experienceMod);

  // 5. Counterfactuals — what each possible action is worth, in premium dollars removed.
  //    A certificate covering the work dates takes the whole figure to zero. A split
  //    invoice is the fallback: it can only ever reach the capped share of the uncovered
  //    total, so it leaves the rest behind.
  const ifCertificateObtained = addedPremium;
  const residualAfterMaxSplit = ratePayroll(
    multiplyByFraction(
      uncoveredTotal,
      RULESET.MATERIAL_CAP_DENOMINATOR - RULESET.MATERIAL_CAP_NUMERATOR,
      RULESET.MATERIAL_CAP_DENOMINATOR,
    ),
    rate,
    policy.experienceMod,
  );
  const ifSplitInvoiceObtained = Math.max(0, addedPremium - residualAfterMaxSplit);

  const flags = computeFlags({
    sub,
    policy,
    payments: inTerm,
    certificates,
    windows: coverageWindows,
    paidTotal,
    uncoveredTotal,
    materialClaimed,
    materialAllowed,
  });

  const base = {
    subcontractorId: sub.id,
    subcontractorName: sub.name,
    paidTotal,
    coveredTotal,
    uncoveredTotal,
    coveredPaymentIds: covered.map((p) => p.id),
    uncoveredPaymentIds: uncovered.map((p) => p.id),
    coverageWindows,
    materialClaimed,
    materialAllowed,
    rate,
    rateSource,
    classCode,
    experienceMod: policy.experienceMod,
    flags,
    rulesetVersion: RULESET.version,
  } as const;

  // A vendor the contractor triaged as a supplier or as out of scope is not exposure.
  // It stays in the table with its dollars visible — the decision, not a guess, removed it.
  const zeroReason = resolveZeroReason(sub, inTerm.length, uncoveredTotal);
  if (zeroReason !== null) {
    return {
      ...base,
      uncoveredPaymentIds: zeroReason === 'not_a_subcontractor' ? [] : base.uncoveredPaymentIds,
      addedPayroll: 0,
      addedPremium: 0,
      ifCertificateObtained: 0,
      ifSplitInvoiceObtained: 0,
      zeroReason,
    };
  }

  return {
    ...base,
    addedPayroll,
    addedPremium,
    ifCertificateObtained,
    ifSplitInvoiceObtained,
    zeroReason: null,
  };
}

/**
 * Portfolio roll-up (brief §6b, policy level). The non-compliance surcharge is a
 * policy-level percentage the user entered from their own policy; it applies only when
 * at least one sub carries exposure.
 */
export function computePortfolioExposure(
  subs: readonly SubcontractorInput[],
  payments: readonly PaymentInput[],
  certificates: readonly CertificateInput[],
  policy: PolicyInput,
  computedAt: string = new Date().toISOString(),
): PortfolioExposure {
  const paymentsBySub = groupBy(payments, (p) => p.subcontractorId);
  const results = subs.map((sub) =>
    computeExposure(sub, paymentsBySub.get(sub.id) ?? [], certificates, policy),
  );

  const addedPayroll = sumCents(results.map((r) => r.addedPayroll));
  const addedPremiumBeforeSurcharge = sumCents(results.map((r) => r.addedPremium));
  const anySubHasExposure = results.some((r) => r.addedPremium > 0);
  const surcharge = anySubHasExposure
    ? applyPct(policy.estimatedAnnualPremium, policy.noncomplianceSurchargePct)
    : 0;

  const clearedBySplitInvoice = sumCents(results.map((r) => r.ifSplitInvoiceObtained));

  return {
    policyId: policy.id,
    subs: [...results].sort((a, b) => b.addedPremium - a.addedPremium || compareNames(a, b)),
    addedPayroll,
    addedPremiumBeforeSurcharge,
    surcharge,
    totalExposure: addedPremiumBeforeSurcharge + surcharge,
    clearedByCertificateOnly: addedPremiumBeforeSurcharge - clearedBySplitInvoice,
    clearedBySplitInvoice,
    rulesetVersion: RULESET.version,
    computedAt,
  };
}

function resolveZeroReason(
  sub: SubcontractorInput,
  paymentCount: number,
  uncoveredTotal: Cents,
): ZeroReason | null {
  if (sub.triage === 'supplier' || sub.triage === 'not_applicable') return 'not_a_subcontractor';
  if (paymentCount === 0) return 'no_payments';
  if (uncoveredTotal === 0) return 'covered';
  return null;
}

function isCovered(payment: PaymentInput, windows: readonly CoverageWindow[]): boolean {
  return windows.some((window) => isOnOrBetween(payment.paidOn, window.from, window.to));
}

function isAcceptedEvidence(evidence: PaymentInput['materialEvidence']): boolean {
  return (RULESET.MATERIAL_EVIDENCE_ACCEPTED as readonly string[]).includes(evidence);
}

/** A claimed material figure larger than the payment itself is a data error, not a credit. */
function clampToPayment(materialAmount: Cents, paymentAmount: Cents): Cents {
  if (materialAmount <= 0) return 0;
  return Math.min(materialAmount, Math.max(0, paymentAmount));
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
