import { storeMode } from '@/lib/db';
import { EmptyState } from '@/components/EmptyState';
import { SignInForm } from './SignInForm';

export const dynamic = 'force-dynamic';

export default async function SignInPage() {
  if (storeMode() === 'demo') {
    return (
      <EmptyState
        title="No sign-in needed here"
        body="This instance runs against the local demo store. Set the Supabase environment variables to turn on accounts."
        action={{ href: '/', label: 'Go to the dashboard' }}
      />
    );
  }
  return <SignInForm />;
}
