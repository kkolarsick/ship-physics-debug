import { NextResponse } from 'next/server';
import { loadWorkspace } from '@/lib/app/workspace';
import { renderWorkpaper } from '@/lib/export/workpaper';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** The audit workpaper, stamped with the ruleset version and a generation timestamp. */
export async function GET() {
  const { data, portfolio, store } = await loadWorkspace();
  if (!data.policy || !portfolio) {
    return NextResponse.json({ error: 'set up a policy term first' }, { status: 400 });
  }

  const generatedAt = new Date();
  const pdf = await renderWorkpaper({
    orgName: data.org.name,
    policy: data.policy,
    portfolio,
    generatedAt,
  });

  // Exports are figures leaving the building, so they are recorded like any other.
  await store.saveExposureSnapshot(portfolio, 'export:workpaper_pdf');

  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="subcontractor-exposure-${data.policy.termStart}-to-${data.policy.termEnd}.pdf"`,
      'cache-control': 'no-store',
    },
  });
}
