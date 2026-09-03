import { formatDollars, formatDollarsExact, type Cents } from '@/lib/money';

/**
 * Money is formatted here and nowhere upstream. `exact` is for figures being reconciled
 * against a ledger; the workpaper itself prints whole dollars.
 */
export function Money({
  cents,
  exact = false,
  zero = '—',
  className = '',
}: {
  cents: Cents;
  exact?: boolean;
  zero?: string;
  className?: string;
}) {
  if (cents === 0 && zero !== null) {
    return <span className={`tabular-nums text-ink-faint ${className}`}>{zero}</span>;
  }
  return (
    <span className={`tabular-nums ${className}`} title={formatDollarsExact(cents)}>
      {exact ? formatDollarsExact(cents) : formatDollars(cents)}
    </span>
  );
}
