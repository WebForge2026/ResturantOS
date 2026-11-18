import { type Browser, type BrowserContext, type Page, expect } from '@playwright/test';

export const QR = process.env.QR_URL ?? 'http://localhost:3000';
export const OPS = process.env.OPS_URL ?? 'http://localhost:5173';
export const PASSWORD = process.env.NOAR_DEMO_PASSWORD ?? 'noar-demo-2026';

export async function apiLogin(page: Page, email: string) {
  const r = await page.request.post(`${OPS}/api/v1/auth/login`, { data: { email, password: PASSWORD } });
  expect(r.ok()).toBeTruthy();
  return (await r.json()) as { token: string; user: { branches: Array<{ id: number }> } };
}

/** Staff context logged in through the real login form. */
export async function staff(browser: Browser, email: string, viewport = { width: 1440, height: 900 }): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(`${OPS}/login`);
  await page.getByLabel('Имейл').fill(email);
  await page.getByLabel('Парола').fill(PASSWORD);
  await page.getByRole('button', { name: 'Вход', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  return { ctx, page };
}

export async function phone(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  return { ctx, page: await ctx.newPage() };
}
