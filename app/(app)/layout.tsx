import Link from 'next/link';
import { loadWorkspace } from '@/lib/app/workspace';
import { TermSwitcher } from '@/components/TermSwitcher';
import { formatUsDate } from '@/lib/dates';
import { formatDollars } from '@/lib/money';

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/exposure', label: 'Exposure' },
  { href: '/subs', label: 'Subcontractors' },
  { href: '/chase', label: 'Chase list' },
  { href: '/certificates', label: 'Certificates' },
  { href: '/import', label: 'Import' },
  { href: '/triage', label: 'Triage' },
  { href: '/export', label: 'Export' },
  { href: '/setup', label: 'Setup' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const workspace = await safeWorkspace();

  return (
    <>
        <header className="no-print border-b border-rule-strong bg-card">
          <div className="mx-auto flex max-w-workpaper flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-5 py-3">
            <div className="flex items-baseline gap-3">
              <Link href="/exposure" className="text-sm font-semibold tracking-tight">
                SubLedger
              </Link>
              <span className="text-2xs text-ink-faint">
                {workspace?.data.org.name ?? 'Set up your policy to begin'}
              </span>
            </div>
            {workspace?.data.policy ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <TermSwitcher
                  policies={workspace.data.policies}
                  selectedId={workspace.data.policy.id}
                />
                <p className="text-2xs text-ink-muted">
                  Audit period {formatUsDate(workspace.data.policy.termStart)} –{' '}
                  {formatUsDate(workspace.data.policy.termEnd)}
                  {workspace.portfolio ? (
                    <>
                      {' · '}
                      <span className="font-semibold text-risk">
                        {formatDollars(workspace.portfolio.totalExposure)} at risk
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
            ) : null}
          </div>
          <nav className="mx-auto flex max-w-workpaper flex-wrap gap-x-5 gap-y-1 border-t border-rule px-5 py-2 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-ink-muted transition hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        <main className="mx-auto max-w-workpaper px-5 py-7">{children}</main>

        <footer className="no-print mx-auto max-w-workpaper px-5 pb-10 pt-4">
          {workspace?.mode === 'demo' ? (
            <p className="border-l-2 border-note/50 pl-3 text-2xs text-ink-faint">
              Running against the local demo store at <code>.data/demo.json</code>. Set the
              Supabase environment variables to use a real database.
            </p>
          ) : null}
        </footer>
    </>
  );
}

/** The shell renders even before setup exists, and before anyone has signed in. */
async function safeWorkspace() {
  try {
    return await loadWorkspace();
  } catch {
    return null;
  }
}
