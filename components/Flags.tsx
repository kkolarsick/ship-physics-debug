import { FLAG_LABELS } from '@/lib/exposure/labels';
import type { FlagDetail } from '@/lib/exposure/types';

/**
 * Flags are annotations, never dollar adjustments — each one is a question worth putting
 * to an auditor. They are rendered as plain marks, not as a status or a judgment.
 */
export function FlagList({ flags, compact = false }: { flags: readonly FlagDetail[]; compact?: boolean }) {
  if (flags.length === 0) return <span className="text-ink-faint">—</span>;

  if (compact) {
    return (
      <span className="flex flex-wrap gap-1">
        {flags.map((flag) => (
          <span
            key={flag.flag}
            title={flag.detail}
            className="border border-note/40 bg-note/5 px-1.5 py-0.5 text-2xs text-note"
          >
            {FLAG_LABELS[flag.flag]}
          </span>
        ))}
      </span>
    );
  }

  return (
    <ul className="space-y-2.5">
      {flags.map((flag) => (
        <li key={flag.flag} className="border-l-2 border-note/50 pl-3">
          <p className="text-2xs font-semibold uppercase tracking-wider text-note">
            {FLAG_LABELS[flag.flag]}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">{flag.detail}</p>
        </li>
      ))}
    </ul>
  );
}
