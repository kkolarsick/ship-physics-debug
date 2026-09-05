import { EmptyState } from '@/components/EmptyState';
import { loadWorkspace } from '@/lib/app/workspace';
import { TriageBoard } from './TriageBoard';

export const dynamic = 'force-dynamic';

export default async function TriagePage() {
  const { data, portfolio } = await loadWorkspace();

  if (!data.policy || data.payments.length === 0) {
    return (
      <EmptyState
        title="Nothing to triage yet"
        body="Import a payment ledger and every vendor in it lands here, sorted by dollars, waiting for one keystroke each."
        action={{ href: '/import', label: 'Import a ledger' }}
      />
    );
  }

  const rows = data.subcontractors
    .map((sub) => {
      const exposure = portfolio?.subs.find((entry) => entry.subcontractorId === sub.id);
      return {
        id: sub.id,
        name: sub.name,
        trade: sub.trade,
        triage: sub.triage,
        paidTotal: exposure?.paidTotal ?? 0,
        paymentCount: data.payments.filter((payment) => payment.subcontractorId === sub.id).length,
        hasCertificate: data.certificates.some((cert) => cert.subcontractorId === sub.id),
      };
    })
    .filter((row) => row.paymentCount > 0)
    .sort((a, b) => b.paidTotal - a.paidTotal || a.name.localeCompare(b.name));

  return <TriageBoard rows={rows} />;
}
