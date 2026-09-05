/**
 * Compliance posture (brief §1), as code.
 *
 * The operator is not a licensed insurance producer. This application stays on the
 * side of the line where it states facts and does arithmetic — it never transacts or
 * advises on insurance. Two things live here: the disclaimer that must appear on the
 * dashboard and on every export, and the vocabulary rules that `npm run lint:copy`
 * enforces across the UI so the line cannot be crossed by accident in a hurry.
 */

export const DISCLAIMER =
  'Estimate based on documents and figures you provided. Not a determination of premium, ' +
  'not insurance advice, and not a substitute for your carrier’s audit. Coverage status ' +
  'reflects certificates on file and has not been confirmed with any insurer.';

/**
 * Coverage status is always stated against the document on file, never as a coverage
 * judgment and never as a verification. These are the phrasings the UI uses.
 */
export const COVERAGE_LANGUAGE = {
  covered: 'Will be excluded from auditable payroll',
  uncovered: 'Will be included in auditable payroll',
  partial: 'Partly included in auditable payroll',
  basis: 'Based on the certificate on file. Not confirmed with any insurer.',
} as const;

export const EXPORT_FOOTER = (rulesetVersion: string, generatedAt: string): string =>
  `${DISCLAIMER}\nRuleset ${rulesetVersion} · Generated ${generatedAt}`;

/**
 * Phrases that must not appear in user-facing copy.
 *
 * Each rule pairs a pattern with the reason it is forbidden and the phrasing to use
 * instead, so the failure message teaches rather than just blocking. `allowContext`
 * lets a line through when it is explicitly quoting the rule itself — the disclaimer
 * says "not insurance advice", and that must remain sayable.
 */
export interface CopyRule {
  readonly id: string;
  readonly pattern: RegExp;
  readonly reason: string;
  readonly instead: string;
}

export const FORBIDDEN_COPY: readonly CopyRule[] = [
  {
    id: 'coverage-judgment',
    pattern: /\b(coverage|certificate|policy|sub(contractor)?)\s+is\s+(adequate|sufficient|compliant|insufficient|inadequate|non-?compliant)\b/i,
    reason: 'Calling coverage adequate, sufficient, or compliant is a coverage judgment.',
    instead: 'State the audit consequence: "will be included in auditable payroll".',
  },
  {
    id: 'compliant-status',
    pattern: /\b(is|are|marked|status:?)\s+(fully\s+)?(compliant|non-?compliant|in\s+compliance)\b/i,
    reason: 'Compliance status is a coverage judgment, not a fact about a document.',
    instead: 'Use "certificate on file" / "no certificate on file" and the payroll consequence.',
  },
  {
    id: 'verified-coverage',
    pattern: /\b(coverage|policy|certificate|insurance)\s+(is\s+)?(verified|confirmed|validated)\b/i,
    reason: 'The app reads a certificate; it does not confirm with the carrier that a policy is in force.',
    instead: 'Say "based on the certificate on file" and label the status as document-derived.',
  },
  {
    id: 'recommend-coverage',
    pattern: /\b(we\s+)?(recommend|suggest|advise)\b[^.\n]{0,60}\b(coverage|limits?|endorsements?|carriers?|policy|insurer)\b/i,
    reason: 'Recommending coverage, limits, endorsements, or carriers is producer activity.',
    instead: 'Generate a question for the user to ask their agent, carrier, or auditor.',
  },
  {
    id: 'should-carry',
    pattern: /\byou\s+should\s+(carry|require|obtain|purchase|buy|add)\b[^.\n]{0,60}\b(coverage|insurance|limits?|endorsements?)\b/i,
    reason: 'Telling the insured what coverage to carry or require is insurance advice.',
    instead: 'State the audit consequence and let the contractor decide.',
  },
  {
    id: 'determination',
    pattern: /\b(your|the)\s+(premium\s+)?(audit\s+)?(determination|final\s+premium)\s+(is|will\s+be)\b/i,
    reason: 'Output is an estimate of what an auditor is likely to include, not a determination.',
    instead: 'Say "estimated additional premium" and keep the disclaimer nearby.',
  },
  {
    id: 'guarantee',
    pattern: /\b(guarantee[sd]?|guaranteed|will\s+definitely)\b[^.\n]{0,40}\b(premium|savings?|refund|credit)\b/i,
    reason: 'No figure here is guaranteed; the carrier’s audit decides.',
    instead: 'Say "estimated" and show the assumptions.',
  },
];

/** Lines that quote the rules themselves, or the disclaimer, are exempt. */
export const COPY_LINT_EXEMPT = /\bcopy-lint-ok\b/;

export interface CopyViolation {
  readonly ruleId: string;
  readonly line: number;
  readonly text: string;
  readonly reason: string;
  readonly instead: string;
}

/** Run the copy rules over a file's contents. Used by the lint script and its tests. */
export function findCopyViolations(source: string): CopyViolation[] {
  const violations: CopyViolation[] = [];
  const lines = source.split('\n');
  lines.forEach((text, index) => {
    if (COPY_LINT_EXEMPT.test(text)) return;
    for (const rule of FORBIDDEN_COPY) {
      if (rule.pattern.test(text)) {
        violations.push({
          ruleId: rule.id,
          line: index + 1,
          text: text.trim(),
          reason: rule.reason,
          instead: rule.instead,
        });
      }
    }
  });
  return violations;
}
