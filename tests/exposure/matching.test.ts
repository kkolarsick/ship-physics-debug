import { describe, expect, it } from 'vitest';
import { normalizeName } from '@/lib/matching/normalize';
import { bandFor, rankCandidates, similarity, trigrams } from '@/lib/matching/similarity';

describe('normalizeName', () => {
  it.each([
    ['KOWALCZYK FRAMING', 'KOWALCZYK FRAMING'],
    ['Kowalczyk Framing & Carpentry LLC', 'KOWALCZYK FRAMING AND CARPENTRY'],
    ['Delgado Electric, Inc.', 'DELGADO ELECTRIC'],
    ['Tri-State Plumbing Co.', 'TRI STATE PLUMBING'],
    ['The Ridgeline Roofing L.L.C.', 'RIDGELINE ROOFING'],
    ['B&K Drywall', 'B AND K DRYWALL'],
    ["O'Brien Masonry PLLC", 'OBRIEN MASONRY'],
    ['Vega  Concrete   LLC', 'VEGA CONCRETE'],
    ['Acme Plumbing Co Inc', 'ACME PLUMBING'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });

  it('never strips a name down to nothing', () => {
    expect(normalizeName('LLC')).toBe('LLC');
    expect(normalizeName('The')).toBe('THE');
  });
});

describe('similarity', () => {
  it('matches pg_trgm trigram generation', () => {
    expect([...trigrams('abc')]).toEqual(['  a', ' ab', 'abc', 'bc ']);
  });

  it('is 1 for identical strings and 0 for disjoint ones', () => {
    expect(similarity('KOWALCZYK FRAMING', 'KOWALCZYK FRAMING')).toBe(1);
    expect(similarity('AAAA', 'ZZZZ')).toBe(0);
  });

  it('scores the real-world pair from the brief above the review threshold', () => {
    const score = similarity(
      normalizeName('KOWALCZYK FRAMING'),
      normalizeName('Kowalczyk Framing & Carpentry LLC'),
    );
    expect(score).toBeGreaterThan(0.55);
    expect(bandFor(score)).toBe('review');
  });

  it('auto-matches a pair that differs only by an entity suffix', () => {
    const score = similarity(
      normalizeName('DELGADO ELECTRIC'),
      normalizeName('Delgado Electric, Inc.'),
    );
    expect(score).toBe(1);
    expect(bandFor(score)).toBe('auto');
  });

  it('leaves an unrelated certificate unmatched', () => {
    const score = similarity(normalizeName('B&K DRYWALL'), normalizeName('Summit Excavation LLC'));
    expect(bandFor(score)).toBe('unmatched');
  });
});

describe('rankCandidates', () => {
  const subs = [
    { id: '1', name: 'KOWALCZYK FRAMING', normalizedName: 'KOWALCZYK FRAMING' },
    { id: '2', name: 'DELGADO ELECTRIC', normalizedName: 'DELGADO ELECTRIC' },
    { id: '3', name: 'B&K DRYWALL', normalizedName: 'B AND K DRYWALL' },
  ];

  it('ranks the best candidate first', () => {
    const ranked = rankCandidates(normalizeName('Kowalczyk Framing & Carpentry LLC'), subs);
    expect(ranked[0]?.subcontractorId).toBe('1');
  });

  it('answers from a confirmed alias without scoring', () => {
    const ranked = rankCandidates('SUMMIT EXCAVATION', subs, [
      { subcontractorId: '2', normalizedAlias: 'SUMMIT EXCAVATION' },
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toMatchObject({ subcontractorId: '2', score: 1, band: 'auto' });
  });

  it('returns nothing when no subcontractor shares a trigram', () => {
    expect(rankCandidates('ZZZZZZ', subs)).toEqual([]);
  });
});
