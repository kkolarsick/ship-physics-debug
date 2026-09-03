/**
 * What every screen needs: the dataset for the selected policy term, and the exposure
 * computed from it by the one engine.
 *
 * Nothing caches a computed figure and hands it back later — the number on the dashboard
 * is always recomputed from the documents and figures currently on file, and the ruleset
 * version that produced it travels with it.
 */
import 'server-only';
import { computePortfolioExposure } from '@/lib/exposure/compute';
import { eliminationTotals, type EliminationTotals } from '@/lib/chase/rank';
import { getStore, storeMode, type StoreMode } from '@/lib/db';
import type { Dataset } from '@/lib/db/types';
import type { PortfolioExposure } from '@/lib/exposure/types';
import type { Store } from '@/lib/db/store';

export interface Workspace {
  readonly store: Store;
  readonly mode: StoreMode;
  readonly data: Dataset;
  readonly portfolio: PortfolioExposure | null;
  readonly totals: EliminationTotals | null;
}

export async function loadWorkspace(policyId?: string): Promise<Workspace> {
  const store = await getStore();
  const data = await store.loadDataset(policyId);
  const mode = storeMode();

  if (data.policy === null) {
    return { store, mode, data, portfolio: null, totals: null };
  }

  const portfolio = computePortfolioExposure(
    data.subcontractors,
    data.payments,
    data.certificates,
    data.policy,
  );

  const chaseWithNames = data.chaseItems.map((item) => ({
    ...item,
    subcontractorName:
      data.subcontractors.find((sub) => sub.id === item.subcontractorId)?.name ??
      item.subcontractorName,
  }));

  return {
    store,
    mode,
    data: { ...data, chaseItems: chaseWithNames },
    portfolio,
    totals: eliminationTotals(chaseWithNames, portfolio.totalExposure),
  };
}

/** Payments for one sub, oldest first — the order the timeline draws them in. */
export function paymentsFor(data: Dataset, subcontractorId: string) {
  return data.payments
    .filter((payment) => payment.subcontractorId === subcontractorId)
    .sort((a, b) => a.paidOn.localeCompare(b.paidOn));
}

export function certificatesFor(data: Dataset, subcontractorId: string) {
  return data.certificates.filter((cert) => cert.subcontractorId === subcontractorId);
}

export function subById(data: Dataset, subcontractorId: string) {
  return data.subcontractors.find((sub) => sub.id === subcontractorId) ?? null;
}
