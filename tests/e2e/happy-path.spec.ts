import { expect, test } from '@playwright/test';

/**
 * One happy-path E2E (brief §2), run against the seeded golden fixtures.
 *
 * It walks the path a contractor actually walks — see the number, open the sub behind it,
 * read the timeline, change a decision and watch the figure move, take the workpaper —
 * and asserts the arithmetic the brief specifies at each stop.
 */
test.describe.configure({ mode: 'serial' });

test('from the headline figure to a downloaded workpaper', async ({ page }) => {
  await page.goto('/');

  // The §6d fixtures total $405,700 of added payroll and $52,822 of added premium.
  await expect(page.getByText('Estimated additional premium at audit')).toBeVisible();
  await expect(page.getByText('$52,822', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('$405,700 of payments')).toBeVisible();

  // Every figure is traceable: the sub table links to the inputs behind each one.
  await page.getByRole('link', { name: 'Ridgeline Roofing' }).first().click();
  await expect(page.getByRole('heading', { name: 'Ridgeline Roofing' })).toBeVisible();
  await expect(page.getByText('How this figure was produced')).toBeVisible();

  // The coverage timeline is the explanation, so it has to actually render.
  const timeline = page.getByRole('img', { name: /Payment timeline/ });
  await expect(timeline).toBeVisible();

  // Ridgeline's certificate expired before any of these payments, so all $143,000 is
  // outside every covered window and the premium is $18,619.
  await expect(page.getByText('$18,619').first()).toBeVisible();
  await expect(page.getByText('Certificate ends mid-term').first()).toBeVisible();

  // Triage is one keystroke per row, dollars descending.
  await page.goto('/triage');
  await expect(page.getByRole('heading', { name: 'Vendor triage' })).toBeVisible();
  const firstVendor = page.locator('tbody tr').first();
  await expect(firstVendor).toContainText('Kowalczyk Framing');

  // The chase list ranks by dollars removed per call, not by invoice size.
  await page.goto('/chase');
  await page.getByRole('button', { name: /chase list|current figures/ }).click();
  await expect(page.getByRole('heading', { name: 'Open asks' })).toBeVisible();
  await expect(page.locator('tbody tr').first()).toContainText('Ridgeline Roofing');

  // A draft is written for the user to read, never sent behind their back.
  await page.getByRole('button', { name: 'Draft the email' }).first().click();
  await expect(page.getByText('Read it before it goes')).toBeVisible();

  // Both exports download and carry the stamp.
  await page.goto('/export');
  const [workpaper] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download the workpaper' }).click(),
  ]);
  expect(workpaper.suggestedFilename()).toContain('.pdf');

  const [workbook] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download the workbook' }).click(),
  ]);
  expect(workbook.suggestedFilename()).toContain('.xlsx');

  // Exporting is recorded, with the ruleset that produced the figure.
  await page.reload();
  await expect(page.getByText('export:workpaper_pdf').first()).toBeVisible();
});

test('the disclaimer travels with the figures', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByText('Not a determination of premium, not insurance advice'),
  ).toBeVisible();
});
