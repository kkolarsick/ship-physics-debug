import { describe, expect, it } from 'vitest';
import { computeExposure, computePortfolioExposure } from '@/lib/exposure/compute';
import { buildConfidence, combineConfidence, factor, worstLevel } from '@/lib/exposure/confidence';
import { PROFILE_INVOICE_SPLIT, TEST_CATALOGUE } from '../fixtures/profiles';
import { cert, dollars, payment, policy, sub } from '../fixtures/scenario';

const WORK = { workFrom: '2025-03-01', workTo: '2025-03-31', paidOn: '2025-04-15' } as const;

describe('level arithmetic', () => {
  it('takes the worst factor, because one weak input is enough', () => {
    expect(worstLevel(['deterministic', 'high', 'low'])).toBe('low');
    expect(worstLevel(['deterministic', 'deterministic'])).toBe('deterministic');
    expect(worstLevel([])).toBe('deterministic');
    expect(worstLevel(['low', 'unavailable'])).toBe('unavailable');
  });

  it('collects every assumption, and only assumptions', () => {
    const confidence = buildConfidence([
      factor('rules_profile', 'deterministic', 'known'),
      factor('rate_provenance', 'low', 'proxied', 'the governing rate stands in'),
    ]);
    expect(confidence.level).toBe('low');
    expect(confidence.assumptions).toEqual(['the governing rate stands in']);
  });

  it('rolls several subcontractors up to the weakest of each factor', () => {
    const clean = buildConfidence([factor('rate_provenance', 'deterministic', 'known class')]);
    const proxied = buildConfidence([
      factor('rate_provenance', 'low', 'proxied', 'governing rate stands in'),
    ]);
    const combined = combineConfidence([clean, proxied]);
    expect(combined.level).toBe('low');
    expect(combined.factors).toHaveLength(1);
  });
});

describe('a fully evidenced figure is deterministic', () => {
  const result = computeExposure(
    sub(),
    [payment({ ...WORK, amount: dollars(100_000) })],
    [cert({ wcEffective: '2025-01-01', wcExpiration: '2025-02-01' })],
    policy(),
    PROFILE_INVOICE_SPLIT,
  );

  it('names every input, with nothing assumed', () => {
    expect(result.confidence.level).toBe('deterministic');
    expect(result.confidence.assumptions).toEqual([]);
    expect(result.confidence.factors.map((entry) => entry.id).sort()).toEqual([
      'certificate_evidence',
      'coverage_period_basis',
      'manual_override',
      'rate_provenance',
      'rules_profile',
      'rules_verification',
      'special_category',
      'subcontractor_match',
      'triage',
    ]);
  });
});

describe('each weak input is named individually', () => {
  it('drops to medium on an unverified rules profile', () => {
    const draft = { ...PROFILE_INVOICE_SPLIT, status: 'draft' as const, verifiedBy: null, verifiedAt: null };
    const result = computeExposure(
      sub(),
      [payment({ ...WORK, amount: dollars(10_000) })],
      [],
      policy(),
      draft,
    );
    expect(result.confidence.factors.find((f) => f.id === 'rules_verification')?.level).toBe('medium');
    // It is a fact about the estimate, not about this subcontractor, so it is carried by
    // the confidence factor rather than repeated as a flag on every row.
    expect(result.confidence.assumptions).toContain(
      'The treatment applied is this product’s model of the jurisdiction, not a transcription of the bureau’s manual.',
    );
  });

  it('drops to medium on a certificate nobody has reviewed', () => {
    const result = computeExposure(
      sub(),
      [payment({ ...WORK, amount: dollars(10_000) })],
      [cert({ evidence: 'model_extracted', wcEffective: '2025-01-01', wcExpiration: '2025-02-01' })],
      policy(),
      PROFILE_INVOICE_SPLIT,
    );
    expect(result.confidence.factors.find((f) => f.id === 'certificate_evidence')?.level).toBe('medium');
    expect(result.flags.map((flag) => flag.flag)).toContain('CERTIFICATE_NOT_REVIEWED');
  });

  it('treats the absence of a certificate as a fact, not an uncertain reading', () => {
    const result = computeExposure(
      sub(),
      [payment({ ...WORK, amount: dollars(10_000) })],
      [],
      policy(),
      PROFILE_INVOICE_SPLIT,
    );
    expect(result.confidence.factors.find((f) => f.id === 'certificate_evidence')?.level).toBe(
      'deterministic',
    );
  });

  it('drops to medium on a certificate matched by name similarity alone', () => {
    const result = computeExposure(
      sub(),
      [payment({ ...WORK, amount: dollars(10_000) })],
      [cert({ matchMethod: 'auto_trigram', wcEffective: '2025-01-01', wcExpiration: '2025-02-01' })],
      policy(),
      PROFILE_INVOICE_SPLIT,
    );
    expect(result.confidence.factors.find((f) => f.id === 'subcontractor_match')?.level).toBe('medium');
    expect(result.flags.map((flag) => flag.flag)).toContain('MATCH_NOT_REVIEWED');
  });

  it('drops to low on an untriaged vendor', () => {
    const result = computeExposure(
      sub({ triage: 'undecided' }),
      [payment({ ...WORK, amount: dollars(10_000) })],
      [],
      policy(),
      PROFILE_INVOICE_SPLIT,
    );
    expect(result.confidence.factors.find((f) => f.id === 'triage')?.level).toBe('low');
  });

  it('records a hand-entered labor/material split as the user’s assertion', () => {
    const result = computeExposure(
      sub(),
      [
        payment({
          ...WORK,
          amount: dollars(100_000),
          materialAmount: dollars(20_000),
          materialEvidence: 'original_invoice',
        }),
      ],
      [],
      policy(),
      PROFILE_INVOICE_SPLIT,
    );
    const override = result.confidence.factors.find((f) => f.id === 'manual_override');
    expect(override?.level).toBe('high');
    expect(override?.statement).toContain('labor/material split');
  });
});

describe('provenance travels with the figure', () => {
  const portfolio = computePortfolioExposure({
    subs: [sub()],
    payments: [payment({ ...WORK, amount: dollars(100_000), id: 'pay-1' })],
    certificates: [cert({ id: 'cert-1', wcEffective: '2025-01-01', wcExpiration: '2025-02-01' })],
    policy: policy(),
    computedAt: '2026-03-01T00:00:00.000Z',
    catalogue: TEST_CATALOGUE,
  });

  it('records the ruleset, the jurisdiction, and when it was computed', () => {
    expect(portfolio.provenance).toMatchObject({
      jurisdiction: 'US-XA',
      rulesetId: 'test-invoice-split',
      rulesetVersion: '1.0.0',
      rulesProfileStatus: 'verified',
      computedAt: '2026-03-01T00:00:00.000Z',
    });
  });

  it('names the documents behind each subcontractor’s figure', () => {
    const first = portfolio.subs[0];
    expect(first?.provenance.certificateIds).toEqual(['cert-1']);
    expect(first?.provenance.paymentIds).toEqual(['pay-1']);
  });

  it('is explainable as inputs, assumptions, ruleset, confidence, and documents', () => {
    const first = portfolio.subs[0]!;
    expect(first.assessments).toHaveLength(1); // inputs, per payment
    expect(first.confidence.factors.length).toBeGreaterThan(0); // confidence flags
    expect(first.rate.statement).toBeTruthy(); // how it was rated
    expect(first.provenance.rulesetVersion).toBe('1.0.0'); // ruleset
    expect(first.provenance.certificateIds).toEqual(['cert-1']); // documents
  });
});
