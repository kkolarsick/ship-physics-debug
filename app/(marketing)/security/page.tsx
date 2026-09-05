import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Security — SubLedger',
  description:
    'How SubLedger separates one contractor’s data from another’s, and how that separation is tested.',
};

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-3xl px-5">
      <section className="border-b border-rule py-14">
        <p className="label">Security</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight">
          Your subcontractors’ certificates are not ours to leak.
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-muted">
          A certificate names another company, its carrier, its policy number, and its
          coverage dates. One contractor seeing another’s would end this product, so
          separation is enforced where it cannot be bypassed and is tested rather than
          asserted.
        </p>
      </section>

      <div className="space-y-10 py-12 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold tracking-tight">Separation is in the database</h2>
          <p className="mt-3 text-ink-muted">
            Every table carrying customer data is scoped by organization and protected by
            row-level security. Requests run as the signed-in user, so the database — not
            the application code — is what decides which rows exist. There is no
            service-role key in request handling that could bypass it, and a test fails the
            build if one ever appears.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">Joining an organization is gated</h2>
          <p className="mt-3 text-ink-muted">
            There is no path by which a signed-in user can add themselves to an organization
            they are not already in. Creating a workspace and adding a colleague both go
            through checked server-side functions; knowing an organization’s identifier is
            worth nothing.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">Documents are keyed by organization</h2>
          <p className="mt-3 text-ink-muted">
            Ledgers and certificates live in private storage, never public buckets. Every
            object is stored under its organization, storage policies refuse anything
            filed outside that shape, and files are served through short-lived signed links
            rather than guessable URLs.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">It is tested, not assumed</h2>
          <p className="mt-3 text-ink-muted">
            Every release applies the full schema to a fresh database and then attacks it:
            two accounts, two organizations, and each route one could take to reach the
            other’s data — self-joining, escalating a role, reading and altering
            certificates, reaching stored documents, using the name-matching lookup as a side
            channel, and rewriting saved figures or the audit trail. The suite has been
            checked by deliberately reintroducing a hole to confirm it fails when it should.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">History cannot be rewritten</h2>
          <p className="mt-3 text-ink-muted">
            Saved figures and the audit trail are append-only in the schema itself. A figure
            you were shown in March keeps its inputs, its assumptions, and the ruleset
            version that produced it, even after that ruleset is superseded.{' '}
            <Link href="/methodology" className="underline underline-offset-2">
              How reproducibility works
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
