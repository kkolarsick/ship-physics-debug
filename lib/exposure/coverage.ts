/**
 * Testing spend against the coverage on file.
 *
 * The question an auditor asks is whether the subcontractor carried coverage *while the
 * work was performed*. The payment date is a proxy for that, and often a poor one — a
 * retention released in March for work done the previous August is covered or not by the
 * previous August's certificate, not by March's.
 *
 * So: when a work period is on file, coverage is tested against it. When it is not, the
 * payment date stands in only if the rules profile permits, and the result is labelled a
 * proxy everywhere it appears. It is never presented as equivalent.
 */
import {
  daysBetweenInclusive,
  epochDay,
  isOnOrBetween,
  maxDate,
  minDate,
  type IsoDate,
} from '@/lib/dates';
import { multiplyByFraction, type Cents } from '@/lib/money';
import type { CoveragePeriodRule } from '@/lib/rules/types';
import type { CoverageBasis, CoverageWindow, PaymentAssessment, PaymentInput } from './types';

/**
 * The period a payment should be tested against, and how that period was arrived at.
 *
 * A work period is used whenever both ends are on file and ordered. Anything else falls
 * to the payment date, which the caller may or may not be allowed to use.
 */
export function evaluationPeriod(payment: PaymentInput): {
  from: IsoDate;
  to: IsoDate;
  basis: Exclude<CoverageBasis, 'not_evaluable'>;
} {
  const { workFrom, workTo } = payment;
  if (workFrom !== null && workTo !== null && workFrom <= workTo) {
    return { from: workFrom, to: workTo, basis: 'work_period' };
  }
  return { from: payment.paidOn, to: payment.paidOn, basis: 'payment_date_proxy' };
}

export function assessPayment(
  payment: PaymentInput,
  windows: readonly CoverageWindow[],
  rule: CoveragePeriodRule,
): PaymentAssessment {
  const period = evaluationPeriod(payment);

  // A profile may refuse the proxy. Then the payment simply cannot be tested, and the
  // caller reports the estimate as unavailable rather than guessing from the check date.
  if (period.basis === 'payment_date_proxy' && !rule.paymentDateProxyPermitted) {
    return {
      paymentId: payment.id,
      amount: payment.amount,
      coveredAmount: 0,
      uncoveredAmount: 0,
      basis: 'not_evaluable',
      evaluatedFrom: null,
      evaluatedTo: null,
      coveredDays: 0,
      totalDays: 0,
      certificateIds: [],
      partialOverlap: false,
    };
  }

  const totalDays = daysBetweenInclusive(period.from, period.to);
  const overlaps = windows
    .map((window) => ({
      window,
      from: maxDate(window.from, period.from),
      to: minDate(window.to, period.to),
    }))
    .filter((entry) => entry.from <= entry.to);

  const coveredDays = unionDays(overlaps.map((entry) => [entry.from, entry.to]));
  const certificateIds = [...new Set(overlaps.flatMap((entry) => entry.window.certificateIds))];

  if (coveredDays === 0) {
    return {
      paymentId: payment.id,
      amount: payment.amount,
      coveredAmount: 0,
      uncoveredAmount: payment.amount,
      basis: period.basis,
      evaluatedFrom: period.from,
      evaluatedTo: period.to,
      coveredDays: 0,
      totalDays,
      certificateIds: [],
      partialOverlap: false,
    };
  }

  if (coveredDays >= totalDays) {
    return {
      paymentId: payment.id,
      amount: payment.amount,
      coveredAmount: payment.amount,
      uncoveredAmount: 0,
      basis: period.basis,
      evaluatedFrom: period.from,
      evaluatedTo: period.to,
      coveredDays: totalDays,
      totalDays,
      certificateIds,
      partialOverlap: false,
    };
  }

  // The work period straddles a coverage boundary. Whether that splits the dollars or
  // fails the whole payment is a rules question, not an implementation detail.
  if (rule.partialOverlap === 'prorate_by_covered_days') {
    const coveredAmount = multiplyByFraction(payment.amount, coveredDays, totalDays);
    return {
      paymentId: payment.id,
      amount: payment.amount,
      coveredAmount,
      uncoveredAmount: payment.amount - coveredAmount,
      basis: period.basis,
      evaluatedFrom: period.from,
      evaluatedTo: period.to,
      coveredDays,
      totalDays,
      certificateIds,
      partialOverlap: true,
    };
  }

  return {
    paymentId: payment.id,
    amount: payment.amount,
    coveredAmount: 0,
    uncoveredAmount: payment.amount,
    basis: period.basis,
    evaluatedFrom: period.from,
    evaluatedTo: period.to,
    coveredDays,
    totalDays,
    certificateIds,
    partialOverlap: true,
  };
}

/** Days covered by at least one span, counting each day once. */
function unionDays(spans: readonly (readonly [IsoDate, IsoDate])[]): number {
  if (spans.length === 0) return 0;
  const sorted = [...spans].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  let total = 0;
  let cursorStart = epochDay(sorted[0]![0]);
  let cursorEnd = epochDay(sorted[0]![1]);

  for (const [from, to] of sorted.slice(1)) {
    const start = epochDay(from);
    const end = epochDay(to);
    if (start > cursorEnd + 1) {
      total += cursorEnd - cursorStart + 1;
      cursorStart = start;
      cursorEnd = end;
    } else if (end > cursorEnd) {
      cursorEnd = end;
    }
  }
  return total + (cursorEnd - cursorStart + 1);
}

/** Whether a payment's own dates put it inside the audit period at all. */
export function isInTerm(payment: PaymentInput, termStart: IsoDate, termEnd: IsoDate): boolean {
  return isOnOrBetween(payment.paidOn, termStart, termEnd);
}

/** Material claimed on a payment, pro-rated to the uncovered portion of that payment. */
export function uncoveredMaterialShare(
  assessment: PaymentAssessment,
  materialAmount: Cents,
): Cents {
  if (assessment.amount <= 0 || materialAmount <= 0) return 0;
  const claimable = Math.min(materialAmount, assessment.amount);
  if (assessment.uncoveredAmount >= assessment.amount) return claimable;
  return multiplyByFraction(claimable, assessment.uncoveredAmount, assessment.amount);
}
