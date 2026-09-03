import { loadWorkspace } from '@/lib/app/workspace';
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

  return <SetupForm org={data.org} policy={policy} policies={data.policies} />;
}
