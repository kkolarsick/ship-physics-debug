import { EmptyState } from '@/components/EmptyState';
import { loadWorkspace } from '@/lib/app/workspace';
import { draftChaseEmail } from '@/lib/chase/templates';
import { ChaseList, type ChaseRow } from './ChaseList';

export const dynamic = 'force-dynamic';

export default async function ChasePage() {
  const { data, portfolio, totals } = await loadWorkspace();

  if (!data.policy || !portfolio) {
    return (
      <EmptyState
        title="Nothing to chase yet"
        body="Import a ledger and the chase list fills with the asks worth making, ranked by the dollars each one removes."
        action={{ href: '/import', label: 'Import a ledger' }}
      />
    );
  }

  const senderName = data.org.name;

  const rows: ChaseRow[] = data.chaseItems.map((item) => {
    const sub = data.subcontractors.find((entry) => entry.id === item.subcontractorId);
    const exposure = portfolio.subs.find((entry) => entry.subcontractorId === item.subcontractorId);
    const workDates = data.payments
      .filter((payment) => payment.subcontractorId === item.subcontractorId)
      .flatMap((payment) =>
        payment.workFrom && payment.workTo ? [payment.workFrom, payment.workTo] : [payment.paidOn],
      )
      .sort();
    const certificate = data.certificates.find(
      (entry) => entry.subcontractorId === item.subcontractorId && entry.wcExpiration !== null,
    );

    const draft = draftChaseEmail(item.ask, {
      orgName: data.org.name,
      senderName,
      senderEmail: 'you@yourcompany.example',
      subcontractorName: sub?.name ?? item.subcontractorName,
      // The dates the letter asks about are the dates the work was performed where the
      // ledger carries them, and the payment dates only where it does not.
      workDates: {
        from: workDates[0] ?? data.policy!.termStart,
        to: workDates.at(-1) ?? data.policy!.termEnd,
      },
      policyTermEnd: data.policy!.termEnd,
      producerName: certificate?.producerName ?? null,
      lastCertificateExpiration: certificate?.wcExpiration ?? null,
    });

    return {
      id: item.id,
      subcontractorId: item.subcontractorId,
      subcontractorName: sub?.name ?? item.subcontractorName,
      ask: item.ask,
      status: item.status,
      exposureAtOpen: item.exposureAtOpen,
      currentExposure: exposure?.addedPremium ?? 0,
      exposureRemoved: item.exposureRemoved,
      sentTo: item.sentTo,
      suggestedTo: item.ask === 'agent_direct' ? (certificate?.producerEmail ?? '') : '',
      subject: item.subject ?? draft.subject,
      body: item.body ?? draft.body,
      resolutionNote: item.resolutionNote,
    };
  });

  return (
    <ChaseList
      rows={rows}
      eliminated={totals?.eliminated ?? 0}
      openBalance={totals?.openBalance ?? 0}
      hasExposure={portfolio.subs.some((sub) => (sub.addedPremium ?? 0) > 0)}
    />
  );
}
