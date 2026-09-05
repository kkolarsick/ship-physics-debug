import { declaredProfile, STANDARD_OPEN_QUESTIONS } from './declared';

/**
 * Pennsylvania — Pennsylvania Compensation Rating Bureau.
 *
 * An independent-bureau state with its own manual. Declared, not modelled.
 */
export const US_PA_PCRB = declaredProfile({
  rulesetId: 'us-pa-pcrb',
  rulesetVersion: 'PA_2026.1-unpopulated',
  label: 'Pennsylvania — PCRB',
  jurisdictions: ['US-PA'],
  ratingBureau: 'PCRB',
  sourceAuthority: 'rating_bureau_manual',
  effectiveFrom: '2026-01-01',
  sources: [
    {
      authority: 'rating_bureau_manual',
      label: 'Pennsylvania Basic Manual',
      reference: 'Premium basis and payroll allocation; uninsured subcontractors',
      url: 'https://www.pcrb.com/',
      retrievedAt: null,
    },
    {
      authority: 'state_regulator_guidance',
      label: 'Pennsylvania Department of Labor and Industry, Bureau of Workers’ Compensation',
      reference: 'Construction-industry contractor and subcontractor obligations',
      url: 'https://www.dli.pa.gov/',
      retrievedAt: null,
    },
  ],
  openQuestions: [
    ...STANDARD_OPEN_QUESTIONS,
    'How does Pennsylvania’s Construction Workplace Misclassification Act bear on whether a party is a subcontractor or an employee for audit purposes?',
  ],
});
