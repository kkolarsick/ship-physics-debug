/**
 * The confidence gate (brief §4c).
 *
 * A wrong date here produces a wrong dollar figure in a document the contractor may hand
 * to an auditor, so a low-confidence extraction is never silently accepted — it goes to
 * a review queue with the source page rendered beside an editable form.
 */
import type { Extraction } from './schema';

export const CONFIDENCE_FLOOR = 0.85;

export type ReviewReason =
  | 'low_confidence'
  | 'missing_named_insured'
  | 'missing_wc_effective'
  | 'missing_wc_expiration';

export const REVIEW_REASON_LABELS: Readonly<Record<ReviewReason, string>> = {
  low_confidence: 'The model was not confident in this reading',
  missing_named_insured: 'No name was read from the INSURED box',
  missing_wc_effective: 'The workers’ comp section has no effective date',
  missing_wc_expiration: 'The workers’ comp section has no expiration date',
};

export function reviewReasons(extraction: Extraction): ReviewReason[] {
  const reasons: ReviewReason[] = [];
  if (extraction.confidence < CONFIDENCE_FLOOR) reasons.push('low_confidence');

  // Without a named insured the certificate cannot be matched to a vendor at all.
  if (extraction.named_insured === null) reasons.push('missing_named_insured');

  if (extraction.wc_present) {
    if (extraction.wc_effective === null) reasons.push('missing_wc_effective');
    if (extraction.wc_expiration === null) reasons.push('missing_wc_expiration');
  }
  return reasons;
}

export function needsReview(extraction: Extraction): boolean {
  return reviewReasons(extraction).length > 0;
}

/** Confidence is stored as an integer scaled by 1,000, like every other decimal here. */
export function confidenceThousandths(extraction: Extraction): number {
  return Math.round(extraction.confidence * 1000);
}
