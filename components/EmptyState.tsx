import Link from 'next/link';

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="panel px-5 py-8">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1.5 max-w-xl text-sm text-ink-muted">{body}</p>
      {action ? (
        <Link href={action.href} className="btn mt-4">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
