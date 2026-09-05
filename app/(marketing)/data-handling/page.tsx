import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Data retention and deletion — SubLedger',
  description:
    'What SubLedger keeps, for how long, why an audit trail is append-only, and how to have your data deleted.',
};

export default function DataHandlingPage() {
  return (
    <div className="mx-auto max-w-3xl px-5">
      <section className="border-b border-rule py-14">
        <p className="label">Data retention and deletion</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight">
          What is kept, why, and how to get rid of it.
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-muted">
          SubLedger keeps more than a calculator would, and for a reason: a figure that goes
          to an auditor has to be defensible months later. That reason has limits, and this
          page states them.
        </p>
      </section>

      <div className="space-y-10 py-12 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold tracking-tight">What is retained, and why</h2>
          <dl className="mt-3 space-y-4 text-ink-muted">
            {[
              {
                term: 'The ledger file as you uploaded it',
                detail:
                  'So a figure can always be traced back to the source rather than to a parsed copy of it. An import can be rolled back whole.',
              },
              {
                term: 'Certificates and the fields read from them',
                detail:
                  'They are the evidence for every coverage period the estimate relies on. Without the document, the date behind a figure is just an assertion.',
              },
              {
                term: 'Saved figures and exports',
                detail:
                  'Each records the ruleset and version that produced it. These are append-only: a later ruleset never rewrites a number you were already shown.',
              },
              {
                term: 'An audit trail of anything that changed a number',
                detail:
                  'Who changed what, and when, with the before and after. Also append-only, for the same reason.',
              },
            ].map((item) => (
              <div key={item.term} className="border-l-2 border-rule pl-4">
                <dt className="font-medium text-ink">{item.term}</dt>
                <dd className="mt-0.5">{item.detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            What “append-only” means for deletion
          </h2>
          <p className="mt-3 text-ink-muted">
            While your organization exists, individual saved figures and audit events cannot
            be edited or removed — that is what makes them worth anything in a dispute. It
            is not a way of holding your data: deleting the organization removes all of it,
            including that history.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">How to have your data deleted</h2>
          <p className="mt-3 text-ink-muted">
            Ask, and we delete it. Deleting an organization cascades through every record
            scoped to it — policies, vendors, payments, certificates, saved figures, the
            audit trail — and the stored ledger and certificate files with them. Take your
            exports first: the workpaper and the detail workbook contain everything
            SubLedger computed and do not depend on us to remain readable.
          </p>
          <p className="mt-3 text-ink-muted">
            Deletion is by request today rather than a button in the product. When it
            becomes self-serve this page will say so.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">Document handling</h2>
          <p className="mt-3 text-ink-muted">
            Certificates are sent to our document-extraction provider only to have their
            fields read, and only when you upload one. Coverage dates can be entered by hand
            instead, and the product is fully usable that way — no document has to leave our
            systems for you to get an estimate.{' '}
            <Link href="/privacy" className="underline underline-offset-2">
              What is collected and what it is used for
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">What we do not ask for</h2>
          <p className="mt-3 text-ink-muted">
            No accounting-system login. No banking connection. No access to anything beyond
            the CSV you choose to export and the documents you choose to upload. A CSV is a
            lower-trust ask than an integration, and that is deliberate.
          </p>
        </section>
      </div>
    </div>
  );
}
