import type { RulesProfile } from '../types';

/**
 * California — WCIRB.
 *
 * California is an independent-bureau state: its Uniform Statistical Reporting Plan
 * governs, not the NCCI Basic Manual, and the treatment of uninsured subcontract cost and
 * of labor/material separation does not follow from the NCCI profile.
 *
 * Those rules have not been transcribed here. Rather than let a California policy quietly
 * pick up NCCI treatment and produce a dollar figure, this profile declares the
 * jurisdiction and models nothing: `uninsuredSubcontractor.treatment` is `not_modeled`, so
 * the engine returns "estimate unavailable — rules not configured" for any policy that
 * selects it. Populating it is a data change in this file.
 */
export const US_CA_WCIRB: RulesProfile = {
  rulesetId: 'us-ca-wcirb',
  rulesetVersion: '2026.1.0-unpopulated',
  label: 'California — WCIRB (declared, rules not yet populated)',
  ratingBureau: 'WCIRB',
  jurisdictions: ['US-CA'],
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  status: 'draft',
  verifiedBy: null,
  verifiedAt: null,
  sources: [
    {
      label: 'WCIRB California Uniform Statistical Reporting Plan',
      reference: 'Part 3 — Standard Classification System; uninsured subcontractor treatment',
    },
  ],

  uninsuredSubcontractor: {
    treatment: 'not_modeled',
    deemedLaborShare: null,
    notes:
      'Not transcribed from the WCIRB plan. The engine declines to produce a figure for California rather than borrowing another jurisdiction’s treatment.',
  },

  laborMaterial: {
    separationPermitted: false,
    acceptedEvidence: [],
    cap: { kind: 'none' },
    notes: 'Not transcribed from the WCIRB plan.',
  },

  classification: {
    basis: 'subcontractor_trade_class',
    governingRateProxyPermitted: false,
    notes: 'Not transcribed from the WCIRB plan.',
  },

  specialCategories: [],

  coveragePeriod: {
    paymentDateProxyPermitted: false,
    partialOverlap: 'treat_as_uncovered',
    notes: 'Not transcribed from the WCIRB plan.',
  },

  auditNoncompliance: {
    supported: false,
    triggers: [],
    charge: { kind: 'not_modeled' },
    notes: 'Not transcribed from the WCIRB plan.',
  },

  largeUntriagedVendorThreshold: 1_000_000,

  statements: [
    'This jurisdiction is recognised but its rules have not been populated in this product. No premium estimate is produced for it.',
  ],
};
