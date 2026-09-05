import { NextResponse } from 'next/server';
import { loadWorkspace } from '@/lib/app/workspace';
import { renderWorkbook } from '@/lib/export/xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Sub-level detail, with the payments and certificates behind every figure. */
export async function GET() {
  const { data, portfolio, store } = await loadWorkspace();
  if (!data.policy || !portfolio) {
    return NextResponse.json({ error: 'set up a policy term first' }, { status: 400 });
  }

  const generatedAt = new Date();
  const workbook = await renderWorkbook({
    orgName: data.org.name,
    policy: data.policy,
    portfolio,
    data,
    generatedAt,
  });

  await store.saveExposureSnapshot(portfolio, 'export:detail_xlsx');

  return new NextResponse(workbook as unknown as BodyInit, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="subcontractor-detail-${data.policy.termStart}-to-${data.policy.termEnd}.xlsx"`,
      'cache-control': 'no-store',
    },
  });
}
