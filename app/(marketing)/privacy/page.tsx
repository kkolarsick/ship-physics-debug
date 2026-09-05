import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy — SubLedger',
  description:
    'What SubLedger collects, why, who can see it, and what it is never used for.',
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-5">
      <section className="border-b border-rule py-14">
        <p className="label">Privacy</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight">
          What we hold, and what we do with it.
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-muted">
          You are being asked to upload a subcontractor payment ledger and other companies’
          certificates of insurance. That is real business data about you and about third
          parties, and it deserves a plain answer rather than a policy nobody reads.
        </p>
      </section>

      <div className="space-y-10 py-12 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold tracking-tight">What SubLedger collects</h2>
          <ul className="mt-3 space-y-2 text-ink-muted">
            <li className="border-l-2 border-rule pl-4">
              <span className="font-medium text-ink">Your policy inputs.</span> Term dates,
              carrier, policy number, class code, rate, experience mod, estimated premium,
              and the audit-compliance answers you give. All of it comes off your own
              declarations page.
            </li>
            <li className="border-l-2 border-rule pl-4">
              <span className="font-medium text-ink">Your payment ledger.</span> The CSV you
              upload, kept as you uploaded it, plus the vendor names, dates, and amounts
              parsed out of it.
            </li>
            <li className="border-l-2 border-rule pl-4">
              <span className="font-medium text-ink">Certificates you upload.</span> The
              file itself and the fields read from it. These describe your subcontractors,
              not you.
            </li>
            <li className="border-l-2 border-rule pl-4">
              <span className="font-medium text-ink">Your account.</span> An email address.
              There is no password to lose — sign-in is by emailed link.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">What it is used for</h2>
          <p className="mt-3 text-ink-muted">
            Computing your exposure estimate, producing your exports, and drafting the
            document requests you choose to send. That is the whole list.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Whether your data trains any model
          </h2>
          <p className="mt-3 text-ink-muted">
            No. SubLedger does not train models on your ledger, your certificates, or your
            policy inputs, and does not sell or share them with brokers, carriers, or data
            brokers.
          </p>
          <p className="mt-3 text-ink-muted">
            Certificates you upload are sent to our document-extraction provider so their
            fields can be read. They are processed to return that reading and are not used
            by us for any other purpose. If you would rather no document left our systems,
            you can enter coverage dates by hand instead — the product is built to work that
            way, and does not require you to upload a single certificate.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">Who can see it</h2>
          <p className="mt-3 text-ink-muted">
            Only people you have added to your organization. Tenant separation is enforced
            in the database rather than in the interface: every query runs as the signed-in
            user, every table is scoped by organization, and stored documents are keyed by
            organization so a link cannot reach across one.{' '}
            <Link href="/security" className="underline underline-offset-2">
              How that is enforced and tested
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">Getting it back, or deleting it</h2>
          <p className="mt-3 text-ink-muted">
            Your exports are yours: the workpaper and the detail workbook contain everything
            SubLedger computed, in formats that outlive us.{' '}
            <Link href="/data-handling" className="underline underline-offset-2">
              What is retained and how to have it deleted
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
