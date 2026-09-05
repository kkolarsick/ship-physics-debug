import { describe, expect, it } from 'vitest';
import { computePortfolioExposure } from '@/lib/exposure/compute';
import {
  GOLDEN_CERTIFICATES,
  GOLDEN_PAYMENTS,
  GOLDEN_POLICY,
  GOLDEN_SUBS,
} from '@/lib/exposure/fixtures';
import { eliminationTotals, proposeChaseItems, rankProposals } from '@/lib/chase/rank';
import { draftChaseEmail, CHASE_ASK_LABELS } from '@/lib/chase/templates';
import { findCopyViolations } from '@/lib/copy';
import type { ChaseItem } from '@/lib/chase/types';

const portfolio = computePortfolioExposure({
  subs: GOLDEN_SUBS,
  payments: GOLDEN_PAYMENTS,
  certificates: GOLDEN_CERTIFICATES,
  policy: GOLDEN_POLICY,
  computedAt: '2026-01-15T00:00:00.000Z',
});

describe('proposeChaseItems', () => {
  const proposals = proposeChaseItems(portfolio.subs, {
    producerEmailBySub: { ridgeline: 'service@cutlersons.example' },
  });

  it('proposes nothing for a sub whose payments are all covered', () => {
    expect(proposals.some((p) => p.subcontractorId === 'delgado')).toBe(false);
    expect(proposals.some((p) => p.subcontractorId === 'tristate')).toBe(false);
  });

  it('always proposes a certificate for a sub with exposure', () => {
    for (const id of ['kowalczyk', 'ridgeline', 'bk-drywall', 'vega']) {
      expect(proposals.some((p) => p.subcontractorId === id && p.ask === 'certificate')).toBe(true);
    }
  });

  it('proposes the agent only where a producer contact came off a prior certificate', () => {
    const agentAsks = proposals.filter((p) => p.ask === 'agent_direct');
    expect(agentAsks).toHaveLength(1);
    expect(agentAsks[0]?.subcontractorId).toBe('ridgeline');
  });

  it('does not propose a split invoice once the material cap is exhausted', () => {
    // Vega already claimed the full 50%, so a split invoice is worth nothing more.
    expect(proposals.some((p) => p.subcontractorId === 'vega' && p.ask === 'split_invoice')).toBe(
      false,
    );
  });

  it('asks the entity question only where the sole proprietor flag fired', () => {
    const entityAsks = proposals.filter((p) => p.ask === 'entity_clarification');
    expect(entityAsks.map((p) => p.subcontractorId)).toEqual(['vega']);
  });

  it('ranks by dollars removed per call, not by invoice size', () => {
    const first = proposals[0];
    expect(first?.subcontractorId).toBe('ridgeline');
    expect(first?.worth).toBe(1_861_860);

    const bk = proposals.find((p) => p.subcontractorId === 'bk-drywall' && p.ask === 'certificate');
    const vega = proposals.find((p) => p.subcontractorId === 'vega' && p.ask === 'certificate');
    // B&K was paid $58,200 and Vega $129,000, yet Vega's certificate is worth more here
    // because its exposure is larger after the material credit.
    expect(vega!.worth).toBeGreaterThan(bk!.worth);
  });

  it('is a stable ordering', () => {
    expect(rankProposals(proposals)).toEqual(proposals);
  });
});

describe('draftChaseEmail', () => {
  const context = {
    orgName: 'Northgate Construction LLC',
    senderName: 'Dana Whitfield',
    senderEmail: 'dana@northgate.example',
    subcontractorName: 'Ridgeline Roofing LLC',
    workDates: { from: '2025-03-03', to: '2025-09-30' },
    policyTermEnd: '2025-12-31',
    producerName: 'Cutler & Sons Agency',
    lastCertificateExpiration: '2025-01-31',
  } as const;

  it('labels every ask type', () => {
    expect(Object.keys(CHASE_ASK_LABELS).sort()).toEqual([
      'agent_direct',
      'certificate',
      'entity_clarification',
      'split_invoice',
    ]);
  });

  it('names the work dates in US format in the certificate request', () => {
    const draft = draftChaseEmail('certificate', context);
    expect(draft.body).toContain('03/03/2025 through 09/30/2025');
    expect(draft.body).toContain('01/31/2025');
    expect(draft.subject).toContain('Certificate of insurance request');
  });

  it('says plainly when nothing is on file', () => {
    const draft = draftChaseEmail('certificate', { ...context, lastCertificateExpiration: null });
    expect(draft.body).toContain('We do not have a certificate on file');
  });

  it('addresses the producer by name in the agent request', () => {
    const draft = draftChaseEmail('agent_direct', context);
    expect(draft.body.startsWith('Cutler & Sons Agency,')).toBe(true);
  });

  it('falls back to a neutral greeting with no producer name', () => {
    const draft = draftChaseEmail('agent_direct', { ...context, producerName: null });
    expect(draft.body.startsWith('Hello,')).toBe(true);
  });

  it('asks for the original invoice specifically in the split-invoice request', () => {
    const draft = draftChaseEmail('split_invoice', context);
    expect(draft.body).toContain('original invoices');
  });

  it('asks the sole-proprietor question without answering it', () => {
    const draft = draftChaseEmail('entity_clarification', context);
    expect(draft.body).toContain('sole proprietor with no employees');
    expect(draft.body).toContain('Our auditor asks this');
  });

  it('never advises the recipient on what coverage to carry', () => {
    for (const ask of ['certificate', 'agent_direct', 'split_invoice', 'entity_clarification'] as const) {
      const draft = draftChaseEmail(ask, context);
      expect(findCopyViolations(`${draft.subject}\n${draft.body}`)).toEqual([]);
    }
  });
});

describe('eliminationTotals', () => {
  const items: ChaseItem[] = [
    item('1', 'resolved', 1_861_860, 1_861_860),
    item('2', 'resolved', 757_764, 757_764),
    item('3', 'sent', 1_822_800, null),
    item('4', 'open', 839_790, null),
    item('5', 'dead', 500_000, null),
  ];

  it('headlines dollars removed and keeps the open balance secondary', () => {
    const totals = eliminationTotals(items, 2_662_590);
    expect(totals.eliminated).toBe(2_619_624);
    expect(totals.openBalance).toBe(2_662_590);
    expect(totals.resolvedCount).toBe(2);
    expect(totals.openCount).toBe(2);
  });

  it('counts nothing removed before anything resolves', () => {
    expect(eliminationTotals([item('1', 'open', 100, null)], 100).eliminated).toBe(0);
  });
});

function item(
  id: string,
  status: ChaseItem['status'],
  exposureAtOpen: number,
  exposureRemoved: number | null,
): ChaseItem {
  return {
    id,
    policyId: 'p1',
    subcontractorId: `s${id}`,
    subcontractorName: `Sub ${id}`,
    ask: 'certificate',
    exposureAtOpen,
    status,
    sentTo: null,
    sentAt: null,
    respondedAt: null,
    resolvedAt: null,
    resolutionNote: null,
    exposureRemoved,
    rulesetVersion: '2026.1.0',
  };
}
