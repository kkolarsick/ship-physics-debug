'use client';

import { Fragment, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  refreshChaseListAction,
  resolveChaseItemAction,
  sendChaseEmailAction,
} from '@/app/actions';
import { Money } from '@/components/Money';
import { CHASE_ASK_DESCRIPTIONS, CHASE_ASK_LABELS } from '@/lib/chase/templates';
import { formatDollars } from '@/lib/money';
import type { ChaseAsk, ChaseStatus } from '@/lib/chase/types';

/**
 * The chase list (brief §7, §8.7).
 *
 * Ranked by dollars removed per phone call. Nothing sends without the draft being read —
 * the send button is on the editor, not on the row.
 */
export interface ChaseRow {
  id: string;
  subcontractorId: string;
  subcontractorName: string;
  ask: ChaseAsk;
  status: ChaseStatus;
  exposureAtOpen: number;
  currentExposure: number;
  exposureRemoved: number | null;
  sentTo: string | null;
  suggestedTo: string;
  subject: string;
  body: string;
  resolutionNote: string | null;
}

const STATUS_LABELS: Record<ChaseStatus, string> = {
  open: 'Open',
  sent: 'Sent',
  responded: 'Responded',
  resolved: 'Resolved',
  dead: 'Closed unresolved',
};

export function ChaseList({
  rows,
  eliminated,
  openBalance,
  hasExposure,
}: {
  rows: readonly ChaseRow[];
  eliminated: number;
  openBalance: number;
  hasExposure: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openDraft, setOpenDraft] = useState<string | null>(null);

  const open = rows.filter((row) => row.status !== 'resolved' && row.status !== 'dead');
  const closed = rows.filter((row) => row.status === 'resolved' || row.status === 'dead');

  return (
    <div className="space-y-6">
      <section className="panel">
        <div className="grid gap-px bg-rule sm:grid-cols-2">
          <div className="bg-card px-5 py-5">
            <p className="label">Removed to date</p>
            <p className="mt-1 text-4xl font-semibold leading-none tracking-tight text-cleared">
              {formatDollars(eliminated)}
            </p>
            <p className="mt-1.5 text-2xs text-ink-faint">
              Recomputed at resolution from the documents on file, not from the snapshot.
            </p>
          </div>
          <div className="bg-card px-5 py-5">
            <p className="label">Still on the table</p>
            <p className="mt-1 text-4xl font-semibold leading-none tracking-tight text-risk">
              {formatDollars(openBalance)}
            </p>
            <p className="mt-1.5 text-2xs text-ink-faint">
              {open.length} open ask{open.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-rule px-5 py-3">
          <button
            type="button"
            className="btn-quiet"
            disabled={pending || !hasExposure}
            onClick={() =>
              startTransition(async () => {
                await refreshChaseListAction();
                router.refresh();
              })
            }
          >
            {rows.length === 0 ? 'Build the chase list' : 'Refresh against current figures'}
          </button>
          <p className="text-2xs text-ink-faint">
            Anything already sent keeps its history. Only untouched asks are re-priced.
          </p>
        </div>
      </section>

      {rows.length === 0 ? (
        <p className="panel px-5 py-6 text-sm text-ink-muted">
          {hasExposure
            ? 'No asks built yet. Build the list and it fills with what is worth asking for, biggest dollars first.'
            : 'Nothing to chase — no payments in this term sit outside a covered window.'}
        </p>
      ) : null}

      {open.length > 0 ? (
        <section className="panel">
          <div className="panel-head">
            <h2 className="text-sm font-semibold">Open asks</h2>
            <p className="text-2xs text-ink-faint">Dollars removed per call, descending</p>
          </div>
          <table className="workpaper-table">
            <thead>
              <tr>
                <th>Subcontractor</th>
                <th>Ask</th>
                <th className="text-right">Worth</th>
                <th>Status</th>
                <th className="w-72">Next step</th>
              </tr>
            </thead>
            <tbody>
              {open.map((row) => (
                <Fragment key={row.id}>
                  <tr>
                    <td className="font-medium">{row.subcontractorName}</td>
                    <td>
                      <p>{CHASE_ASK_LABELS[row.ask]}</p>
                      <p className="mt-0.5 text-2xs text-ink-faint">
                        {CHASE_ASK_DESCRIPTIONS[row.ask]}
                      </p>
                    </td>
                    <td className="num font-semibold text-risk">
                      <Money cents={row.exposureAtOpen} />
                    </td>
                    <td className="text-ink-muted">
                      {STATUS_LABELS[row.status]}
                      {row.sentTo ? (
                        <span className="block text-2xs text-ink-faint">{row.sentTo}</span>
                      ) : null}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          className="border border-rule-strong bg-white px-2 py-1 text-2xs transition hover:border-ink"
                          onClick={() => setOpenDraft(openDraft === row.id ? null : row.id)}
                        >
                          {openDraft === row.id ? 'Close draft' : 'Draft the email'}
                        </button>
                        {(['responded', 'resolved', 'dead'] as ChaseStatus[]).map((status) => (
                          <button
                            key={status}
                            type="button"
                            disabled={pending}
                            className="border border-rule-strong bg-white px-2 py-1 text-2xs text-ink-muted transition hover:border-ink hover:text-ink"
                            onClick={() =>
                              startTransition(async () => {
                                await resolveChaseItemAction({ chaseItemId: row.id, status });
                                router.refresh();
                              })
                            }
                          >
                            {STATUS_LABELS[status]}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                  {openDraft === row.id ? (
                    <tr>
                      <td colSpan={5} className="bg-paper">
                        <DraftEditor row={row} onSent={() => setOpenDraft(null)} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {closed.length > 0 ? (
        <section className="panel">
          <div className="panel-head">
            <h2 className="text-sm font-semibold">Closed</h2>
          </div>
          <table className="workpaper-table">
            <thead>
              <tr>
                <th>Subcontractor</th>
                <th>Ask</th>
                <th className="text-right">Worth when opened</th>
                <th className="text-right">Removed</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {closed.map((row) => (
                <tr key={row.id}>
                  <td className="font-medium">{row.subcontractorName}</td>
                  <td>{CHASE_ASK_LABELS[row.ask]}</td>
                  <td className="num">
                    <Money cents={row.exposureAtOpen} />
                  </td>
                  <td className="num font-semibold text-cleared">
                    <Money cents={row.exposureRemoved ?? 0} />
                  </td>
                  <td className="text-ink-muted">
                    {STATUS_LABELS[row.status]}
                    {row.resolutionNote ? ` — ${row.resolutionNote}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

function DraftEditor({ row, onSent }: { row: ChaseRow; onSent: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [to, setTo] = useState(row.sentTo ?? row.suggestedTo);
  const [subject, setSubject] = useState(row.subject);
  const [body, setBody] = useState(row.body);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-3 px-4 py-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <label className="block">
          <span className="label">To</span>
          <input
            className="field mt-1"
            type="email"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder="name@example.com"
          />
        </label>
        <label className="block">
          <span className="label">Subject</span>
          <input
            className="field mt-1"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </label>
      </div>
      <label className="block">
        <span className="label">Message</span>
        <textarea
          className="field mt-1 min-h-64 font-mono text-2xs leading-relaxed"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn"
          disabled={pending || to.trim() === ''}
          onClick={() =>
            startTransition(async () => {
              const result = await sendChaseEmailAction({
                chaseItemId: row.id,
                to,
                subject,
                body,
              });
              setMessage(result.message ?? (result.ok ? 'Sent.' : 'Could not send.'));
              if (result.ok) {
                router.refresh();
                onSent();
              }
            })
          }
        >
          {pending ? 'Sending…' : 'Send'}
        </button>
        <p className="text-2xs text-ink-faint">
          Read it before it goes. Nothing sends from this app that you have not seen.
        </p>
        {message ? <p className="text-2xs text-ink-muted">{message}</p> : null}
      </div>
    </div>
  );
}
