import { test, expect } from '@playwright/test';
import { OPS, QR, apiLogin, phone, staff } from './helpers';

const COLA = 'Coca-Cola Original Taste 1л';

/**
 * Non-negotiable acceptance flow (section 9 of the brief), driven through the real UIs:
 * QR (phone) → Laravel → POS → Kitchen / Bar → Waiter → round 2 → bill → simulated payment → clear.
 */
test('table 8: QR order → POS → KDS/Bar → waiter → round 2 → bill → payment → inventory & reports', async ({ browser }) => {
  // ---- baseline from the API (manager) for exact-once assertions
  const probe = await browser.newPage();
  const { token, user } = await apiLogin(probe, 'manager@noar.local');
  const branchId = user.branches[0].id;
  const auth = { Authorization: `Bearer ${token}` };
  const api = async (path: string) => (await probe.request.get(`${OPS}/api/v1/branches/${branchId}${path}`, { headers: auth })).json();
  const salesBefore = (await api('/reports/summary')).kpi.sales_cents as number;
  const beef = async () => ((await api('/ingredients')).data as Array<{ name: string; on_hand: number }>).find((i) => i.name === 'Телешка кайма')!.on_hand;
  const beefBefore = await beef();

  // ---- 1. guest on a phone opens the NOAR QR menu for table 8 and orders 2 burgers, 1 salad, 2 colas
  const guest = await phone(browser);
  const g = guest.page;
  await g.goto(`${QR}/?table=8`);
  await expect(g.getByText('📍 Маса № 08')).toBeVisible();
  await g.screenshot({ path: 'test-results/qr-menu-phone.png' });

  await g.getByRole('button', { name: 'Добави Бургер телешки', exact: true }).click();
  await g.getByRole('button', { name: 'Увеличи Бургер телешки', exact: true }).click();
  // category bar jumps to the section; search works too
  await g.getByRole('tab', { name: 'Салати' }).click();
  await g.getByRole('button', { name: 'Добави Цезар', exact: true }).click();
  await g.getByRole('searchbox', { name: 'Търсене в менюто' }).fill('coca');
  await g.getByRole('button', { name: `Добави ${COLA}`, exact: true }).click();
  await g.getByRole('button', { name: `Увеличи ${COLA}`, exact: true }).click();
  await g.getByRole('searchbox', { name: 'Търсене в менюто' }).fill('');

  await g.getByRole('button', { name: 'Преглед на поръчката' }).click();
  await expect(g.getByRole('dialog', { name: /Вашата поръчка • Маса № 08/ })).toBeVisible();
  await g.getByPlaceholder(/Бележка към кухнята/).fill('без лук на бургерите');
  await g.getByRole('button', { name: 'Изпрати поръчката към кухнята' }).click();
  await expect(g.getByRole('status').filter({ hasText: /Поръчка № \d+ е изпратена · 37,50/ })).toBeVisible();
  const pill = g.getByRole('button', { name: /^Поръчка № \d+/ });
  await expect(pill).toBeVisible();

  // ---- 2. POS sees the order without manual refresh
  const pos = await staff(browser, 'cashier@noar.local');
  await pos.page.goto(`${OPS}/pos`);
  const table8 = pos.page.getByRole('button', { name: /^Маса 08,/ });
  await expect(table8).toContainText('37,50');
  await table8.click();
  await expect(pos.page.getByText('Бургер телешки').first()).toBeVisible();

  // ---- 3. kitchen & bar each see only their items
  const kitchen = await staff(browser, 'kitchen@noar.local', { width: 1280, height: 800 });
  const k = kitchen.page;
  const burgerTicket = k.locator('article', { hasText: 'Маса 08' }).filter({ hasText: 'Бургер телешки' });
  const saladTicket = k.locator('article', { hasText: 'Маса 08' }).filter({ hasText: 'Цезар' });
  await expect(burgerTicket).toBeVisible();
  await expect(saladTicket).toBeVisible();
  await expect(k.locator('article', { hasText: 'Coca-Cola' })).toHaveCount(0);

  const bar = await staff(browser, 'bar@noar.local', { width: 1280, height: 800 });
  const colaTicket = bar.page.locator('article', { hasText: 'Маса 08' }).filter({ hasText: COLA });
  await expect(colaTicket).toBeVisible();
  await expect(bar.page.locator('article', { hasText: 'Бургер телешки' })).toHaveCount(0);

  // bar readies drinks first → partially ready, burgers untouched
  await colaTicket.getByRole('button', { name: 'Започни', exact: true }).click();
  await colaTicket.getByRole('button', { name: 'Готово', exact: true }).click();
  await g.reload();
  await expect(pill).toContainText('Частично готова');

  await burgerTicket.getByRole('button', { name: 'Започни', exact: true }).click();
  await burgerTicket.getByRole('button', { name: 'Готово', exact: true }).click();
  await saladTicket.getByRole('button', { name: 'Започни', exact: true }).click();
  await saladTicket.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect(pill).toContainText('Готова за сервиране');

  // ---- 4. waiter on mobile receives the ready task and marks it served
  const waiter = await staff(browser, 'waiter@noar.local', { width: 390, height: 844 });
  const readyCard = waiter.page.locator('div', { hasText: 'Маса 08' }).filter({ has: waiter.page.getByRole('button', { name: 'Сервирано' }) }).last();
  await expect(readyCard).toBeVisible();
  await readyCard.getByRole('button', { name: 'Сервирано' }).click();
  await expect(pill).toContainText('Сервирана');

  // ---- 5. round 2 on the same table/check, added from the dish detail sheet
  await g.getByRole('button', { name: 'Бира Шуменско кен — подробности' }).click();
  const sheet = g.getByRole('dialog', { name: 'Бира Шуменско кен' });
  await sheet.getByRole('button', { name: 'Добави Бира Шуменско кен' }).click();
  await expect(sheet.getByRole('button', { name: 'Увеличи количеството' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Затвори' }).click();
  await g.getByRole('button', { name: 'Преглед на поръчката' }).click();
  await g.getByRole('button', { name: 'Изпрати поръчката към кухнята' }).click();
  await expect(g.getByRole('status').filter({ hasText: /е изпратена · 2,50/ })).toBeVisible();
  await expect(table8).toContainText('40,00');

  const beer = bar.page.locator('article', { hasText: 'Маса 08' }).filter({ hasText: 'Бира Шуменско кен' });
  await beer.getByRole('button', { name: 'Започни', exact: true }).click();
  await beer.getByRole('button', { name: 'Готово', exact: true }).click();
  const readyBeer = waiter.page.locator('div', { hasText: 'Бира Шуменско кен' }).filter({ has: waiter.page.getByRole('button', { name: 'Сервирано' }) }).last();
  await readyBeer.getByRole('button', { name: 'Сервирано' }).click();
  await expect(pill).toContainText('Сервирана');

  // ---- 6. guest requests the bill
  await pill.click();
  await g.getByRole('button', { name: 'Поискай сметката' }).click();
  await expect(g.getByText('Сметката е поискана. Сервитьорът идва.')).toBeVisible();
  await g.getByRole('button', { name: 'Затвори' }).click();

  // ---- 7. cashier sees itemization & due, takes a simulated cash payment, clears the table
  await expect(table8).toHaveClass(/border-warn/);
  await expect(pos.page.getByText('Иска сметка').first()).toBeVisible();
  await expect(pos.page.getByText('40,00 €').first()).toBeVisible();
  await pos.page.getByRole('button', { name: 'Плащане' }).click();
  const payDialog = pos.page.getByRole('dialog');
  await payDialog.getByRole('button', { name: /В брой/ }).click();
  await payDialog.getByRole('button', { name: /^Плати 40,00/ }).click();
  await expect(payDialog.getByText('Сметката е платена')).toBeVisible();
  await payDialog.getByRole('button', { name: 'Готово' }).click();
  await pos.page.getByRole('button', { name: 'Освободи масата' }).click();
  await expect(table8).toContainText('места');

  // guest tracker reflects settlement
  await g.reload();

  // ---- 8. inventory and analytics changed exactly once
  expect((await api('/reports/summary')).kpi.sales_cents).toBe(salesBefore + 4000);
  expect(await beef()).toBeCloseTo(beefBefore - 360, 3);

  // ---- 9. persisted through refresh: audit has the payment
  const audit = (await api('/audit')).data as Array<{ action: string }>;
  expect(audit.some((a) => a.action === 'payment.captured')).toBeTruthy();

  // ---- 10. another tenant cannot read NOAR data
  const other = await apiLogin(probe, 'owner@bistro.local');
  const leak = await probe.request.get(`${OPS}/api/v1/branches/${branchId}/tables-live`, { headers: { Authorization: `Bearer ${other.token}` } });
  expect(leak.status()).toBe(404);

  for (const c of [guest.ctx, pos.ctx, kitchen.ctx, bar.ctx, waiter.ctx]) await c.close();
});
