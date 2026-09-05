/**
 * The audit noncompliance charge.
 *
 * This used to fire whenever any subcontractor carried exposure, which conflated two
 * unrelated things. An audit noncompliance charge is about the *audit*: an endorsement on
 * the policy plus records not furnished, or an audit not permitted. A subcontractor with
 * no certificate on file does not trigger it, and a contractor who cooperates fully with
 * their audit does not owe it no matter how much uninsured subcontract cost they have.
 *
 * So the charge is computed here from its own inputs, under the rules profile, and never
 * from the exposure figure.
 */
import { applyPct, multiplyByFraction, type Cents } from '@/lib/money';
import type { AuditNoncomplianceRule, NoncomplianceTrigger } from '@/lib/rules/types';
import type { AuditComplianceInput, AuditNoncomplianceAssessment, PolicyInput } from './types';

export const TRIGGER_LABELS: Readonly<Record<NoncomplianceTrigger, string>> = {
  endorsement_on_policy: 'The policy carries an audit noncompliance endorsement',
  records_not_furnished: 'Records the auditor requested were not furnished',
  audit_not_permitted: 'The audit was not permitted to take place',
  estimated_audit_issued: 'An estimated audit has already been issued for this term',
};

/** Which of the profile's recognised triggers the user's own answers actually assert. */
export function activeTriggers(
  compliance: AuditComplianceInput,
  rule: AuditNoncomplianceRule,
): NoncomplianceTrigger[] {
  const asserted: NoncomplianceTrigger[] = [];
  if (compliance.endorsementOnPolicy) asserted.push('endorsement_on_policy');
  if (!compliance.recordsFurnished) asserted.push('records_not_furnished');
  if (!compliance.auditPermitted) asserted.push('audit_not_permitted');
  if (compliance.estimatedAuditIssued) asserted.push('estimated_audit_issued');
  return asserted.filter((trigger) => rule.triggers.includes(trigger));
}

export function assessAuditNoncompliance(
  policy: PolicyInput,
  rule: AuditNoncomplianceRule,
): AuditNoncomplianceAssessment {
  const compliance = policy.auditCompliance;

  if (!rule.supported || rule.charge.kind === 'not_modeled') {
    return {
      applies: false,
      charge: 0,
      triggersPresent: [],
      basis: 'not_modeled',
      statement:
        'This rules profile does not model an audit noncompliance charge, so none is included.',
    };
  }

  const triggers = activeTriggers(compliance, rule);

  // The endorsement alone is a precondition, not a charge. Something about the audit
  // itself has to have gone wrong.
  const endorsementPresent = triggers.includes('endorsement_on_policy');
  const failures = triggers.filter((trigger) => trigger !== 'endorsement_on_policy');

  if (failures.length === 0) {
    return {
      applies: false,
      charge: 0,
      triggersPresent: triggers.map((trigger) => TRIGGER_LABELS[trigger]),
      basis: rule.charge.kind,
      statement: endorsementPresent
        ? 'The policy carries the endorsement, but records were furnished and the audit was permitted, so no charge is modeled. Uninsured subcontract exposure does not trigger it.'
        : 'No audit noncompliance condition is recorded, so no charge is modeled. Uninsured subcontract exposure does not trigger one.',
    };
  }

  if (rule.charge.kind !== 'carrier_configured_percentage' && !endorsementPresent) {
    return {
      applies: false,
      charge: 0,
      triggersPresent: triggers.map((trigger) => TRIGGER_LABELS[trigger]),
      basis: rule.charge.kind,
      statement:
        'An audit condition is recorded, but the policy is not marked as carrying the endorsement that would allow a charge, so none is modeled.',
    };
  }

  const charge = chargeFor(rule, policy, compliance);
  if (charge === 0) {
    return {
      applies: false,
      charge: 0,
      triggersPresent: triggers.map((trigger) => TRIGGER_LABELS[trigger]),
      basis: rule.charge.kind,
      statement:
        'An audit condition is recorded, but the charge this profile models works out to zero — check the percentage on your own policy.',
    };
  }

  return {
    applies: true,
    charge,
    triggersPresent: triggers.map((trigger) => TRIGGER_LABELS[trigger]),
    basis: rule.charge.kind,
    statement: describeCharge(rule, charge),
  };
}

function chargeFor(
  rule: AuditNoncomplianceRule,
  policy: PolicyInput,
  compliance: AuditComplianceInput,
): Cents {
  switch (rule.charge.kind) {
    case 'carrier_configured_percentage':
      return applyPct(policy.estimatedAnnualPremium, compliance.carrierConfiguredPct);
    case 'percentage_of_premium':
      return applyPct(policy.estimatedAnnualPremium, rule.charge.pct);
    case 'multiple_of_estimated_premium': {
      const { numerator, denominator } = rule.charge.multiple;
      // The charge is the amount *added*, so a 2× rule adds one further premium.
      const additionalNumerator = numerator - denominator;
      if (additionalNumerator <= 0) return 0;
      return multiplyByFraction(policy.estimatedAnnualPremium, additionalNumerator, denominator);
    }
    case 'not_modeled':
      return 0;
  }
}

function describeCharge(rule: AuditNoncomplianceRule, charge: Cents): string {
  switch (rule.charge.kind) {
    case 'carrier_configured_percentage':
      return 'Modeled from the audit noncompliance percentage you entered from your own policy, applied to the estimated annual premium.';
    case 'percentage_of_premium':
      return 'Modeled at the percentage of estimated annual premium this rules profile specifies.';
    case 'multiple_of_estimated_premium':
      return `Modeled as the additional premium a multiple-of-premium noncompliance rule would add (${charge / 100 > 0 ? 'applied' : 'not applied'}).`;
    case 'not_modeled':
      return 'Not modeled.';
  }
}
