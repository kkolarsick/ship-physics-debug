import { declaredProfile, STANDARD_OPEN_QUESTIONS } from './declared';

/**
 * Texas — NCCI as designated statistical agent, with Texas exceptions.
 *
 * Texas is materially different from the rest of the launch set: workers' compensation
 * coverage is not compulsory for most private employers, so the question of what an
 * uninsured subcontractor costs at audit sits on a different statutory footing.
 * Declared, not modelled.
 */
export const US_TX_NCCI = declaredProfile({
  rulesetId: 'us-tx-ncci',
  rulesetVersion: 'TX_2026.1-unpopulated',
  label: 'Texas — NCCI with Texas exceptions',
  jurisdictions: ['US-TX'],
  ratingBureau: 'NCCI',
  sourceAuthority: 'ncci_manual',
  effectiveFrom: '2026-01-01',
  sources: [
    {
      authority: 'ncci_manual',
      label: 'NCCI Basic Manual — Texas state exceptions',
      reference: 'Rule 2, premium basis; Texas exception pages',
      url: 'https://www.ncci.com/',
      retrievedAt: null,
    },
    {
      authority: 'state_regulator_guidance',
      label: 'Texas Department of Insurance, Division of Workers’ Compensation',
      reference: 'Coverage, non-subscription, and contractor obligations',
      url: 'https://www.tdi.texas.gov/wc/',
      retrievedAt: null,
    },
  ],
  openQuestions: [
    ...STANDARD_OPEN_QUESTIONS,
    'Because coverage is not compulsory for most Texas employers, on what basis is an uninsured subcontractor’s cost added to the hiring contractor’s auditable payroll at all?',
    'How do written agreements to provide coverage, and Texas non-subscriber status, change the treatment?',
  ],
});
