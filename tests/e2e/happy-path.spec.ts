import { expect, test } from '@playwright/test';

/**
 * One happy path, run against the seeded golden fixtures, plus the fail-closed path.
 *
 * It walks what a contractor actually does — see the number, open the subcontractor behind
 * it, read the timeline, take the workpaper — and asserts the arithmetic and the
 * disclosures at each stop. The second test is the one that matters most for this build:
 * a jurisdiction whose rules are not configured must produce no dollar figure at all.
 */
test.describe.configure({ mode: 'serial' });

test('from the headline figure to a downloaded workpaper', async ({ page }) => {
  await page.goto('/exposure');

  // The golden fixtures total $405,700 of added payroll and $52,822 of added premium.
  await expect(page.getByText('Estimated additional premium at audit')).toBeVisible();
  await expect(page.getByText('$52,822', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('$405,700 of payments')).toBeVisible();

  // The figure names the ruleset it was produced under, and its confidence.
  await expect(page.getByText('Medium confidence').first()).toBeVisible();
  await expect(
    page.getByText('has not been checked against the governing bureau manual'),
  ).toBeVisible();

  // Audit noncompliance is not a consequence of uninsured subcontract cost.
  await expect(page.getByText('Uninsured subcontract exposure does not trigger one')).toBeVisible();

  // Every input is named, and every assumption stated beside it.
  await expect(page.getByRole('heading', { name: 'What this figure rests on' })).toBeVisible();
  await expect(page.getByText('Coverage was tested against the period the work was performed')).toBeVisible();

  // Every figure is traceable: the table links to the inputs behind each one.
  await page.getByRole('link', { name: 'Ridgeline Roofing' }).first().click();
  await expect(page.getByRole('heading', { name: 'Ridgeline Roofing' })).toBeVisible();
  await expect(page.getByText('How this figure was produced')).toBeVisible();
  await expect(page.getByText('Rate basis: Subcontractor’s own class')).toBeVisible();

  // The coverage timeline is the explanation, so it has to actually render.
  await expect(page.getByRole('img', { name: /Payment timeline/ })).toBeVisible();

  // Ridgeline's certificate expired before any of this work, so all $143,000 is exposed.
  await expect(page.getByText('$18,619').first()).toBeVisible();
  await expect(page.getByText('Certificate ends mid-term').first()).toBeVisible();

  // Work periods are editable here — the single highest-value correction a user can make.
  await expect(page.getByLabel('Work performed from').first()).toBeVisible();
  await expect(page.getByLabel('Prior audit class code')).toBeVisible();

  // Triage is one keystroke per row, dollars descending.
  await page.goto('/triage');
  await expect(page.getByRole('heading', { name: 'Vendor triage' })).toBeVisible();
  await expect(page.locator('tbody tr').first()).toContainText('Kowalczyk Framing');

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
  await expect(page.getByRole('cell', { name: /us-ncci-basic-manual/ }).first()).toBeVisible();
});

test('a jurisdiction whose rules are not configured produces no figure', async ({ page }) => {
  await page.goto('/setup');

  // California is recognised, but its plan has not been transcribed into this build.
  // The bureau is cleared too, so the resolution reaches California's own profile rather
  // than stopping at a bureau mismatch — a different, and also correct, refusal.
  await page.locator('select[name="jurisdiction"]').selectOption('US-CA');
  await page.locator('input[name="ratingBureau"]').fill('');
  await page.getByRole('button', { name: /Save/ }).click();
  await expect(page.getByText(/Policy term saved|Check the highlighted/)).toBeVisible();

  await page.goto('/exposure');
  await expect(page.getByText('Estimate unavailable')).toBeVisible();
  await expect(page.getByText(/has not been populated in this build/)).toBeVisible();

  // No dollar figure of any kind is presented — not even a fallback one.
  await expect(page.getByText('$52,822')).toHaveCount(0);
  await expect(page.getByText('Estimated additional premium at audit')).toHaveCount(0);

  // The ledger survives; only the pricing is withheld.
  await expect(page.getByText('$777,600')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vendors on file' })).toBeVisible();

  // Put it back, and the figure returns.
  await page.goto('/setup');
  await page.locator('select[name="jurisdiction"]').selectOption('US-TN');
  await page.getByRole('button', { name: /Save/ }).click();
  await page.goto('/exposure');
  await expect(page.getByText('$52,822', { exact: true }).first()).toBeVisible();
});

test('the disclaimer travels with the figures', async ({ page }) => {
  await page.goto('/exposure');
  await expect(
    page.getByText('Not a determination of premium, not insurance advice'),
  ).toBeVisible();
});
