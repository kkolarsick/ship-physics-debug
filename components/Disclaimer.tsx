import { DISCLAIMER } from '@/lib/copy';

/**
 * Required on the dashboard and on every export (brief §1). It is quiet but never
 * collapsed, dismissible, or behind a tooltip — it travels with the figures.
 */
export function Disclaimer({ rulesetVersion }: { rulesetVersion?: string }) {
  return (
    <p className="max-w-3xl text-2xs leading-relaxed text-ink-faint">
      {DISCLAIMER}
      {rulesetVersion ? <> {' '}Ruleset {rulesetVersion}.</> : null}
    </p>
  );
}
