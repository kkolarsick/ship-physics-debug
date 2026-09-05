import { compareDates, maxDate, minDate, addDays } from '@/lib/dates';
import type { CertificateInput, CoverageWindow } from './types';

/**
 * Coverage windows come off the certificates on file. A certificate with no WC section,
 * or with a missing effective/expiration date, produces no window — it cannot evidence a
 * period, so it cannot cover a payment.
 */
export function windowsFromCertificates(
  subcontractorId: string,
  certificates: readonly CertificateInput[],
): CoverageWindow[] {
  const windows: CoverageWindow[] = [];
  for (const certificate of certificates) {
    if (certificate.subcontractorId !== subcontractorId) continue;
    if (!certificate.wcPresent) continue;
    const { wcEffective, wcExpiration } = certificate;
    if (!wcEffective || !wcExpiration) continue;
    if (compareDates(wcEffective, wcExpiration) > 0) continue;
    windows.push({ from: wcEffective, to: wcExpiration, certificateIds: [certificate.id] });
  }
  return mergeOverlappingWindows(windows);
}

/**
 * Merge overlapping and adjacent windows so two certificates that both cover April do not
 * count April twice. Adjacent means the next window starts the day after the previous one
 * ends — a renewal with no gap is continuous coverage, not two spans with a hole.
 */
export function mergeOverlappingWindows(
  windows: readonly CoverageWindow[],
): CoverageWindow[] {
  if (windows.length === 0) return [];
  const sorted = [...windows].sort(
    (a, b) => compareDates(a.from, b.from) || compareDates(a.to, b.to),
  );

  const merged: CoverageWindow[] = [];
  for (const window of sorted) {
    const last = merged[merged.length - 1];
    if (last && compareDates(window.from, addDays(last.to, 1)) <= 0) {
      merged[merged.length - 1] = {
        from: minDate(last.from, window.from),
        to: maxDate(last.to, window.to),
        certificateIds: dedupe([...last.certificateIds, ...window.certificateIds]),
      };
      continue;
    }
    merged.push({ ...window, certificateIds: dedupe(window.certificateIds) });
  }
  return merged;
}

/** Clip windows to the policy term, for drawing a timeline that starts and ends at the term. */
export function clipToTerm(
  windows: readonly CoverageWindow[],
  termStart: string,
  termEnd: string,
): CoverageWindow[] {
  const clipped: CoverageWindow[] = [];
  for (const window of windows) {
    const from = maxDate(window.from, termStart);
    const to = minDate(window.to, termEnd);
    if (compareDates(from, to) <= 0) clipped.push({ ...window, from, to });
  }
  return clipped;
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}
