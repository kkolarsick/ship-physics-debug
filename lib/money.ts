/**
 * Money and rating arithmetic.
 *
 * Engineering standard (brief §11): all money is integer cents internally and is
 * formatted only at the view layer. Nothing in here does floating-point arithmetic
 * on dollars — the rating multiply-and-divide runs in BigInt so a $40M ledger
 * cannot drift a cent, and rounding happens exactly once, at the end.
 */

/** An amount of money, as a whole number of cents. */
export type Cents = number;

/**
 * Premium dollars per $100 of payroll, held as an integer scaled by 10,000.
 * A published rate of 12.40 is 124_000.
 */
export type RateTenThousandths = number;

/**
 * Experience modification factor, held as an integer scaled by 1,000 to match
 * the NUMERIC(5,3) column. A mod of 1.05 is 1_050.
 */
export type ModThousandths = number;

/** A percentage, held as an integer scaled by 10,000. 7.5% is 75_000. */
export type PctTenThousandths = number;

export const RATE_SCALE = 10_000;
export const MOD_SCALE = 1_000;
export const PCT_SCALE = 10_000;

/** Round a BigInt quotient half-away-from-zero without ever touching a float. */
function divideRoundHalfAway(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n) throw new RangeError('denominator must be positive');
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const quotient = abs / denominator;
  const remainder = abs - quotient * denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  const signed = negative ? -rounded : rounded;
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError('result exceeds safe integer range');
  }
  return Number(signed);
}

/**
 * Rate payroll at a class code rate and experience mod.
 *
 *   premium = (payroll / 100) * rate * mod
 *
 * expressed in cents with both factors held as scaled integers:
 *
 *   premiumCents = payrollCents * rate10k * mod1k / (10_000 * 1_000 * 100)
 */
export function ratePayroll(
  payrollCents: Cents,
  rate: RateTenThousandths,
  mod: ModThousandths,
): Cents {
  assertInteger(payrollCents, 'payrollCents');
  assertInteger(rate, 'rate');
  assertInteger(mod, 'mod');
  return divideRoundHalfAway(
    BigInt(payrollCents) * BigInt(rate) * BigInt(mod),
    BigInt(RATE_SCALE) * BigInt(MOD_SCALE) * 100n,
  );
}

/** Take a percentage of a money amount. `pct` is scaled by 10,000. */
export function applyPct(amountCents: Cents, pct: PctTenThousandths): Cents {
  assertInteger(amountCents, 'amountCents');
  assertInteger(pct, 'pct');
  return divideRoundHalfAway(BigInt(amountCents) * BigInt(pct), BigInt(PCT_SCALE) * 100n);
}

/** Multiply a money amount by a fraction given as an exact numerator/denominator. */
export function multiplyByFraction(
  amountCents: Cents,
  numerator: number,
  denominator: number,
): Cents {
  assertInteger(amountCents, 'amountCents');
  assertInteger(numerator, 'numerator');
  assertInteger(denominator, 'denominator');
  return divideRoundHalfAway(BigInt(amountCents) * BigInt(numerator), BigInt(denominator));
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const value of values) {
    assertInteger(value, 'value');
    total += value;
  }
  if (!Number.isSafeInteger(total)) throw new RangeError('sum exceeds safe integer range');
  return total;
}

function assertInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be a safe integer, received ${String(value)}`);
  }
}

/**
 * Parse a decimal string into an integer scaled by `scale` without going through
 * a float. Accepts "12.40", "-0.5", "1,234.5", "$12.40", "(12.40)" (negative).
 * Extra decimal places beyond the scale are rounded half-away-from-zero.
 */
export function parseScaled(input: string, scale: number): number | null {
  if (!Number.isSafeInteger(scale) || scale <= 0) throw new RangeError('scale must be positive');
  let text = input.trim();
  if (text === '') return null;

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  }
  text = text.replace(/[$\s,]/g, '');
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }
  if (!/^\d*(\.\d*)?$/.test(text) || text === '' || text === '.') return null;

  const [wholePart = '', fractionPart = ''] = text.split('.');
  const scaleDigits = String(scale).length - 1;
  if (String(scale) !== `1${'0'.repeat(scaleDigits)}`) {
    throw new RangeError('scale must be a power of ten');
  }

  const padded = fractionPart.padEnd(scaleDigits + 1, '0');
  const kept = padded.slice(0, scaleDigits);
  const nextDigit = Number(padded[scaleDigits] ?? '0');
  let magnitude = BigInt(`${wholePart || '0'}${kept || ''}`);
  if (nextDigit >= 5) magnitude += 1n;

  const signed = negative ? -magnitude : magnitude;
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) {
    return null;
  }
  return Number(signed);
}

/** Parse a ledger money string ("$1,234.56", "(89.10)", "1234") into cents. */
export function parseMoneyToCents(input: string): Cents | null {
  return parseScaled(input, 100);
}

export function parseRate(input: string): RateTenThousandths | null {
  return parseScaled(input, RATE_SCALE);
}

export function parseMod(input: string): ModThousandths | null {
  return parseScaled(input, MOD_SCALE);
}

export function parsePct(input: string): PctTenThousandths | null {
  return parseScaled(input, PCT_SCALE);
}

/** Render a scaled integer back to a plain decimal string (no separators). */
export function formatScaled(value: number, scale: number, minDecimals = 0): string {
  const scaleDigits = String(scale).length - 1;
  const negative = value < 0;
  const abs = BigInt(Math.abs(value));
  const divisor = BigInt(scale);
  const whole = abs / divisor;
  const fraction = (abs % divisor).toString().padStart(scaleDigits, '0');
  const trimmed = fraction.replace(/0+$/, '');
  const decimals = trimmed.length >= minDecimals ? trimmed : trimmed.padEnd(minDecimals, '0');
  const body = decimals === '' ? `${whole}` : `${whole}.${decimals}`;
  return negative ? `-${body}` : body;
}

const WHOLE_DOLLARS = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const EXACT_DOLLARS = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** View layer only. Whole dollars — what the workpaper prints. */
export function formatDollars(cents: Cents): string {
  return WHOLE_DOLLARS.format(Math.round(cents / 100));
}

/** View layer only. Cents shown — used where a figure is being reconciled. */
export function formatDollarsExact(cents: Cents): string {
  return EXACT_DOLLARS.format(cents / 100);
}

export function formatRate(rate: RateTenThousandths): string {
  return formatScaled(rate, RATE_SCALE, 2);
}

export function formatMod(mod: ModThousandths): string {
  return formatScaled(mod, MOD_SCALE, 3);
}

export function formatPct(pct: PctTenThousandths): string {
  return `${formatScaled(pct, PCT_SCALE, 0)}%`;
}
