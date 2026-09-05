import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computePortfolioExposure } from '@/lib/exposure/compute';
import { DemoStore } from '@/lib/db/demo-store';
import { PROFILE_INVOICE_SPLIT, TEST_CATALOGUE } from '../fixtures/profiles';
import { dollars, payment, policy, sub } from '../fixtures/scenario';
import type { RulesProfile } from '@/lib/rules/types';

/**
 * A figure produced in March has to be explainable in November, after the rules profile
 * for its jurisdiction has moved on. Two things make that true: a saved figure records the
 * exact ruleset that produced it, and re-resolving that pair returns the same profile.
 */
const WORK = { workFrom: '2025-03-01', workTo: '2025-03-31', paidOn: '2025-04-15' } as const;

/** The same jurisdiction, a year later, with the material cap tightened to a third. */
const PROFILE_V2: RulesProfile = {
  ...PROFILE_INVOICE_SPLIT,
  rulesetVersion: '2.0.0',
  effectiveFrom: '2026-01-01',
  laborMaterial: {
    ...PROFILE_INVOICE_SPLIT.laborMaterial,
    cap: { kind: 'share_of_uncovered', share: { numerator: 1, denominator: 3 } },
  },
};

const CATALOGUE_BOTH = [...TEST_CATALOGUE, PROFILE_V2];

const PAYMENTS = [
  payment({
    ...WORK,
    amount: dollars(90_000),
    materialAmount: dollars(90_000),
    materialEvidence: 'original_invoice',
  }),
];

function compute(catalogue: readonly RulesProfile[], pinned?: { id: string; version: string }) {
  return computePortfolioExposure({
    subs: [sub()],
    payments: PAYMENTS,
    certificates: [],
    policy: policy({
      rulesetId: pinned?.id ?? null,
      rulesetVersion: pinned?.version ?? null,
    }),
    computedAt: '2026-06-01T00:00:00.000Z',
    catalogue,
  });
}

describe('a new ruleset version changes new figures', () => {
  it('produces the version-1 answer against the version-1 catalogue', () => {
    const v1 = compute(TEST_CATALOGUE);
    expect(v1.provenance.rulesetVersion).toBe('1.0.0');
    expect(v1.addedPayroll).toBe(dollars(45_000)); // capped at half
  });

  it('produces the version-2 answer once the newer profile is live', () => {
    const v2 = compute(CATALOGUE_BOTH);
    expect(v2.provenance.rulesetVersion).toBe('2.0.0');
    expect(v2.addedPayroll).toBe(dollars(60_000)); // capped at a third
  });
});

describe('pinning reproduces a historical figure exactly', () => {
  it('returns the old answer when the old version is pinned, with the newer one live', () => {
    const reproduced = compute(CATALOGUE_BOTH, { id: 'test-invoice-split', version: '1.0.0' });
    expect(reproduced.provenance.rulesetVersion).toBe('1.0.0');
    expect(reproduced.addedPayroll).toBe(dollars(45_000));
    expect(reproduced.addedPremiumBeforeSurcharge).toBe(dollars(4_500));
  });

  it('says so rather than substituting when the pinned version is gone', () => {
    const result = compute([PROFILE_V2], { id: 'test-invoice-split', version: '1.0.0' });
    expect(result.status).toBe('unavailable');
    expect(result.unavailable?.reason).toBe('ruleset_version_not_found');
    expect(result.totalExposure).toBe(0);
  });

  it('is byte-identical across repeated computations of the same pinned inputs', () => {
    const once = compute(CATALOGUE_BOTH, { id: 'test-invoice-split', version: '1.0.0' });
    const twice = compute(CATALOGUE_BOTH, { id: 'test-invoice-split', version: '1.0.0' });
    expect(JSON.stringify(twice.subs)).toBe(JSON.stringify(once.subs));
  });
});

describe('a ruleset migration does not rewrite prior snapshots', () => {
  it('leaves the saved figure and its ruleset stamp alone', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'subledger-')), 'demo.json');
    const store = new DemoStore(path);

    const before = compute(TEST_CATALOGUE);
    const saved = await store.saveExposureSnapshot(before, 'export:workpaper_pdf');

    // The jurisdiction's profile is upgraded, and a new figure is produced and saved.
    const after = compute(CATALOGUE_BOTH);
    await store.saveExposureSnapshot(after, 'export:workpaper_pdf');

    const snapshots = await store.listExposureSnapshots(before.policyId);
    expect(snapshots).toHaveLength(2);

    const original = snapshots.find((entry) => entry.id === saved.id);
    expect(original).toBeDefined();
    expect(original?.rulesetVersion).toBe('1.0.0');
    expect(original?.addedPayroll).toBe(dollars(45_000));
    expect(original?.totalExposure).toBe(dollars(4_500));

    // And the newer figure is stored beside it rather than on top of it.
    const upgraded = snapshots.find((entry) => entry.id !== saved.id);
    expect(upgraded?.rulesetVersion).toBe('2.0.0');
    expect(upgraded?.addedPayroll).toBe(dollars(60_000));
  });

  it('keeps the confidence and jurisdiction the figure was produced under', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'subledger-')), 'demo.json');
    const store = new DemoStore(path);
    const portfolio = compute(TEST_CATALOGUE);
    const saved = await store.saveExposureSnapshot(portfolio, 'export:detail_xlsx');

    expect(saved.jurisdiction).toBe('US-XA');
    expect(saved.rulesetId).toBe('test-invoice-split');
    expect(saved.confidenceLevel).toBe(portfolio.confidence.level);
  });

  it('exposes no store operation that could edit or delete a snapshot', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'subledger-')), 'demo.json');
    const store = new DemoStore(path);
    const operations = Object.getOwnPropertyNames(Object.getPrototypeOf(store));
    expect(operations.filter((name) => /snapshot/i.test(name)).sort()).toEqual([
      'listExposureSnapshots',
      'saveExposureSnapshot',
    ]);
  });

  it('records the export in the append-only audit trail', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'subledger-')), 'demo.json');
    const store = new DemoStore(path);
    await store.saveExposureSnapshot(compute(TEST_CATALOGUE), 'export:workpaper_pdf');

    const events = await store.listAuditEvents({ entityType: 'exposure_snapshot' });
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe('export:workpaper_pdf');
    expect(events[0]?.after).toMatchObject({ rulesetVersion: '1.0.0' });

    // Nothing in the file rewrote the earlier event.
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { auditEvents: unknown[] };
    expect(raw.auditEvents.length).toBeGreaterThan(0);
  });
});

describe('the migration guarantee is structural in SQL too', () => {
  it('blocks updates and deletes on exposure_snapshots', () => {
    const sql = readFileSync('supabase/migrations/0004_rules_profiles_and_provenance.sql', 'utf8');
    expect(sql).toContain('create rule exposure_snapshots_no_update');
    expect(sql).toContain('create rule exposure_snapshots_no_delete');
  });

  it('stores the ruleset id alongside the version on every snapshot', () => {
    const sql = readFileSync('supabase/migrations/0004_rules_profiles_and_provenance.sql', 'utf8');
    expect(sql).toMatch(/alter table public\.exposure_snapshots[\s\S]*ruleset_id text/);
  });
});
