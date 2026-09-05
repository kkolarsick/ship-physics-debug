/**
 * Choosing the rate, and being explicit about where it came from.
 *
 * The old engine fell straight through to the policy's governing rate whenever a
 * subcontractor had no class of its own. That is too aggressive for an estimator whose
 * output goes to an auditor: a roofer's payroll rated at a carpentry governing rate is not
 * an estimate of that roofer's exposure, it is a placeholder wearing a dollar sign.
 *
 * Every rate now carries its provenance, the proxy is only used where the rules profile
 * permits it, and where nothing defensible exists the engine reports payroll with no
 * premium rather than inventing one.
 */
import { formatRate, type RateTenThousandths } from '@/lib/money';
import type { ClassificationRule } from '@/lib/rules/types';
import type { PolicyInput, RateSelection, SubcontractorInput } from './types';

export function selectRate(
  sub: SubcontractorInput,
  policy: PolicyInput,
  rule: ClassificationRule,
): RateSelection {
  // A class recorded for the work this subcontractor actually did.
  if (sub.classCodeOverride) {
    return {
      provenance: 'subcontractor_class',
      rate: sub.classCodeOverride.rate,
      classCode: sub.classCodeOverride.classCode,
      statement: `Class ${sub.classCodeOverride.classCode} at ${formatRate(sub.classCodeOverride.rate)} per $100, recorded for this subcontractor's trade.`,
    };
  }

  // What an auditor actually applied last time is the strongest evidence available short
  // of a class on this policy.
  if (sub.priorAuditRate) {
    return {
      provenance: 'prior_audit_rate',
      rate: sub.priorAuditRate.rate,
      classCode: sub.priorAuditRate.classCode,
      statement: `Class ${sub.priorAuditRate.classCode} at ${formatRate(sub.priorAuditRate.rate)} per $100, the rate applied to this subcontractor on a prior audit.`,
    };
  }

  // Some jurisdictions rate uninsured subcontract payroll at the hiring contractor's
  // governing class by rule. That is a derived answer, not a proxy.
  if (rule.basis === 'governing_class') {
    return {
      provenance: 'rules_profile_derived',
      rate: policy.governingRate,
      classCode: policy.governingClassCode,
      statement: `Class ${policy.governingClassCode} at ${formatRate(policy.governingRate)} per $100, the governing class, which this rules profile applies to uninsured subcontract payroll.`,
    };
  }

  if (rule.governingRateProxyPermitted) {
    return {
      provenance: 'governing_rate_proxy',
      rate: policy.governingRate,
      classCode: policy.governingClassCode,
      statement: `No class is recorded for this subcontractor's trade. The governing rate ${formatRate(policy.governingRate)} stands in as a proxy; the real class may rate higher or lower.`,
    };
  }

  return {
    provenance: 'unknown',
    rate: null,
    classCode: null,
    statement:
      'No class is recorded for this subcontractor and this rules profile does not permit the governing rate as a proxy. Payroll is reported; no premium figure is produced.',
  };
}

/** True when the figure rests on a stand-in rather than a class anyone has established. */
export function isProxyRate(provenance: RateSelection['provenance']): boolean {
  return provenance === 'governing_rate_proxy';
}

export function rateOrNull(selection: RateSelection): RateTenThousandths | null {
  return selection.rate;
}
