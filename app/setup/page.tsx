import { loadWorkspace } from '@/lib/app/workspace';
import { SetupForm } from './SetupForm';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const { data } = await loadWorkspace();
  return <SetupForm org={data.org} policy={data.policy} policies={data.policies} />;
}
