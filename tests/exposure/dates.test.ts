import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareDates,
  daysBetweenInclusive,
  epochDay,
  formatUsDate,
  isIsoDate,
  isOnOrBetween,
  parseLedgerDate,
} from '@/lib/dates';

describe('isIsoDate', () => {
  it.each(['2025-01-01', '2024-02-29', '2025-12-31'])('accepts %s', (value) => {
    expect(isIsoDate(value)).toBe(true);
  });

  it.each(['2025-02-30', '2025-13-01', '2025-1-1', '01/01/2025', '', null, 20250101])(
    'rejects %s',
    (value) => {
      expect(isIsoDate(value)).toBe(false);
    },
  );

  it('rejects Feb 29 in a non-leap year', () => {
    expect(isIsoDate('2025-02-29')).toBe(false);
    expect(isIsoDate('2000-02-29')).toBe(true);
    expect(isIsoDate('1900-02-29')).toBe(false);
  });
});

describe('parseLedgerDate', () => {
  it.each([
    ['04/30/2025', '2025-04-30'],
    ['4/5/25', '2025-04-05'],
    ['2025-04-30', '2025-04-30'],
    ['12/31/2025', '2025-12-31'],
    ['Jan 5, 2025', '2025-01-05'],
    ['January 5 2025', '2025-01-05'],
    ['5 Jan 2025', '2025-01-05'],
    ['2025/04/30', '2025-04-30'],
  ])('parses %s', (input, expected) => {
    expect(parseLedgerDate(input)).toBe(expected);
  });

  it('falls back to day-first only when the first field cannot be a month', () => {
    expect(parseLedgerDate('30/04/2025')).toBe('2025-04-30');
    // Ambiguous: read as MM/DD/YYYY, the convention these exports use.
    expect(parseLedgerDate('04/05/2025')).toBe('2025-04-05');
  });

  it.each(['', 'not a date', '13/32/2025', '2025-02-30'])('rejects %s', (input) => {
    expect(parseLedgerDate(input)).toBeNull();
  });

  it('never shifts a date across a day boundary', () => {
    // A naive `new Date('2025-04-30')` in a US timezone lands on April 29 locally.
    expect(parseLedgerDate('04/30/2025')).toBe('2025-04-30');
    expect(epochDay('2025-04-30') - epochDay('2025-04-29')).toBe(1);
  });
});

describe('window arithmetic', () => {
  it('compares lexically', () => {
    expect(compareDates('2025-01-01', '2025-01-02')).toBe(-1);
    expect(compareDates('2025-01-02', '2025-01-01')).toBe(1);
    expect(compareDates('2025-01-01', '2025-01-01')).toBe(0);
  });

  it('is inclusive on both ends', () => {
    expect(isOnOrBetween('2025-03-01', '2025-03-01', '2025-06-30')).toBe(true);
    expect(isOnOrBetween('2025-06-30', '2025-03-01', '2025-06-30')).toBe(true);
    expect(isOnOrBetween('2025-02-28', '2025-03-01', '2025-06-30')).toBe(false);
    expect(isOnOrBetween('2025-07-01', '2025-03-01', '2025-06-30')).toBe(false);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2025-01-31', 1)).toBe('2025-02-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2025-01-01', -1)).toBe('2024-12-31');
  });

  it('counts a full year inclusively', () => {
    expect(daysBetweenInclusive('2025-01-01', '2025-12-31')).toBe(365);
    expect(daysBetweenInclusive('2024-01-01', '2024-12-31')).toBe(366);
    expect(daysBetweenInclusive('2025-01-01', '2025-01-01')).toBe(1);
  });

  it('prints MM/DD/YYYY for anything an auditor reads', () => {
    expect(formatUsDate('2025-04-30')).toBe('04/30/2025');
  });
});
