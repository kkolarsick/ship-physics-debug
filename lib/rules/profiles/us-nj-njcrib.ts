import { declaredProfile, STANDARD_OPEN_QUESTIONS } from './declared';

/**
 * New Jersey — New Jersey Compensation Rating and Inspection Bureau.
 *
 * An independent-bureau state with its own manual. Declared, not modelled.
 */
export const US_NJ_NJCRIB = declaredProfile({
  rulesetId: 'us-nj-njcrib',
  rulesetVersion: 'NJ_2026.1-unpopulated',
  label: 'New Jersey — NJCRIB',
  jurisdictions: ['US-NJ'],
  ratingBureau: 'NJCRIB',
  sourceAuthority: 'rating_bureau_manual',
  effectiveFrom: '2026-01-01',
  sources: [
    {
      authority: 'rating_bureau_manual',
      label: 'New Jersey Workers’ Compensation and Employers’ Liability Insurance Manual',
      reference: 'Premium basis; subcontractors',
      url: 'https://www.njcrib.com/',
      retrievedAt: null,
    },
    {
      authority: 'state_regulator_guidance',
      label: 'New Jersey Department of Labor and Workforce Development',
      reference: 'Employer coverage obligations',
      url: 'https://www.nj.gov/labor/',
      retrievedAt: null,
    },
  ],
  openQuestions: [...STANDARD_OPEN_QUESTIONS],
});
