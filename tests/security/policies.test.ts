import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A cheap regression net over the migration set, so `npm run check` catches an obvious
 * reopening of the tenant-isolation hole without needing a database.
 *
 * The real proof is supabase/test/tenant-isolation.test.sql, which applies every migration
 * to a live Postgres and actually attempts the cross-tenant reads and writes. Run it with
 * `npm run test:db`. These assertions are the tripwire, not the test.
 */
const MIGRATIONS_DIR = 'supabase/migrations';

/** Migrations in the order Postgres applies them, so ordering can be reasoned about. */
function migrationsInOrder(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), 'utf8') }));
}

function allMigrations(): string {
  return migrationsInOrder()
    .map((migration) => migration.sql)
    .join('\n');
}

describe('tenant isolation invariants', () => {
  const sql = allMigrations();

  it('leaves no policy that lets a client insert its own org membership', () => {
    // This is the exact shape of the original hole: possession of an org UUID was enough
    // to self-join that tenant, because every other policy trusts is_org_member(). The
    // final effective state is what matters, so this walks the migrations in order.
    const migrations = migrationsInOrder();
    const droppedAt = migrations.findIndex((migration) =>
      migration.sql.includes('drop policy if exists org_members_self_insert on public.org_members'),
    );
    expect(droppedAt, 'the self-insert policy is dropped by some migration').toBeGreaterThan(-1);

    const reintroduced = migrations
      .slice(droppedAt + 1)
      .filter((migration) =>
        /create policy\s+\w+\s+on\s+public\.org_members\s+for\s+(insert|all)/i.test(migration.sql),
      );
    expect(reintroduced.map((migration) => migration.name)).toEqual([]);
  });

  it('leaves no policy that lets any authenticated user create an org row directly', () => {
    expect(sql).toContain('drop policy if exists orgs_insert_any_authenticated on public.orgs');
  });

  it('routes org creation through a SECURITY DEFINER function that reads auth.uid()', () => {
    expect(sql).toMatch(
      /create or replace function public\.create_org_for_current_user[\s\S]*?security definer/,
    );
    expect(sql).toMatch(/create_org_for_current_user[\s\S]*?auth\.uid\(\)/);
    expect(sql).toMatch(/create_org_for_current_user[\s\S]*?raise exception 'authentication required'/);
  });

  it('grants the bootstrap to authenticated only, never to anon or public', () => {
    expect(sql).toContain('grant execute on function public.create_org_for_current_user(text) to authenticated');
    expect(sql).toContain('revoke all on function public.create_org_for_current_user(text) from public, anon');
  });

  it('gates every membership change behind an owner check', () => {
    expect(sql).toMatch(/create or replace function public\.invite_org_member[\s\S]*?security definer/);
    expect(sql).toMatch(/invite_org_member[\s\S]*?is_org_owner\(target_org\)/);
    expect(sql).toMatch(/remove_org_member[\s\S]*?is_org_owner\(target_org\)/);
    expect(sql).toMatch(/remove_org_member[\s\S]*?at least one owner/);
  });

  it('sets a search_path on every SECURITY DEFINER function', () => {
    // A definer function without a pinned search_path is a privilege-escalation primitive.
    const definers = [...sql.matchAll(/create or replace function ([\s\S]*?)\$\$/g)]
      .map((match) => match[1] ?? '')
      .filter((body) => /security definer/i.test(body));

    expect(definers.length).toBeGreaterThan(0);
    for (const body of definers) {
      expect(body).toMatch(/set search_path = public/);
    }
  });

  it('keeps row-level security on every tenant-scoped table', () => {
    for (const table of [
      'policies',
      'class_code_rates',
      'subcontractors',
      'subcontractor_aliases',
      'import_batches',
      'payments',
      'certificates',
      'chase_items',
      'exposure_snapshots',
      'audit_events',
      'orgs',
      'org_members',
    ]) {
      expect(sql).toMatch(
        new RegExp(`alter table public\\.${table}\\s+enable row level security`),
      );
    }
  });

  it('scopes storage objects by the org id in the object path', () => {
    expect(sql).toContain('public.is_org_member(public.storage_path_org(name))');
    // Both buckets, and no public bucket.
    expect(sql).toMatch(/values \('certificates', 'certificates', false\)/);
    expect(sql).toMatch(/values \('ledger-imports', 'ledger-imports', false\)/);
  });

  it('makes the audit trail and saved figures append-only in the schema', () => {
    expect(sql).toContain('create rule audit_events_no_update');
    expect(sql).toContain('create rule audit_events_no_delete');
    expect(sql).toContain('create rule exposure_snapshots_no_update');
    expect(sql).toContain('create rule exposure_snapshots_no_delete');
  });

  it('never grants the service role to anything in the application', () => {
    // Request-handling code holds the anon key and runs as the signed-in user, so RLS is
    // what enforces tenancy. A service-role key in this codebase would bypass all of it.
    const appSources = ['lib', 'app', 'scripts'];
    for (const root of appSources) {
      const found = grep(root, /SERVICE_ROLE|service_role/);
      expect(found, `${root} references the service role`).toEqual([]);
    }
  });
});

describe('the live database suite exists and is wired up', () => {
  it('applies every migration from zero and attempts real cross-tenant access', () => {
    const suite = readFileSync('supabase/test/tenant-isolation.test.sql', 'utf8');
    expect(suite).toContain("CRITICAL: another org''s certificates are invisible");
    expect(suite).toContain('self-insert into another org as owner');
    expect(suite).toContain("CRITICAL: another org''s stored documents are invisible");

    const runner = readFileSync('scripts/db-test.sh', 'utf8');
    expect(runner).toContain('supabase/migrations/*.sql');
    expect(runner).toContain('tenant-isolation.test.sql');

    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['test:db']).toBe('scripts/db-test.sh');
  });
});

function grep(root: string, pattern: RegExp): string[] {
  const hits: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name) && pattern.test(readFileSync(full, 'utf8'))) {
        hits.push(full);
      }
    }
  };
  walk(root);
  return hits;
}
