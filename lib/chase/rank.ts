/**
 * Which chase items exist, and in what order they are worked (brief §7).
 *
 * Ranking is by premium removed per phone call, not by invoice size: a $58K sub with no
 * certificate outranks a $143K sub whose certificate is merely late, because the first
 * call is worth more than the second.
 */
import type { SubExposure } from '@/lib/exposure/types';
import type { Cents } from '@/lib/money';
import { OPEN_STATUSES, type ChaseAsk, type ChaseItem } from './types';

export interface ProposedChaseItem {
  readonly subcontractorId: string;
  readonly subcontractorName: string;
  readonly ask: ChaseAsk;
  /** Premium dollars this specific ask removes if it lands. */
  readonly worth: Cents;
  readonly exposureAtOpen: Cents;
  readonly rationale: string;
}

export interface ProposeOptions {
  /** Producer contact extracted from a prior certificate, if any. */
  readonly producerEmailBySub?: Readonly<Record<string, string | null>>;
}

/**
 * Propose the asks worth making for a sub that carries exposure. A certificate always
 * leads because it takes the figure to zero; the others are the fallbacks and the
 * questions, each carrying what it is actually worth.
 */
export function proposeChaseItems(
  exposures: readonly SubExposure[],
  options: ProposeOptions = {},
): ProposedChaseItem[] {
  const proposals: ProposedChaseItem[] = [];

  for (const exposure of exposures) {
    if (exposure.addedPremium <= 0) continue;

    proposals.push({
      subcontractorId: exposure.subcontractorId,
      subcontractorName: exposure.subcontractorName,
      ask: 'certificate',
      worth: exposure.ifCertificateObtained,
      exposureAtOpen: exposure.addedPremium,
      rationale: 'A certificate covering the payment dates removes the whole figure.',
    });

    const producerEmail = options.producerEmailBySub?.[exposure.subcontractorId] ?? null;
    if (producerEmail) {
      proposals.push({
        subcontractorId: exposure.subcontractorId,
        subcontractorName: exposure.subcontractorName,
        ask: 'agent_direct',
        worth: exposure.ifCertificateObtained,
        exposureAtOpen: exposure.addedPremium,
        rationale: `Their agent is on a prior certificate (${producerEmail}) and is usually faster than the sub.`,
      });
    }

    if (exposure.ifSplitInvoiceObtained > 0) {
      proposals.push({
        subcontractorId: exposure.subcontractorId,
        subcontractorName: exposure.subcontractorName,
        ask: 'split_invoice',
        worth: exposure.ifSplitInvoiceObtained,
        exposureAtOpen: exposure.addedPremium,
        rationale: 'The fallback when the sub is defunct, gone, or cannot produce a certificate.',
      });
    }

    if (exposure.flags.some((flag) => flag.flag === 'SOLE_PROPRIETOR_NO_EMPLOYEES')) {
      proposals.push({
        subcontractorId: exposure.subcontractorId,
        subcontractorName: exposure.subcontractorName,
        ask: 'entity_clarification',
        worth: 0,
        exposureAtOpen: exposure.addedPremium,
        rationale: 'Recorded as a sole proprietor — the answer is a question for your auditor.',
      });
    }
  }

  return rankProposals(proposals);
}

/** Dollars removed per call, descending. Ties break on the larger underlying exposure. */
export function rankProposals(proposals: readonly ProposedChaseItem[]): ProposedChaseItem[] {
  return [...proposals].sort(
    (a, b) =>
      b.worth - a.worth ||
      b.exposureAtOpen - a.exposureAtOpen ||
      a.subcontractorName.localeCompare(b.subcontractorName) ||
      a.ask.localeCompare(b.ask),
  );
}

export function rankChaseItems(items: readonly ChaseItem[]): ChaseItem[] {
  return [...items].sort(
    (a, b) =>
      b.exposureAtOpen - a.exposureAtOpen || a.subcontractorName.localeCompare(b.subcontractorName),
  );
}

/**
 * The headline after week one is not exposure — it is exposure eliminated to date, with
 * the open balance secondary. That number is the renewal argument.
 */
export interface EliminationTotals {
  readonly eliminated: Cents;
  readonly openBalance: Cents;
  readonly resolvedCount: number;
  readonly openCount: number;
}

export function eliminationTotals(
  items: readonly ChaseItem[],
  currentExposure: Cents,
): EliminationTotals {
  const resolved = items.filter((item) => item.status === 'resolved');
  const open = items.filter((item) => OPEN_STATUSES.includes(item.status));
  return {
    eliminated: resolved.reduce((total, item) => total + (item.exposureRemoved ?? 0), 0),
    openBalance: currentExposure,
    resolvedCount: resolved.length,
    openCount: open.length,
  };
}
