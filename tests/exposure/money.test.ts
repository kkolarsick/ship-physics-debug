import { describe, expect, it } from 'vitest';
import {
  applyPct,
  formatDollars,
  formatDollarsExact,
  formatMod,
  formatRate,
  multiplyByFraction,
  parseMod,
  parseMoneyToCents,
  parsePct,
  parseRate,
  parseScaled,
  ratePayroll,
  sumCents,
} from '@/lib/money';

describe('parseMoneyToCents', () => {
  it.each([
    ['1234.56', 123_456],
    ['$1,234.56', 123_456],
    ['1,234', 123_400],
    ['0.01', 1],
    ['-89.10', -8_910],
    ['(89.10)', -8_910],
    ['($1,089.10)', -108_910],
    ['  42  ', 4_200],
    ['0', 0],
    ['.5', 50],
  ])('parses %s', (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
  });

  it.each(['', 'n/a', 'abc', '1.2.3', '--5', '$'])('rejects %s', (input) => {
    expect(parseMoneyToCents(input)).toBeNull();
  });

  it('does not lose a cent to binary floating point', () => {
    // 0.1 + 0.2 in floats is 0.30000000000000004; in cents it is exactly 30.
    expect(sumCents([parseMoneyToCents('0.10')!, parseMoneyToCents('0.20')!])).toBe(30);
  });

  it('rounds a third decimal place half away from zero', () => {
    expect(parseMoneyToCents('1.005')).toBe(101);
    expect(parseMoneyToCents('1.004')).toBe(100);
    expect(parseMoneyToCents('-1.005')).toBe(-101);
  });
});

describe('parseScaled', () => {
  it('parses rates, mods, and percentages at their own scales', () => {
    expect(parseRate('12.40')).toBe(124_000);
    expect(parseMod('1.05')).toBe(1_050);
    expect(parseMod('1.005')).toBe(1_005);
    expect(parsePct('7.5')).toBe(75_000);
    expect(parseScaled('3', 1_000)).toBe(3_000);
  });

  it('rejects a scale that is not a power of ten', () => {
    expect(() => parseScaled('1', 3)).toThrow();
  });
});

describe('ratePayroll', () => {
  it('computes premium = payroll / 100 * rate * mod', () => {
    // 140,000 / 100 * 12.40 * 1.05 = 18,228.00
    expect(ratePayroll(14_000_000, 124_000, 1_050)).toBe(1_822_800);
  });

  it('rounds the result to the cent, half away from zero', () => {
    // 143,000 / 100 * 12.40 * 1.05 = 18,618.60 exactly
    expect(ratePayroll(14_300_000, 124_000, 1_050)).toBe(1_861_860);
    // 1 cent of payroll at 12.40 and 1.05 = 0.0013 cents, which rounds to 0.
    expect(ratePayroll(1, 124_000, 1_050)).toBe(0);
  });

  it('stays exact on a $40M ledger, where a float would drift', () => {
    const payroll = 4_000_000_000; // $40,000,000.00
    expect(ratePayroll(payroll, 124_000, 1_050)).toBe(520_800_000); // $5,208,000.00
  });

  it('is zero for zero payroll', () => {
    expect(ratePayroll(0, 124_000, 1_050)).toBe(0);
  });

  it('rejects a non-integer amount rather than silently truncating it', () => {
    expect(() => ratePayroll(100.5, 124_000, 1_050)).toThrow(TypeError);
  });
});

describe('applyPct and multiplyByFraction', () => {
  it('takes a percentage of a money amount', () => {
    expect(applyPct(18_000_000, 50_000)).toBe(900_000); // 5% of $180,000 = $9,000
    expect(applyPct(18_000_000, 0)).toBe(0);
  });

  it('halves an odd number of cents by rounding up, once', () => {
    expect(multiplyByFraction(101, 1, 2)).toBe(51);
    expect(multiplyByFraction(100, 1, 2)).toBe(50);
  });
});

describe('formatting', () => {
  it('formats whole dollars for the workpaper', () => {
    expect(formatDollars(5_282_214)).toBe('$52,822');
    expect(formatDollars(0)).toBe('$0');
  });

  it('formats exact dollars where a figure is being reconciled', () => {
    expect(formatDollarsExact(5_282_214)).toBe('$52,822.14');
  });

  it('formats rates and mods at their published precision', () => {
    expect(formatRate(124_000)).toBe('12.40');
    expect(formatMod(1_050)).toBe('1.050');
  });
});
