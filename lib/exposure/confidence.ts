/**
 * Estimate confidence and provenance (the product's second job).
 *
 * A premium estimate is arithmetic on top of inputs of very different quality. The
 * arithmetic is deterministic; the inputs are not. This module keeps the two apart so a
 * figure can always be read as: these inputs, under these assumptions, on this ruleset,
 * supported by these documents, at this confidence.
 *
 * A factor never adjusts a dollar. It states what is known, and where something was
 * assumed it says so in words that can be printed next to the number.
 */

/**
 * Ordered worst to best. `unavailable` is not a low estimate — it means no estimate was
 * produced at all, and the engine returns no dollar figure in that state.
 */
export type ConfidenceLevel = 'unavailable' | 'low' | 'medium' | 'high' | 'deterministic';

const ORDER: readonly ConfidenceLevel[] = ['unavailable', 'low', 'medium', 'high', 'deterministic'];

export type ConfidenceFactorId =
  | 'rules_profile'
  | 'rules_verification'
  | 'coverage_period_basis'
  | 'rate_provenance'
  | 'certificate_evidence'
  | 'subcontractor_match'
  | 'special_category'
  | 'triage'
  | 'manual_override';

export const CONFIDENCE_FACTOR_LABELS: Readonly<Record<ConfidenceFactorId, string>> = {
  rules_profile: 'Jurisdiction rules',
  rules_verification: 'Rules profile review',
  coverage_period_basis: 'Work period',
  rate_provenance: 'Class code and rate',
  certificate_evidence: 'Certificate reading',
  subcontractor_match: 'Certificate match',
  special_category: 'Subcontractor category',
  triage: 'Vendor triage',
  manual_override: 'Manual overrides',
};

export interface ConfidenceFactor {
  readonly id: ConfidenceFactorId;
  readonly level: ConfidenceLevel;
  /** What is actually known. Stated as fact. */
  readonly statement: string;
  /** The assumption this factor rests on, or null when nothing was assumed. */
  readonly assumption: string | null;
}

export interface EstimateConfidence {
  /** The worst factor. One weak input is enough to make the whole figure uncertain. */
  readonly level: ConfidenceLevel;
  readonly factors: readonly ConfidenceFactor[];
  /** Every non-null assumption, in factor order, for printing beside the figure. */
  readonly assumptions: readonly string[];
}

export function factor(
  id: ConfidenceFactorId,
  level: ConfidenceLevel,
  statement: string,
  assumption: string | null = null,
): ConfidenceFactor {
  return { id, level, statement, assumption };
}

export function worstLevel(levels: readonly ConfidenceLevel[]): ConfidenceLevel {
  if (levels.length === 0) return 'deterministic';
  return levels.reduce((worst, level) =>
    ORDER.indexOf(level) < ORDER.indexOf(worst) ? level : worst,
  );
}

export function buildConfidence(factors: readonly ConfidenceFactor[]): EstimateConfidence {
  return {
    level: worstLevel(factors.map((entry) => entry.level)),
    factors,
    assumptions: factors
      .map((entry) => entry.assumption)
      .filter((assumption): assumption is string => assumption !== null),
  };
}

/** Roll several per-subcontractor confidences into one for the portfolio. */
export function combineConfidence(
  confidences: readonly EstimateConfidence[],
  shared: readonly ConfidenceFactor[] = [],
): EstimateConfidence {
  const byId = new Map<ConfidenceFactorId, ConfidenceFactor>();
  for (const entry of shared) byId.set(entry.id, entry);

  for (const confidence of confidences) {
    for (const entry of confidence.factors) {
      const existing = byId.get(entry.id);
      if (!existing || ORDER.indexOf(entry.level) < ORDER.indexOf(existing.level)) {
        byId.set(entry.id, entry);
      }
    }
  }

  return buildConfidence([...byId.values()]);
}

export const CONFIDENCE_LABELS: Readonly<Record<ConfidenceLevel, string>> = {
  unavailable: 'No estimate',
  low: 'Low confidence',
  medium: 'Medium confidence',
  high: 'High confidence',
  deterministic: 'Deterministic',
};

/** Ordering helper for the UI, so the weakest factor can be shown first. */
export function compareLevels(a: ConfidenceLevel, b: ConfidenceLevel): number {
  return ORDER.indexOf(a) - ORDER.indexOf(b);
}
