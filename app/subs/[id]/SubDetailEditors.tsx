'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  patchSubcontractorAction,
  saveManualCertificateAction,
  setMaterialSplitAction,
} from '@/app/actions';
import { Money } from '@/components/Money';
import { formatUsDate } from '@/lib/dates';
import { formatScaled } from '@/lib/money';
import type { ClassCodeRateRecord } from '@/lib/db/types';
import type { EntityType, MaterialEvidence } from '@/lib/exposure/types';

/**
 * The three things a contractor changes on this screen, all of which move the figure:
 * how the business is set up, what a payment's original invoice actually shows, and the
 * coverage dates on a certificate they are holding in their hand.
 */
export interface EditablePayment {
  id: string;
  paidOn: string;
  amount: number;
  sourceRef: string | null;
  materialAmount: number | null;
  materialEvidence: MaterialEvidence;
  covered: boolean;
}

const ENTITY_LABELS: Record<EntityType, string> = {
  unknown: 'Not recorded',
  corporation: 'Corporation',
  llc: 'LLC',
  partnership: 'Partnership',
  sole_proprietor: 'Sole proprietor',
};

const EVIDENCE_LABELS: Record<MaterialEvidence, string> = {
  none: 'No split invoice on file',
  original_invoice: 'Original invoice on file',
  contract_schedule: 'Contract schedule only',
};

