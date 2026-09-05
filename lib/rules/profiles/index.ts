import type { RulesProfile } from '../types';
import { US_CA_WCIRB } from './us-ca-wcirb';
import { US_NCCI_BASIC_MANUAL } from './us-ncci-basic-manual';

/**
 * Every rules profile this build ships.
 *
 * There is deliberately no entry that matches "any jurisdiction". A policy whose
 * jurisdiction is not in this list resolves to nothing and the engine reports the estimate
 * as unavailable — see `registry.ts`.
 */
export const SHIPPED_PROFILES: readonly RulesProfile[] = [
  US_NCCI_BASIC_MANUAL,
  US_CA_WCIRB,
];

export { US_NCCI_BASIC_MANUAL, US_CA_WCIRB };
