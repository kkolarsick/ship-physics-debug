import { declaredProfile, STANDARD_OPEN_QUESTIONS } from './declared';

/**
 * Florida — NCCI with Florida state exceptions.
 *
 * Florida is an NCCI state, but its state exceptions and its construction-industry
 * statutes change enough that the generic NCCI profile must not be applied to it by
 * default. Declared, not modelled.
 */
export const US_FL_NCCI = declaredProfile({
  rulesetId: 'us-fl-ncci',
  rulesetVersion: 'FL_2026.1-unpopulated',
  label: 'Florida — NCCI with Florida exceptions',
  jurisdictions: ['US-FL'],
  ratingBureau: 'NCCI',
  sourceAuthority: 'ncci_manual',
  effectiveFrom: '2026-01-01',
  sources: [
    {
      authority: 'ncci_manual',
      label: 'NCCI Basic Manual — Florida state exceptions',
      reference: 'Rule 2, premium basis; Florida exception pages',
      url: 'https://www.ncci.com/',
      retrievedAt: null,
    },
    {
      authority: 'state_regulation',
      label: 'Florida Statutes Chapter 440, Workers’ Compensation',
      reference: 'Construction-industry contractor liability for subcontractors',
      url: 'https://www.myfloridacfo.com/division/wc/',
      retrievedAt: null,
    },
  ],
  openQuestions: [
    ...STANDARD_OPEN_QUESTIONS,
    'Which Florida state exceptions to the NCCI Basic Manual change the treatment of uninsured subcontract cost?',
    'How do Florida’s construction-industry exemption elections for officers and members bear on the estimate?',
  ],
});
