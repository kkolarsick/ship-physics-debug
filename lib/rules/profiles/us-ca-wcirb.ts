import { declaredProfile, STANDARD_OPEN_QUESTIONS } from './declared';

/**
 * California — Workers' Compensation Insurance Rating Bureau of California.
 *
 * California is an independent-bureau state: its Uniform Statistical Reporting Plan
 * governs, not the NCCI Basic Manual, and the treatment of uninsured subcontract cost and
 * of labor/material separation does not follow from the NCCI profile. Declared so a
 * California policy is recognised; not modelled, so it produces no figure.
 */
export const US_CA_WCIRB = declaredProfile({
  rulesetId: 'us-ca-wcirb',
  rulesetVersion: 'CA_2026.1-unpopulated',
  label: 'California — WCIRB',
  jurisdictions: ['US-CA'],
  ratingBureau: 'WCIRB',
  sourceAuthority: 'rating_bureau_manual',
  effectiveFrom: '2026-01-01',
  sources: [
    {
      authority: 'rating_bureau_manual',
      label: 'WCIRB California Uniform Statistical Reporting Plan',
      reference: 'Standard classification system; payroll and uninsured subcontractors',
      url: 'https://www.wcirb.com/',
      retrievedAt: null,
    },
    {
      authority: 'state_regulator_guidance',
      label: 'California Department of Industrial Relations, Division of Workers’ Compensation',
      reference: 'Coverage obligations and contractor licensing interaction',
      url: 'https://www.dir.ca.gov/dwc/',
      retrievedAt: null,
    },
  ],
  openQuestions: [
    ...STANDARD_OPEN_QUESTIONS,
    'How does California’s dual-wage classification system apply to payroll added for an uninsured subcontractor?',
    'How does contractor licensing status bear on whether a party is treated as a subcontractor or an employee at audit?',
  ],
});
