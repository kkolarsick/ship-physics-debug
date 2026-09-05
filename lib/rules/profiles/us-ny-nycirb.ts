import { declaredProfile, STANDARD_OPEN_QUESTIONS } from './declared';

/**
 * New York — New York Compensation Insurance Rating Board.
 *
 * New York is an independent-bureau state. Its manual governs, not NCCI's, and the
 * treatment of uninsured subcontract cost does not follow from the NCCI profile. Declared
 * so the product recognises the jurisdiction; not modelled, so it produces no figure.
 */
export const US_NY_NYCIRB = declaredProfile({
  rulesetId: 'us-ny-nycirb',
  rulesetVersion: 'NY_2026.1-unpopulated',
  label: 'New York — NYCIRB',
  jurisdictions: ['US-NY'],
  ratingBureau: 'NYCIRB',
  sourceAuthority: 'rating_bureau_manual',
  effectiveFrom: '2026-01-01',
  sources: [
    {
      authority: 'rating_bureau_manual',
      label: 'New York Workers’ Compensation and Employers’ Liability Manual',
      reference: 'Premium basis and payroll allocation; uninsured subcontractors',
      url: 'https://www.nycirb.org/',
      retrievedAt: null,
    },
    {
      authority: 'state_regulator_guidance',
      label: 'New York State Workers’ Compensation Board',
      reference: 'Coverage requirements and independent-contractor tests',
      url: 'https://www.wcb.ny.gov/',
      retrievedAt: null,
    },
  ],
  openQuestions: [
    ...STANDARD_OPEN_QUESTIONS,
    'How does New York’s construction-employment classification and payroll-limitation programme interact with payroll added for an uninsured subcontractor?',
  ],
});
