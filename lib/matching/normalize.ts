/**
 * Name normalization for matching ledger vendors to certificate named-insureds (brief §5).
 *
 * "KOWALCZYK FRAMING" in QuickBooks and "Kowalczyk Framing & Carpentry LLC" on the
 * certificate are the same company. Normalization strips the noise that differs between
 * the two systems and leaves the part a human would recognize.
 */

const ENTITY_SUFFIXES: ReadonlySet<string> = new Set([
  'LLC', 'LLP', 'LP', 'LTD', 'INC', 'INCORPORATED', 'CORP', 'CORPORATION', 'CO',
  'COMPANY', 'PC', 'PLLC', 'PA', 'DBA',
]);

/** Punctuation that closes a name up rather than splitting it: L.L.C. → LLC, O'Brien → OBRIEN. */
const CLOSING_PUNCTUATION = /['’.,]/g;
/** Everything else becomes a space: SMITH/JONES → SMITH JONES. */
const SPLITTING_PUNCTUATION = /[^A-Z0-9\s]/g;

export function normalizeName(raw: string): string {
  let text = raw.toUpperCase();
  text = text.replace(/&/g, ' AND ');
  text = text.replace(CLOSING_PUNCTUATION, '');
  text = text.replace(SPLITTING_PUNCTUATION, ' ');
  text = text.replace(/\s+/g, ' ').trim();

  if (text.startsWith('THE ')) text = text.slice(4).trim();

  // Strip trailing entity suffixes repeatedly — "PLUMBING CO INC" is still "PLUMBING".
  let parts = text.split(' ').filter(Boolean);
  while (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (last === undefined || !ENTITY_SUFFIXES.has(last)) break;
    parts = parts.slice(0, -1);
  }

  return parts.join(' ');
}

/** True when two names normalize to the same string — an exact match after cleanup. */
export function isSameNormalizedName(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b) && normalizeName(a) !== '';
}
