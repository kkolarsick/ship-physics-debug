'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { importLedgerAction } from '@/app/actions';
import { Money } from '@/components/Money';
import {
  buildImportPreview,
  EXCLUSION_LABELS,
  sniffTable,
  suggestMapping,
  type ExclusionReason,
  type ImportPreview,
  type SniffedTable,
} from '@/lib/ingest/csv';
import { LEDGER_PRESETS, presetById } from '@/lib/ingest/presets';
import type { ColumnMapping } from '@/lib/schemas';

/**
 * CSV import (brief §8.2, §4a).
 *
 * The preview runs in the browser with the same pure functions the server uses, so the
 * mapping step is instant. Nothing the browser computed is trusted: on confirm the raw
 * CSV goes to the server, which re-parses it and writes from its own result.
 */
export function ImportWizard({
  policyId,
  termStart,
  termEnd,
}: {
  policyId: string;
  termStart: string;
  termEnd: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [presetId, setPresetId] = useState(LEDGER_PRESETS[0]!.id);
  const [filename, setFilename] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [table, setTable] = useState<SniffedTable | null>(null);
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const preview: ImportPreview | null = useMemo(() => {
    if (!table || !mapping.vendorName || !mapping.paidOn || !mapping.amount) return null;
    return buildImportPreview({
      table,
      mapping: mapping as ColumnMapping,
      termStart,
      termEnd,
    });
  }, [table, mapping, termStart, termEnd]);

  async function onFile(file: File): Promise<void> {
    const text = await file.text();
    const sniffed = sniffTable(text);
    setFilename(file.name);
    setCsv(text);
    setTable(sniffed);
    setMapping(suggestMapping(sniffed.headers, presetId));
    setMessage(null);
  }

  function onPreset(nextPreset: string): void {
    setPresetId(nextPreset);
    if (table) setMapping(suggestMapping(table.headers, nextPreset));
  }

  function confirm(): void {
    if (!csv || !filename || !preview) return;
    startTransition(async () => {
      const result = await importLedgerAction({
        policyId,
        filename,
        preset: presetId,
        mapping,
        csv,
      });
      setMessage({ ok: result.ok, text: result.message ?? (result.ok ? 'Imported.' : 'Import failed.') });
      if (result.ok) {
        setCsv(null);
        setTable(null);
        setFilename(null);
        router.push('/triage');
      }
    });
  }

  return (
    <div className="space-y-5">
      <section className="panel">
        <div className="panel-head">
          <h1 className="text-sm font-semibold">Import a payment ledger</h1>
          <p className="text-2xs text-ink-faint">
            Payments dated outside {termStart} – {termEnd} are excluded and counted.
          </p>
        </div>

        <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
          <label className="block">
            <span className="label">Where the file came from</span>
            <select
              className="field mt-1"
              value={presetId}
              onChange={(event) => onPreset(event.target.value)}
            >
              {LEDGER_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-2xs text-ink-faint">{presetById(presetId).hint}</span>
          </label>

          <label className="block">
            <span className="label">CSV file</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="field mt-1 file:mr-3 file:border-0 file:bg-transparent file:text-sm file:text-ink-muted"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onFile(file);
              }}
            />
            <span className="mt-1 block text-2xs text-ink-faint">
              {filename ? `${filename} loaded` : 'Nothing loaded yet.'}
            </span>
          </label>
        </div>
      </section>

      {table ? (
        <section className="panel">
          <div className="panel-head">
            <h2 className="text-sm font-semibold">Map the columns</h2>
            <p className="text-2xs text-ink-faint">
              Header found on row {table.headerRowIndex + 1}
              {table.preambleRows.length > 0
                ? `, after ${table.preambleRows.length} report heading ${table.preambleRows.length === 1 ? 'row' : 'rows'}`
                : ''}
            </p>
          </div>

          <div className="grid gap-4 px-5 py-5 sm:grid-cols-3">
            <MapField
              label="Vendor name"
              required
              headers={table.headers}
              value={mapping.vendorName}
              onChange={(value) => setMapping((prev) => ({ ...prev, vendorName: value }))}
              hint="On grouped reports the vendor is a heading row — map the same column as the date."
            />
            <MapField
              label="Payment date"
              required
              headers={table.headers}
              value={mapping.paidOn}
              onChange={(value) => setMapping((prev) => ({ ...prev, paidOn: value }))}
              hint="The date the payment cleared."
            />
            <MapField
              label="Amount"
              required
              headers={table.headers}
              value={mapping.amount}
              onChange={(value) => setMapping((prev) => ({ ...prev, amount: value }))}
              hint="Credits and voids are excluded automatically."
            />
            <MapField
              label="Invoice or check number"
              headers={table.headers}
              value={mapping.sourceRef}
              onChange={(value) => setMapping((prev) => ({ ...prev, sourceRef: value }))}
              hint="Optional. Traces a figure back to the ledger line."
            />
            <MapField
              label="Memo"
              headers={table.headers}
              value={mapping.memo}
              onChange={(value) => setMapping((prev) => ({ ...prev, memo: value }))}
              hint="Optional."
            />
          </div>
        </section>
      ) : null}

      {preview ? (
        <>
          <section className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="panel">
              <div className="panel-head">
                <h2 className="text-sm font-semibold">
                  {preview.vendors.length} vendors, {preview.payments.length} payments
                </h2>
                <p className="text-2xs text-ink-faint">Dollars descending</p>
              </div>
              <div className="max-h-80 overflow-auto">
                <table className="workpaper-table">
                  <thead className="sticky top-0 bg-card">
                    <tr>
                      <th>Vendor</th>
                      <th className="text-right">Payments</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.vendors.map((vendor) => (
                      <tr key={vendor.vendorName}>
                        <td>{vendor.vendorName}</td>
                        <td className="num">{vendor.paymentCount}</td>
                        <td className="num">
                          <Money cents={vendor.total} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-ink">
                      <td className="px-3 py-2 text-2xs font-semibold uppercase tracking-wider">
                        Total to import
                      </td>
                      <td className="num px-3 py-2">{preview.payments.length}</td>
                      <td className="num px-3 py-2 font-semibold">
                        <Money cents={preview.importedTotal} />
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h2 className="text-sm font-semibold">Not imported</h2>
                <p className="text-2xs text-ink-faint">{preview.excluded.length} rows</p>
              </div>
              <table className="workpaper-table">
                <tbody>
                  {(Object.keys(EXCLUSION_LABELS) as ExclusionReason[])
                    .filter((reason) => preview.excludedCounts[reason] > 0)
                    .map((reason) => (
                      <tr key={reason}>
                        <td>{EXCLUSION_LABELS[reason]}</td>
                        <td className="num">{preview.excludedCounts[reason]}</td>
                      </tr>
                    ))}
                  {preview.excluded.length === 0 ? (
                    <tr>
                      <td className="py-4 text-center text-sm text-ink-muted">
                        Every row was imported.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              <p className="border-t border-rule px-4 py-3 text-2xs text-ink-faint">
                Credits and voids are a common source of overstated exposure, so they are counted
                here rather than netted into the totals.
              </p>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-4">
            <button type="button" className="btn" onClick={confirm} disabled={pending}>
              {pending ? 'Importing…' : `Import ${preview.payments.length} payments`}
            </button>
            {message ? (
              <p className={`text-sm ${message.ok ? 'text-cleared' : 'text-risk'}`}>{message.text}</p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function MapField({
  label,
  headers,
  value,
  onChange,
  hint,
  required = false,
}: {
  label: string;
  headers: readonly string[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  hint: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required ? <span className="text-risk"> *</span> : null}
      </span>
      <select
        className="field mt-1"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
      >
        <option value="">Not mapped</option>
        {headers.map((header) => (
          <option key={header} value={header}>
            {header}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-2xs text-ink-faint">{hint}</span>
    </label>
  );
}
