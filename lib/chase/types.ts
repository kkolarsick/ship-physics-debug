import type { Cents } from '@/lib/money';

export type ChaseAsk = 'certificate' | 'split_invoice' | 'agent_direct' | 'entity_clarification';

export type ChaseStatus = 'open' | 'sent' | 'responded' | 'resolved' | 'dead';

export interface ChaseItem {
  readonly id: string;
  readonly policyId: string;
  readonly subcontractorId: string;
  readonly subcontractorName: string;
  readonly ask: ChaseAsk;
  readonly exposureAtOpen: Cents;
  readonly status: ChaseStatus;
  readonly sentTo: string | null;
  readonly sentAt: string | null;
  readonly respondedAt: string | null;
  readonly resolvedAt: string | null;
  readonly resolutionNote: string | null;
  readonly exposureRemoved: Cents | null;
  readonly rulesetVersion: string;
}

export const OPEN_STATUSES: readonly ChaseStatus[] = ['open', 'sent', 'responded'];
