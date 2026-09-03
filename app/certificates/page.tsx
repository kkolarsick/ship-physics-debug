import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { loadWorkspace } from '@/lib/app/workspace';
import { documentUrl } from '@/lib/storage';
import { formatUsDate } from '@/lib/dates';
import { normalizeName } from '@/lib/matching/normalize';
import { rankCandidates } from '@/lib/matching/similarity';
import { Money } from '@/components/Money';
import { CertificateUpload } from './CertificateUpload';
import { ReviewQueue, type ReviewItem } from './ReviewQueue';
import { UnmatchedBin, type UnmatchedItem } from './UnmatchedBin';

export const dynamic = 'force-dynamic';

export default async function CertificatesPage() {
  const { data, portfolio } = await loadWorkspace();

  if (!data.policy) {
    return (
      <EmptyState
        title="Set up the policy term first"
        body="Coverage windows are only meaningful against an audit period."
        action={{ href: '/setup', label: 'Set up the policy term' }}
      />
    );
  }

  const subs = data.subcontractors.map((sub) => ({
    id: sub.id,
    name: sub.name,
    normalizedName: sub.normalizedName,
  }));

  const needsReview = data.certificates.filter(
    (certificate) => certificate.status === 'needs_review' && certificate.subcontractorId !== null,
  );
  const unmatched = data.certificates.filter(
    (certificate) => certificate.subcontractorId === null && certificate.status !== 'rejected',
  );
  const matched = data.certificates.filter(
    (certificate) => certificate.subcontractorId !== null && certificate.status !== 'needs_review',
  );

  const reviewItems: ReviewItem[] = await Promise.all(
    needsReview.map(async (certificate) => ({
      id: certificate.id,
      filename: certificate.originalFilename,
      sourceUrl: await documentUrl('certificates', certificate.filePath),
      subcontractorId: certificate.subcontractorId,
      namedInsured: certificate.namedInsured,
      wcPresent: certificate.wcPresent,
      wcCarrier: certificate.wcCarrier,
      wcPolicyNumber: certificate.wcPolicyNumber,
      wcEffective: certificate.wcEffective,
      wcExpiration: certificate.wcExpiration,
      wcOfficerExclusionNoted: certificate.wcOfficerExclusionNoted,
      glPresent: certificate.glPresent,
      confidence: certificate.extractionConfidenceThousandths,
      error: certificate.extractionError,
      descriptionOfOperations: certificate.descriptionOfOperations,
      subs,
    })),
  );

  const unmatchedItems: UnmatchedItem[] = await Promise.all(
    unmatched.map(async (certificate) => ({
      id: certificate.id,
      filename: certificate.originalFilename,
      sourceUrl: await documentUrl('certificates', certificate.filePath),
      namedInsured: certificate.namedInsured,
      wcPresent: certificate.wcPresent,
      wcEffective: certificate.wcEffective,
      wcExpiration: certificate.wcExpiration,
      status: certificate.status,
      // Only candidates in the review band are offered as one-click confirmations. A 2%
      // trigram overlap is noise, and offering it as a button invites a wrong pairing.
      candidates: rankCandidates(
        certificate.normalizedNamedInsured ?? normalizeName(certificate.namedInsured ?? ''),
        subs,
        data.aliases.map((alias) => ({
          subcontractorId: alias.subcontractorId,
          normalizedAlias: alias.normalizedAlias,
        })),
      )
        .filter((candidate) => candidate.band !== 'unmatched')
        .slice(0, 4),
      subs,
    })),
  );

  // The other direction of the same signal: subcontractors with nothing on file.
  const withoutCertificate = (portfolio?.subs ?? [])
    .filter(
      (sub) =>
        sub.paidTotal > 0 &&
        !data.certificates.some((cert) => cert.subcontractorId === sub.subcontractorId),
    )
    .sort((a, b) => b.addedPremium - a.addedPremium);

  return (
    <div className="space-y-6">
      <CertificateUpload />

      {reviewItems.length > 0 ? <ReviewQueue items={reviewItems} /> : null}

      <UnmatchedBin items={unmatchedItems} />

      <section className="grid items-start gap-5 lg:grid-cols-2">
        <div className="panel">
          <div className="panel-head">
            <h2 className="text-sm font-semibold">Subcontractors with nothing on file</h2>
            <p className="text-2xs text-ink-faint">{withoutCertificate.length} vendors</p>
          </div>
          <table className="workpaper-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th className="text-right">Paid in term</th>
                <th className="text-right">Added premium</th>
              </tr>
            </thead>
            <tbody>
              {withoutCertificate.map((sub) => (
                <tr key={sub.subcontractorId}>
                  <td>
                    <Link href={`/subs/${sub.subcontractorId}`} className="hover:underline">
                      {sub.subcontractorName}
                    </Link>
                  </td>
                  <td className="num">
                    <Money cents={sub.paidTotal} />
                  </td>
                  <td className="num font-semibold text-risk">
                    <Money cents={sub.addedPremium} />
                  </td>
                </tr>
              ))}
              {withoutCertificate.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-5 text-center text-sm text-ink-muted">
                    Every vendor paid in this term has a certificate on file.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2 className="text-sm font-semibold">Matched certificates</h2>
            <p className="text-2xs text-ink-faint">{matched.length} on file</p>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="workpaper-table">
              <thead className="sticky top-0 bg-card">
                <tr>
                  <th>Named insured</th>
                  <th>Workers’ comp on the document</th>
                </tr>
              </thead>
              <tbody>
                {matched.map((certificate) => (
                  <tr key={certificate.id}>
                    <td>
                      <Link
                        href={`/subs/${certificate.subcontractorId}`}
                        className="hover:underline"
                      >
                        {certificate.namedInsured ?? certificate.originalFilename ?? 'Unnamed'}
                      </Link>
                    </td>
                    <td className={certificate.wcPresent ? '' : 'text-note'}>
                      {certificate.wcPresent
                        ? `${certificate.wcEffective ? formatUsDate(certificate.wcEffective) : '—'} – ${certificate.wcExpiration ? formatUsDate(certificate.wcExpiration) : '—'}`
                        : 'No workers’ comp section'}
                    </td>
                  </tr>
                ))}
                {matched.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-5 text-center text-sm text-ink-muted">
                      Nothing matched yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