export function SubDetailEditors({
  subcontractorId,
  subcontractorName,
  entityType,
  trade,
  notes,
  classCodeRates,
  payments,
}: {
  subcontractorId: string;
  subcontractorName: string;
  entityType: EntityType;
  trade: string | null;
  notes: string | null;
  classCodeRates: readonly ClassCodeRateRecord[];
  payments: readonly EditablePayment[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function refresh(): void {
    startTransition(() => router.refresh());
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="panel">
        <div className="panel-head">
          <h2 className="text-sm font-semibold">Payments in the term</h2>
          <p className="text-2xs text-ink-faint">
            A material deduction needs the original invoice, and is capped at half.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="workpaper-table">
            <thead>
              <tr>
                <th>Paid</th>
                <th>Reference</th>
                <th className="text-right">Amount</th>
                <th>Against coverage</th>
                <th className="w-64">Material on the original invoice</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <PaymentRow key={payment.id} payment={payment} onSaved={refresh} />
              ))}
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-5 text-center text-sm text-ink-muted">
                    No payments to this vendor inside the policy term.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="space-y-5">
        <section className="panel">
          <div className="panel-head">
            <h2 className="text-sm font-semibold">How this business is set up</h2>
          </div>
          <div className="space-y-3 px-4 py-4">
            <label className="block">
              <span className="label">Entity type</span>
              <select
                className="field mt-1"
                defaultValue={entityType}
                onChange={(event) =>
                  startTransition(async () => {
                    await patchSubcontractorAction({
                      subcontractorId,
                      entityType: event.target.value,
                    });
                    router.refresh();
                  })
                }
              >
                {(Object.keys(ENTITY_LABELS) as EntityType[]).map((value) => (
                  <option key={value} value={value}>
                    {ENTITY_LABELS[value]}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-2xs text-ink-faint">
                Recording a sole proprietor raises a question for your auditor. It never changes a
                dollar on its own.
              </span>
            </label>

            <label className="block">
              <span className="label">Class code rate</span>
              <select
                className="field mt-1"
                defaultValue=""
                onChange={(event) =>
                  startTransition(async () => {
                    await patchSubcontractorAction({
                      subcontractorId,
                      classCodeRateId: event.target.value === '' ? null : event.target.value,
                    });
                    router.refresh();
                  })
                }
              >
                <option value="">Use the governing rate</option>
                {classCodeRates.map((rate) => (
                  <option key={rate.id} value={rate.id}>
                    {rate.classCode} — {rate.label ?? 'no label'} @{' '}
                    {formatScaled(rate.rate, 10_000, 2)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="label">Trade</span>
              <input
                className="field mt-1"
                defaultValue={trade ?? ''}
                onBlur={(event) =>
                  startTransition(async () => {
                    await patchSubcontractorAction({
                      subcontractorId,
                      trade: event.target.value,
                    });
                    router.refresh();
                  })
                }
              />
            </label>

            <label className="block">
              <span className="label">Notes</span>
              <textarea
                className="field mt-1 min-h-20"
                defaultValue={notes ?? ''}
                onBlur={(event) =>
                  startTransition(async () => {
                    await patchSubcontractorAction({
                      subcontractorId,
                      notes: event.target.value,
                    });
                    router.refresh();
                  })
                }
              />
            </label>
          </div>
        </section>

        <ManualCertificate
          subcontractorId={subcontractorId}
          subcontractorName={subcontractorName}
          onSaved={refresh}
        />
      </div>
    </div>
  );
}

function PaymentRow({
  payment,
  onSaved,
}: {
  payment: EditablePayment;
  onSaved: () => void;
}) {
  const [evidence, setEvidence] = useState<MaterialEvidence>(payment.materialEvidence);
  const [amount, setAmount] = useState(
    payment.materialAmount === null ? '' : formatScaled(payment.materialAmount, 100, 2),
  );
  const [pending, startTransition] = useTransition();

  function save(nextEvidence: MaterialEvidence, nextAmount: string): void {
    startTransition(async () => {
      await setMaterialSplitAction({
        paymentId: payment.id,
        materialAmount: nextEvidence === 'none' ? null : nextAmount === '' ? null : nextAmount,
        materialEvidence: nextEvidence,
      });
      onSaved();
    });
  }

  return (
    <tr>
      <td>{formatUsDate(payment.paidOn)}</td>
      <td className="text-ink-muted">{payment.sourceRef ?? '—'}</td>
      <td className="num">
        <Money cents={payment.amount} />
      </td>
      <td className={payment.covered ? 'text-cleared' : 'text-risk'}>
        {payment.covered ? 'Inside a window' : 'Outside every window'}
      </td>
      <td>
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            className="field w-full max-w-[13rem] py-1 text-2xs"
            value={evidence}
            disabled={pending}
            onChange={(event) => {
              const next = event.target.value as MaterialEvidence;
              setEvidence(next);
              save(next, amount);
            }}
          >
            {(Object.keys(EVIDENCE_LABELS) as MaterialEvidence[]).map((value) => (
              <option key={value} value={value}>
                {EVIDENCE_LABELS[value]}
              </option>
            ))}
          </select>
          {evidence !== 'none' ? (
            <input
              className="field w-28 py-1 text-2xs"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              disabled={pending}
              onChange={(event) => setAmount(event.target.value)}
              onBlur={() => save(evidence, amount)}
            />
          ) : null}
        </div>
        {evidence === 'contract_schedule' ? (
          <p className="mt-1 text-2xs text-ink-faint">
            Recorded, but a contract schedule does not support a deduction in this model.
          </p>
        ) : null}
      </td>
    </tr>
  );
}

function ManualCertificate({
  subcontractorId,
  subcontractorName,
  onSaved,
}: {
  subcontractorId: string;
  subcontractorName: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [wcPresent, setWcPresent] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="text-sm font-semibold">Record a certificate by hand</h2>
        <button type="button" className="text-2xs text-ink-muted hover:text-ink" onClick={() => setOpen((prev) => !prev)}>
          {open ? 'Close' : 'Open'}
        </button>
      </div>

      {open ? (
        <form
          className="space-y-3 px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            startTransition(async () => {
              const result = await saveManualCertificateAction({
                subcontractorId,
                namedInsured: String(form.get('namedInsured') ?? ''),
                wcPresent,
                wcCarrier: String(form.get('wcCarrier') ?? ''),
                wcPolicyNumber: String(form.get('wcPolicyNumber') ?? ''),
                wcEffective: wcPresent ? String(form.get('wcEffective') ?? '') : null,
                wcExpiration: wcPresent ? String(form.get('wcExpiration') ?? '') : null,
                wcOfficerExclusionNoted: form.get('officerExclusion') === 'on',
                glPresent: form.get('glPresent') === 'on',
              });
              setMessage(result.message ?? (result.ok ? 'Saved.' : 'Check the fields.'));
              if (result.ok) onSaved();
            });
          }}
        >
          <label className="block">
            <span className="label">Name in the INSURED box</span>
            <input className="field mt-1" name="namedInsured" defaultValue={subcontractorName} />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={wcPresent}
              onChange={(event) => setWcPresent(event.target.checked)}
            />
            The workers’ comp section has a policy number or limits
          </label>

          {wcPresent ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="label">Effective</span>
                  <input className="field mt-1" type="date" name="wcEffective" />
                </label>
                <label className="block">
                  <span className="label">Expires</span>
                  <input className="field mt-1" type="date" name="wcExpiration" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="label">Carrier</span>
                  <input className="field mt-1" name="wcCarrier" />
                </label>
                <label className="block">
                  <span className="label">Policy number</span>
                  <input className="field mt-1" name="wcPolicyNumber" />
                </label>
              </div>
            </>
          ) : null}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="officerExclusion" />
            An owner, officer, member, or partner exclusion is noted
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="glPresent" />
            General liability is also shown
          </label>

          <div className="flex items-center gap-3">
            <button type="submit" className="btn" disabled={pending}>
              {pending ? 'Saving…' : 'Record it'}
            </button>
            {message ? <span className="text-2xs text-ink-muted">{message}</span> : null}
          </div>

          <p className="text-2xs text-ink-faint">
            Coverage recorded here reflects the document in front of you. It is not confirmed with
            any insurer.
          </p>
        </form>
      ) : (
        <p className="px-4 py-3 text-2xs text-ink-faint">
          Have a certificate in hand? Enter its dates here — this is the path that works before
          PDF extraction is set up.
        </p>
      )}
    </section>
  );
}
