'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { setTriageAction } from '@/app/actions';
import { Money } from '@/components/Money';
import type { TriageDecision } from '@/lib/exposure/types';

/**
 * Vendor triage (brief §8.3, §4a).
 *
 * Nothing here guesses whether a vendor is a supplier or a labor sub — a classifier would
 * be wrong often enough to destroy trust, and a lumber yard priced as exposure is worse
 * than an unanswered question. So the contractor decides, one keystroke per row, dollars
 * descending, and the decision persists so a re-import remembers it.
 */
export interface TriageRow {
  id: string;
  name: string;
  trade: string | null;
  triage: TriageDecision;
  paidTotal: number;
  paymentCount: number;
  hasCertificate: boolean;
}

const CHOICES: { key: string; value: TriageDecision; label: string }[] = [
  { key: '1', value: 'subcontractor', label: 'Subcontractor' },
  { key: '2', value: 'supplier', label: 'Supplier (no labor)' },
  { key: '3', value: 'not_applicable', label: 'Not applicable' },
];

export function TriageBoard({ rows }: { rows: readonly TriageRow[] }) {
  const [local, setLocal] = useState<Record<string, TriageDecision>>({});
  const [cursor, setCursor] = useState(() => {
    const first = rows.findIndex((row) => row.triage === 'undecided');
    return first < 0 ? 0 : first;
  });
  const [, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  const decisions = useMemo(
    () =>
      rows.map((row) => ({ ...row, triage: local[row.id] ?? row.triage })),
    [rows, local],
  );

  const remaining = decisions.filter((row) => row.triage === 'undecided').length;
  const remainingDollars = decisions
    .filter((row) => row.triage === 'undecided')
    .reduce((total, row) => total + row.paidTotal, 0);

  const decide = useCallback(
    (index: number, value: TriageDecision) => {
      const row = rows[index];
      if (!row) return;
      setLocal((prev) => ({ ...prev, [row.id]: value }));
      setCursor((prev) => Math.min(prev + 1, rows.length - 1));
      startTransition(async () => {
        await setTriageAction({ subcontractorId: row.id, triage: value });
      });
    },
    [rows],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      const choice = CHOICES.find((entry) => entry.key === event.key);
      if (choice) {
        event.preventDefault();
        decide(cursor, choice.value);
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'j') {
        event.preventDefault();
        setCursor((prev) => Math.min(prev + 1, rows.length - 1));
      }
      if (event.key === 'ArrowUp' || event.key === 'k') {
        event.preventDefault();
        setCursor((prev) => Math.max(prev - 1, 0));
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cursor, decide, rows.length]);

  useEffect(() => {
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  return (
    <div className="space-y-4">
      <section className="panel">
        <div className="panel-head">
          <h1 className="text-sm font-semibold">Vendor triage</h1>
          <p className="text-2xs text-ink-faint">
            {remaining === 0 ? (
              'Every vendor has a decision.'
            ) : (
              <>
                {remaining} left · <Money cents={remainingDollars} /> undecided
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 text-2xs text-ink-muted">
          {CHOICES.map((choice) => (
            <span key={choice.key} className="inline-flex items-center gap-1.5">
              <span className="kbd">{choice.key}</span> {choice.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> move
          </span>
          <span>Until a vendor is triaged it is priced as subcontracted labor.</span>
        </div>
      </section>

      <div ref={containerRef} className="panel overflow-x-auto">
        <table className="workpaper-table">
          <thead>
            <tr>
              <th className="w-8" />
              <th>Vendor</th>
              <th className="text-right">Payments</th>
              <th className="text-right">Paid in term</th>
              <th>Certificate</th>
              <th className="w-[24rem]">Decision</th>
            </tr>
          </thead>
          <tbody>
            {decisions.map((row, index) => (
              <tr
                key={row.id}
                data-index={index}
                onClick={() => setCursor(index)}
                className={index === cursor ? 'bg-paper outline outline-1 outline-ink/25' : ''}
              >
                <td className="text-center text-ink-faint">{index === cursor ? '▸' : ''}</td>
                <td>
                  <span className="font-medium">{row.name}</span>
                  {row.trade ? (
                    <span className="ml-2 text-2xs text-ink-faint">{row.trade}</span>
                  ) : null}
                </td>
                <td className="num">{row.paymentCount}</td>
                <td className="num">
                  <Money cents={row.paidTotal} />
                </td>
                <td className="text-ink-muted">{row.hasCertificate ? 'On file' : 'None on file'}</td>
                <td>
                  <div className="flex flex-wrap gap-1.5 whitespace-nowrap">
                    {CHOICES.map((choice) => {
                      const active = row.triage === choice.value;
                      return (
                        <button
                          key={choice.value}
                          type="button"
                          onClick={() => decide(index, choice.value)}
                          className={
                            active
                              ? 'border border-ink bg-ink px-2 py-1 text-2xs font-medium text-paper'
                              : 'border border-rule-strong bg-white px-2 py-1 text-2xs text-ink-muted transition hover:border-ink hover:text-ink'
                          }
                        >
                          {choice.label}
                        </button>
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
