/**
 * Trigram similarity, implemented to match Postgres `pg_trgm.similarity()`.
 *
 * The database does the matching at query time with a GIST index; this is the same
 * function in TypeScript so the thresholds in §5 can be unit tested, and so a preview in
 * the review queue ranks candidates the same way the query did.
 *
 * pg_trgm splits on non-alphanumerics, pads each word with two leading and one trailing
 * space, takes the distinct trigrams, and returns |A ∩ B| / |A ∪ B|.
 */

export const AUTO_MATCH_THRESHOLD = 0.85;
export const REVIEW_THRESHOLD = 0.55;

export function trigrams(input: string): Set<string> {
  const result = new Set<string>();
  const words = input.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const word of words) {
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i += 1) {
      result.add(padded.slice(i, i + 3));
    }
  }
  return result;
}

export function similarity(a: string, b: string): number {
  const left = trigrams(a);
  const right = trigrams(b);
  if (left.size === 0 && right.size === 0) return 0;

  let intersection = 0;
  for (const gram of left) {
    if (right.has(gram)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export type MatchBand = 'auto' | 'review' | 'unmatched';

export function bandFor(score: number): MatchBand {
  if (score >= AUTO_MATCH_THRESHOLD) return 'auto';
  if (score >= REVIEW_THRESHOLD) return 'review';
  return 'unmatched';
}

export interface MatchCandidate {
  readonly subcontractorId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly score: number;
  readonly band: MatchBand;
}

/**
 * Rank subcontractors against a certificate's named insured.
 *
 * A confirmed alias is an exact answer, not a score: once a human has paired
 * "KOWALCZYK FRAMING" with "Kowalczyk Framing & Carpentry LLC", the pairing is never
 * asked again.
 */
export function rankCandidates(
  normalizedTarget: string,
  subs: readonly { id: string; name: string; normalizedName: string }[],
  aliases: readonly { subcontractorId: string; normalizedAlias: string }[] = [],
): MatchCandidate[] {
  const alias = aliases.find((entry) => entry.normalizedAlias === normalizedTarget);
  if (alias) {
    const sub = subs.find((candidate) => candidate.id === alias.subcontractorId);
    if (sub) {
      return [
        {
          subcontractorId: sub.id,
          name: sub.name,
          normalizedName: sub.normalizedName,
          score: 1,
          band: 'auto',
        },
      ];
    }
  }

  return subs
    .map((sub) => {
      const score = similarity(normalizedTarget, sub.normalizedName);
      return {
        subcontractorId: sub.id,
        name: sub.name,
        normalizedName: sub.normalizedName,
        score,
        band: bandFor(score),
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
