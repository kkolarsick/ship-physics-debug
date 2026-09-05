import { loadWorkspace } from '@/lib/app/workspace';
import { supportedJurisdictions } from '@/lib/rules/registry';
import { SetupForm } from './SetupForm';

export const dynamic = 'force-dynamic';

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const { new: startNew } = await searchParams;
  const { data } = await loadWorkspace();

  // Renewing is a new term, not an edit: last year's figures have to stay explainable.
  const policy = startNew === undefined ? data.policy : null;

  // Only jurisdictions this build can actually price are offered. Anything else would be
  // an invitation to produce a figure under rules nobody has configured.
  const jurisdictions = supportedJurisdictions().map((entry) => ({
    jurisdiction: entry.jurisdiction,
    ratingBureau: entry.profile.ratingBureau,
    label: entry.profile.label,
    status: entry.profile.status,
    producesEstimates: entry.profile.uninsuredSubcontractor.treatment !== 'not_modeled',
  }));

  return (
    <SetupForm
      org={data.org}
      policy={policy}
      policies={data.policies}
      jurisdictions={jurisdictions}
    />
  );
}
