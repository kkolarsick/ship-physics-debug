/**
 * Outbound correspondence templates (brief §7).
 *
 * Generating a document request to a subcontractor or their agent is on the allowed side
 * of §1 — it asks for a document and states dates. None of these letters says anything
 * about what coverage the recipient ought to carry, and none of them asserts that
 * anything has been confirmed with an insurer. Every draft is editable and nothing sends
 * without the user reviewing it.
 */
import { formatUsDate, type IsoDate } from '@/lib/dates';
import type { ChaseAsk } from './types';

export interface ChaseTemplateContext {
  readonly orgName: string;
  readonly senderName: string;
  readonly senderEmail: string;
  readonly subcontractorName: string;
  readonly workDates: { readonly from: IsoDate; readonly to: IsoDate };
  readonly policyTermEnd: IsoDate;
  readonly producerName?: string | null;
  readonly lastCertificateExpiration?: IsoDate | null;
}

export interface ChaseDraft {
  readonly subject: string;
  readonly body: string;
}

export const CHASE_ASK_LABELS: Readonly<Record<ChaseAsk, string>> = {
  certificate: 'Request a certificate from the sub',
  agent_direct: 'Request it from the sub’s agent',
  split_invoice: 'Request a labor/material invoice',
  entity_clarification: 'Ask how the business is set up',
};

export const CHASE_ASK_DESCRIPTIONS: Readonly<Record<ChaseAsk, string>> = {
  certificate:
    'Ask the subcontractor for a certificate showing workers’ compensation across the dates you paid them.',
  agent_direct:
    'Ask the agent who issued their last certificate. Often faster than chasing the sub.',
  split_invoice:
    'Ask for the original invoice separating labor from materials. This is the fallback when the sub is gone or cannot produce a certificate.',
  entity_clarification:
    'Ask whether the business is a sole proprietor with no employees, so you can put the question to your auditor with an answer in hand.',
};

export function draftChaseEmail(ask: ChaseAsk, context: ChaseTemplateContext): ChaseDraft {
  switch (ask) {
    case 'certificate':
      return certificateRequest(context);
    case 'agent_direct':
      return agentRequest(context);
    case 'split_invoice':
      return splitInvoiceRequest(context);
    case 'entity_clarification':
      return entityRequest(context);
  }
}

function certificateRequest(context: ChaseTemplateContext): ChaseDraft {
  const window = `${formatUsDate(context.workDates.from)} through ${formatUsDate(context.workDates.to)}`;
  const gap = context.lastCertificateExpiration
    ? `The most recent certificate we have on file for you shows workers’ compensation through ${formatUsDate(context.lastCertificateExpiration)}, which does not reach the end of that period.`
    : 'We do not have a certificate on file showing workers’ compensation for that period.';

  return {
    subject: `Certificate of insurance request — work performed ${window}`,
    body: `${context.subcontractorName},

We are assembling records for our workers’ compensation premium audit and need a certificate of insurance for the work you performed for ${context.orgName}.

${gap}

Please send a certificate of insurance showing your workers’ compensation coverage covering ${window}. Your agent can usually issue one the same day. If it is easier, reply with your agent's name and email and we will request it directly.

Without a certificate covering those dates, the amounts we paid you are likely to be included in our auditable payroll, which costs us real money at audit. We would rather have the document.

Thank you,
${context.senderName}
${context.orgName}
${context.senderEmail}`,
  };
}

function agentRequest(context: ChaseTemplateContext): ChaseDraft {
  const window = `${formatUsDate(context.workDates.from)} through ${formatUsDate(context.workDates.to)}`;
  const greeting = context.producerName ? `${context.producerName},` : 'Hello,';

  return {
    subject: `Certificate request for ${context.subcontractorName} — ${window}`,
    body: `${greeting}

We are ${context.orgName}. ${context.subcontractorName} performed work for us and we are assembling records for our workers’ compensation premium audit.

You are listed as the producer on the most recent certificate we hold for them. Could you issue a certificate of insurance showing their workers’ compensation coverage covering ${window}, with ${context.orgName} as certificate holder?

If their coverage for that period was written elsewhere, please let us know who to contact instead.

Thank you,
${context.senderName}
${context.orgName}
${context.senderEmail}`,
  };
}

function splitInvoiceRequest(context: ChaseTemplateContext): ChaseDraft {
  const window = `${formatUsDate(context.workDates.from)} through ${formatUsDate(context.workDates.to)}`;

  return {
    subject: `Invoice copy request — labor and materials, ${window}`,
    body: `${context.subcontractorName},

We are assembling records for our workers’ compensation premium audit covering ${window}.

Could you send copies of your original invoices for that work, showing labor and materials as separate line items? Auditors will only accept the original invoice — a summary or a letter after the fact does not carry the same weight.

If you are also able to send a certificate of insurance showing workers’ compensation for those dates, that resolves it entirely and we would not need the invoices.

Thank you,
${context.senderName}
${context.orgName}
${context.senderEmail}`,
  };
}

function entityRequest(context: ChaseTemplateContext): ChaseDraft {
  return {
    subject: `Quick question about your business structure`,
    body: `${context.subcontractorName},

We are assembling records for our workers’ compensation premium audit and have one question about your business.

Are you a sole proprietor with no employees, or do you have employees or partners working with you? Our auditor asks this, and treatment differs depending on the answer.

If you do carry workers’ compensation, a certificate showing coverage for ${formatUsDate(context.workDates.from)} through ${formatUsDate(context.workDates.to)} answers the question completely and we will not need anything else.

Thank you,
${context.senderName}
${context.orgName}
${context.senderEmail}`,
  };
}
