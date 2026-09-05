export { normalizeName, isSameNormalizedName } from './normalize';
export {
  similarity,
  trigrams,
  rankCandidates,
  bandFor,
  AUTO_MATCH_THRESHOLD,
  REVIEW_THRESHOLD,
} from './similarity';
export type { MatchBand, MatchCandidate } from './similarity';
