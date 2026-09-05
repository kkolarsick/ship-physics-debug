import type { RulesProfile } from '../types';
import { US_CA_WCIRB } from './us-ca-wcirb';
import { US_FL_NCCI } from './us-fl-ncci';
import { US_NCCI_BASIC_MANUAL } from './us-ncci-basic-manual';
import { US_NJ_NJCRIB } from './us-nj-njcrib';
import { US_NY_NYCIRB } from './us-ny-nycirb';
import { US_PA_PCRB } from './us-pa-pcrb';
import { US_TX_NCCI } from './us-tx-ncci';

/**
 * Every rules profile this build ships.
 *
 * There is deliberately no entry that matches "any jurisdiction". A policy whose
 * jurisdiction is not in this list resolves to nothing and the engine reports the estimate
 * as unavailable — see `registry.ts`.
 *
 * The six launch states are declared here and are not yet populated: they resolve, so the
 * product can name the authority that governs each and say exactly what is missing, and
 * they produce no dollar figure. Populating one is a data change in its own file.
 */
export const SHIPPED_PROFILES: readonly RulesProfile[] = [
  US_NY_NYCIRB,
  US_NJ_NJCRIB,
  US_PA_PCRB,
  US_FL_NCCI,
  US_CA_WCIRB,
  US_TX_NCCI,
  US_NCCI_BASIC_MANUAL,
];

/** The commercial footprint, in the order the plan prioritises them. */
export const LAUNCH_JURISDICTIONS: readonly string[] = [
  'US-NY',
  'US-NJ',
  'US-PA',
  'US-FL',
  'US-CA',
  'US-TX',
];

export {
  US_NCCI_BASIC_MANUAL,
  US_NY_NYCIRB,
  US_NJ_NJCRIB,
  US_PA_PCRB,
  US_FL_NCCI,
  US_CA_WCIRB,
  US_TX_NCCI,
};
export { declaredProfile, STANDARD_OPEN_QUESTIONS } from './declared';
