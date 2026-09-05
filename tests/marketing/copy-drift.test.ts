import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canCalculate,
  confidenceCaveats,
  launchStates,
  recognisedStates,
  stateProfile,
  supportOf,
  willNotCalculate,
} from '@/lib/marketing/states';
import { jurisdictionForSlug, stateSlug } from '@/lib/marketing/jurisdictions';
import { LAUNCH_JURISDICTIONS } from '@/lib/rules/profiles';
import { PROFILE_DEEMED_SHARE, PROFILE_INVOICE_SPLIT } from '../fixtures/profiles';

/**
 * The marketing surface is generated from the rules registry, and these are the assertions
 * that keep it that way. A page that claims more than the engine implements is a worse
 * failure than a missing page: it puts a promise in front of a stranger that the product
 * will refuse to keep three screens later.
 */
describe('public claims follow the engine', () => {
  it('says nothing can be calculated for a state whose rules are not populated', () => {
    for (const state of recognisedStates()) {
      if (state.producesEstimates) continue;
      expect(state.canCalculate, state.jurisdiction).toEqual([]);
      expect(state.willNotCalculate.join(' '), state.jurisdiction).toContain(
        'A premium estimate of any kind',
      );
      expect(state.confidenceCaveats, state.jurisdiction).toEqual([]);
    }
  });

  it('never leaves a page with nothing to say about its limits', () => {
    for (const state of recognisedStates()) {
      expect(state.willNotCalculate.length, state.jurisdiction).toBeGreaterThan(0);
    }
  });

  it('names a rating authority and a ruleset wherever it claims to estimate', () => {
    for (const state of recognisedStates()) {
      if (!state.producesEstimates) continue;
      expect(state.ratingBureau, state.jurisdiction).toBeTruthy();
      expect(state.rulesetId, state.jurisdiction).toBeTruthy();
      expect(state.rulesetVersion, state.jurisdiction).toBeTruthy();
      expect(state.canCalculate.length, state.jurisdiction).toBeGreaterThan(0);
      expect(state.citations.length, state.jurisdiction).toBeGreaterThan(0);
    }
  });

  it('lists the six launch states, in the order the plan prioritises them', () => {
    expect(launchStates().map((state) => state.jurisdiction)).toEqual([
      'US-NY',
      'US-NJ',
      'US-PA',
      'US-FL',
      'US-CA',
      'US-TX',
    ]);
    expect(LAUNCH_JURISDICTIONS).toHaveLength(6);
  });

  it('routes each state page at the slug the plan specifies', () => {
    expect(stateProfile('US-NY').path).toBe('/new-york/workers-comp-audit');
    expect(stateProfile('US-NJ').path).toBe('/new-jersey/workers-comp-audit');
    expect(stateProfile('US-PA').path).toBe('/pennsylvania/workers-comp-audit');
    expect(stateProfile('US-FL').path).toBe('/florida/workers-comp-audit');
    expect(stateProfile('US-CA').path).toBe('/california/workers-comp-audit');
    expect(stateProfile('US-TX').path).toBe('/texas/workers-comp-audit');
  });

  it('round-trips a slug back to its jurisdiction', () => {
    for (const state of recognisedStates()) {
      expect(jurisdictionForSlug(stateSlug(state.jurisdiction))).toBe(state.jurisdiction);
    }
  });
});

/**
 * The copy is generated, not written: two profiles that disagree about the rules have to
 * produce different sentences. If this ever passes with identical copy, the state pages
 * have become templates with the state name swapped in.
 */
describe('the copy is derived from the profile, not templated', () => {
  const a = canCalculate(PROFILE_INVOICE_SPLIT);
  const b = canCalculate(PROFILE_DEEMED_SHARE);

  it('describes a different treatment of uninsured subcontract cost', () => {
    expect(a.join(' ')).toContain('treated as subject to inclusion');
    expect(b.join(' ')).toContain('deemed labor share of 3/5');
  });

  it('describes the labor/material rule each profile actually holds', () => {
    expect(a.join(' ')).toContain('capped at 1/2 of the uncovered amount');
    expect(b.join(' ')).not.toContain('labor/material separation');
    expect(willNotCalculate(PROFILE_DEEMED_SHARE, 'supported').join(' ')).toContain(
      'A labor/material deduction',
    );
  });

  it('describes the classification rule each profile actually holds', () => {
    expect(a.join(' ')).toContain('subcontractor’s own trade');
    expect(b.join(' ')).toContain('governing class');
  });

  it('describes how a straddling work period is resolved', () => {
    expect(a.join(' ')).toContain('treated as uncovered');
    expect(b.join(' ')).toContain('split across covered and uncovered days');
  });

  it('warns about a proxy only where the profile permits one', () => {
    const permissive = confidenceCaveats(PROFILE_INVOICE_SPLIT, 'supported').join(' ');
    const strict = confidenceCaveats(PROFILE_DEEMED_SHARE, 'supported').join(' ');
    expect(permissive).toContain('the payment date is used to test coverage');
    expect(strict).not.toContain('the payment date is used to test coverage');
    expect(willNotCalculate(PROFILE_DEEMED_SHARE, 'supported').join(' ')).toContain(
      'An estimate from payment dates alone',
    );
  });

  it('marks an unreviewed profile as this product’s model rather than the bureau’s rule', () => {
    const draft = { ...PROFILE_INVOICE_SPLIT, status: 'draft' as const };
    expect(supportOf(draft)).toBe('supported_draft');
    expect(confidenceCaveats(draft, 'supported_draft').join(' ')).toContain(
      'has not been checked line by line against the governing manual',
    );
  });
});

describe('no page hard-codes what the engine decides', () => {
  const pages = walk('app/(marketing)');

  /** Scan what a visitor reads, not what a developer wrote about it. */
  const copyOf = (file: string): string =>
    readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('reads state support from the registry rather than a literal list', () => {
    // A page that names a launch state in a supported/unsupported claim has stopped being
    // generated. The state name may appear in a route or a heading, but the claim about
    // coverage has to come from stateProfile().
    const claims = /(New York|New Jersey|Pennsylvania|Florida|California|Texas)[^\n]{0,40}\b(is supported|is not supported|fully supported|we support)\b/i;
    for (const file of pages) {
      expect(claims.test(copyOf(file)), file).toBe(false);
    }
  });

  it('offers no meeting anywhere in the funnel', () => {
    const gates = /book a demo|schedule a call|talk to sales|request a demo/i;
    for (const file of pages) {
      expect(gates.test(copyOf(file)), file).toBe(false);
    }
  });

  it('does not lead on certificate extraction', () => {
    // COIs are supporting evidence. The homepage in particular must not sell the reader.
    const home = readFileSync('app/(marketing)/page.tsx', 'utf8');
    expect(/AI[- ]powered|AI extraction|automated COI|certificate management/i.test(home)).toBe(false);
  });

  it('claims no nationwide coverage', () => {
    // Only a coverage verb paired with a nationwide scope is a claim. "See every state
    // SubLedger recognises" is a link to a table that says which ones it prices.
    const nationwide =
      /\b(support(s|ed|ing)?|cover(s|ed|ing)?|estimat(e|es|ing)|price(s|d)?|available)\b[^.\n]{0,40}\b(all 50 states|nationwide|every state|any state|all states)\b/i;
    for (const file of pages) {
      expect(nationwide.test(copyOf(file)), file).toBe(false);
    }
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}
