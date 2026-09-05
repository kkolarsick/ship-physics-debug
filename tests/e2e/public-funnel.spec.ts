import { expect, test } from '@playwright/test';

/**
 * The public funnel a stranger walks, with no account.
 *
 * The site has to carry the whole sales process, so every page here must be reachable
 * signed out — and the state pages must say exactly what the engine will and will not do,
 * because they are generated from the same rules registry it reads.
 */
test('the homepage sells the number and names its limits', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: /Know what your workers.* audit may cost/ }),
  ).toBeVisible();
  await expect(page.getByText(/applies the audit treatment for your state/)).toBeVisible();

  // Positioning: no compliance-management language, and no meeting gate.
  await expect(page.getByText(/certificate filing cabinet/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Book a demo|Schedule a call|Talk to sales/ })).toHaveCount(0);

  // The launch states are listed with the status the engine actually reports.
  for (const state of ['New York', 'New Jersey', 'Pennsylvania', 'Florida', 'California', 'Texas']) {
    await expect(page.getByRole('link', { name: state, exact: true }).first()).toBeVisible();
  }

  await page.getByRole('link', { name: 'Run a free exposure scan' }).first().click();
  await expect(page).toHaveURL(/\/scan/);
});

test('a state page states what is and is not calculated there', async ({ page }) => {
  await page.goto('/new-york/workers-comp-audit');

  await expect(page.getByRole('heading', { name: /New York workers.* comp audit/ })).toBeVisible();
  await expect(page.getByText('NYCIRB').first()).toBeVisible();

  // Nothing is populated for New York yet, so the page must say so rather than imply a
  // calculation is available.
  await expect(
    page.getByText('SubLedger does not yet produce a reliable premium estimate for New York.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What it will not calculate' })).toBeVisible();

  // The authorities it will be built against are named and linked.
  await expect(page.getByRole('heading', { name: /authorities this profile is built against/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /New York Workers/ })).toBeVisible();
});

test('the scan asks for a state before anything else, and fails closed', async ({ page }) => {
  await page.goto('/scan');
  await expect(page.getByRole('heading', { name: 'Start with your state.' })).toBeVisible();

  await page.locator('select').first().selectOption('US-NY');
  await expect(
    page.getByText('SubLedger does not yet produce a reliable premium estimate for New York.'),
  ).toBeVisible();
  // No path onward into a calculation for an unsupported state.
  await expect(page.getByRole('link', { name: 'Continue' })).toHaveCount(0);

  // A state with a ruleset in place offers the way in.
  await page.locator('select').first().selectOption('US-TN');
  await expect(page.getByText('Tennessee is supported.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue' })).toBeVisible();
});

test('supported states are listed from the engine, split by whether they price', async ({ page }) => {
  await page.goto('/supported-states');

  await expect(page.getByRole('heading', { name: /Where SubLedger produces a number/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Launch states' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Recognised, not yet estimating/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Currently estimating/ })).toBeVisible();
});

test('the trust pages answer what a stranger uploading a ledger would ask', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: /Whether your data trains any model/ })).toBeVisible();
  await expect(page.getByText(/does not train models on your ledger/)).toBeVisible();

  await page.goto('/security');
  await expect(page.getByRole('heading', { name: /It is tested, not assumed/ })).toBeVisible();

  await page.goto('/data-handling');
  await expect(page.getByRole('heading', { name: /How to have your data deleted/ })).toBeVisible();
  await expect(page.getByText(/No accounting-system login/)).toBeVisible();
});

test('pricing sells the financial output, not feature counts', async ({ page }) => {
  await page.goto('/pricing');

  await expect(page.getByRole('heading', { name: 'Audit Exposure Scan' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pre-Audit Analysis' })).toBeVisible();
  await expect(page.getByText(/Ranked remediation plan, sorted by the dollars/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Run a free exposure scan' }).first()).toBeVisible();
});
