import Link from 'next/link';
import { DISCLAIMER } from '@/lib/copy';

const NAV = [
  { href: '/supported-states', label: 'Supported states' },
  { href: '/methodology', label: 'How the estimate works' },
  { href: '/pricing', label: 'Pricing' },
];

const FOOTER = [
  { href: '/supported-states', label: 'Supported states' },
  { href: '/methodology', label: 'Estimate methodology' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/security', label: 'Security' },
  { href: '/data-handling', label: 'Data retention and deletion' },
  { href: '/pricing', label: 'Pricing' },
];

/**
 * The public shell. A stranger reaches the pitch, the state pages, the trust pages, and
 * the front of the scan without an account — the site carries the whole sales process, so
 * there is no "book a demo" anywhere in it.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-rule-strong bg-card">
        <div className="mx-auto flex max-w-workpaper flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-3.5">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            SubLedger
          </Link>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-ink-muted transition hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
            <Link href="/scan" className="btn">
              Run a free exposure scan
            </Link>
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="mt-16 border-t border-rule-strong bg-card">
        <div className="mx-auto max-w-workpaper px-5 py-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
            <p className="text-sm font-semibold">SubLedger</p>
            <nav className="flex flex-wrap gap-x-5 gap-y-1 text-2xs">
              {FOOTER.map((item) => (
                <Link key={item.href} href={item.href} className="text-ink-muted hover:text-ink">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <p className="mt-5 max-w-3xl text-2xs leading-relaxed text-ink-faint">{DISCLAIMER}</p>
        </div>
      </footer>
    </>
  );
}
