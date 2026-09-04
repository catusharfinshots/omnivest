// User journeys, end to end, on the phone first (WebKit) and desktop.
// Backend steps that a human admin would do in the console are done through the API to
// keep each journey focused; the UI parts are what customers and partners actually touch.
const { test, expect } = require('@playwright/test');

const API = process.env.API_URL || 'http://localhost:8000/api';
const ADMIN = { email: 'admin@omnivest.in', password: 'Admin@123' };
const OTP = '123456';
const rnd = () => Math.floor(100000000 + Math.random() * 899999999); // 9 digits → with the leading digit a valid 10-digit Indian mobile

async function adminToken(request) {
  const r = await request.post(`${API}/auth/login`, { data: ADMIN });
  expect(r.ok()).toBeTruthy();
  return (await r.json()).token;
}
async function typePhone(page, testid, national, scope) {
  // The field shows +91 already; type the 10 digits the way people do.
  const input = (scope || page).locator(`[data-testid=${testid}] input`).first();
  await input.click();
  await input.fill(`+91${national}`);
  await expect(input).toHaveValue(new RegExp(national.slice(-4)));
}
async function otpLogin(page, national, { name } = {}) {
  const modal = page.getByTestId('phone-auth-modal');
  await expect(modal).toBeVisible();
  await typePhone(page, 'phone-input', national, modal);
  await page.getByTestId('send-otp-btn').click();
  await page.getByTestId('otp-input').fill(OTP);
  const nameInput = page.getByTestId('otp-name-input');
  if (name && await nameInput.isVisible().catch(() => false)) await nameInput.fill(name);
  await page.getByTestId('verify-otp-btn').click();
  await expect(page.getByTestId('phone-auth-modal')).toBeHidden({ timeout: 15000 });
}

test.describe('Investor', () => {
  test('guest can log in with mobile OTP from the login tab and reach the dashboard', async ({ page, request }, testInfo) => {
    const phone = `9${rnd()}`;
    await page.goto('/');
    if (testInfo.project.name === 'desktop') await page.getByTestId('nav-get-started').click();
    else await page.getByTestId('mobtab-login').click();
    await otpLogin(page, phone, { name: 'Journey Investor' });
    await expect(page).toHaveURL(/\/dashboard/);
    if (testInfo.project.name !== 'desktop') await expect(page.getByTestId('mobtab-dashboard')).toBeVisible();
    // cleanup: remove the test user
    const tok = await adminToken(request);
    const users = await (await request.get(`${API}/admin/db/users`, { params: { q: `+91${phone}` }, headers: { Authorization: `Bearer ${tok}` } })).json();
    for (const u of users.documents || []) if (u.phone === `+91${phone}`) await request.delete(`${API}/admin/db/users/${u.id}`, { headers: { Authorization: `Bearer ${tok}` } });
  });

  test('explore shows live listings with covers and opens a listing page', async ({ page, request }) => {
    const list = await (await request.get(`${API}/portfolios`)).json();
    test.skip(!list.portfolios?.length, 'no live listings on this environment');
    await page.goto('/model-portfolios');
    const card = page.getByTestId('explore-card').first();
    await expect(card).toBeVisible();
    await expect(card.locator('[data-theme], img').first()).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(/\/model-portfolios\//);
    await expect(page.getByTestId('stat-tiles')).toBeVisible();
    await expect(page.getByTestId('invest-box')).toBeVisible();
    await expect(page.getByTestId('performance-disclaimer')).toBeVisible();
  });
});

test.describe('Partner', () => {
  test('apply → admin approves → partner logs in → builds and submits a listing → admin approves → investors see it', async ({ page, request }, testInfo) => {
    test.setTimeout(240_000);
    const phone = `8${rnd()}`;
    const firm = `Journey Firm ${phone.slice(-4)}`;
    const tok = await adminToken(request);
    const auth = { Authorization: `Bearer ${tok}` };
    let appId, userId, pid;
    try {
      // 1. apply from the public form
      await page.goto('/partner/apply');
      await page.getByTestId('partner-name').fill('Journey Analyst');
      await typePhone(page, 'partner-phone', phone);
      await page.getByTestId('partner-email').fill(`journey_${phone}@test.com`);
      await page.getByTestId('partner-registered-name').fill('Journey Research');
      await page.getByTestId('partner-firm').fill(firm);
      await page.getByTestId('partner-sebi').fill('INH000099999');
      await page.getByTestId('partner-sebi-date').fill('2022-01-01');
      await page.getByTestId('partner-raasb').fill('R-1');
      await page.getByTestId('partner-nism').fill('N-1');
      await page.getByTestId('partner-nism-valid').fill('2030-01-01');
      await page.getByTestId('partner-pan').fill('ABCDE9999F');
      await page.getByTestId('partner-address').fill('1 Journey Street, Mumbai 400001');
      await page.getByTestId('partner-exp').fill('6');
      for (const kind of ['sebi_cert', 'nism_cert', 'pan_card']) {
        await page.getByTestId(`doc-input-${kind}`).setInputFiles({ name: `${kind}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%journey\n%%EOF\n') });
      }
      await page.getByTestId('applicant-type-individual').click();
      await page.getByTestId('disciplinary-no').click();
      await page.getByTestId('partner-note').fill('Thematic baskets around water and infrastructure.');
      for (const id of ['partner-deposit-consent', 'partner-mp-consent', 'partner-terms-consent']) await page.locator(`[data-testid=${id}] input[type=checkbox]`).check();
      const missing = await page.getByTestId('missing-checklist').innerText({ timeout: 2000 }).catch(() => '');
      expect(missing, 'application form still incomplete').toBe('');
      await page.getByTestId('partner-submit').click();
      await expect(page.getByTestId('partner-success')).toBeVisible({ timeout: 30000 });
      const ref = (await page.getByTestId('partner-ref-no').innerText()).trim();
      expect(ref).toMatch(/OMN-RA-\d{4}-\d{4}/);

      // 2. admin approves (API)
      const apps = await (await request.get(`${API}/admin/partners`, { headers: auth })).json();
      const app = (apps.applications || []).find((a) => a.email === `journey_${phone}@test.com`);
      expect(app, 'application should appear in the admin queue').toBeTruthy();
      appId = app.id;
      const storedNational = String(app.phone || '').replace(/\D/g, '').replace(/^91/, '');
      expect(storedNational, 'stored mobile must be the 10 digits typed').toBe(phone);
      expect((await request.post(`${API}/admin/partners/${appId}/review`, { data: { action: 'approve', note: '' }, headers: auth })).ok()).toBeTruthy();

      // 3. partner logs in from the partner page
      await page.goto('/partner');
      await page.getByTestId('nav-partner-login').first().click();   // partner page has its own header on every device
      await otpLogin(page, phone);
      await expect(page.getByTestId('console-nav-listings')).toBeVisible();
      userId = (await (await request.post(`${API}/auth/phone/verify-otp`, { data: { phone: `+91${phone}`, code: OTP, flow: 'partner' } })).json()).user.id;

      // 4. build a listing in the stepper
      await page.getByTestId('console-nav-listings').click();
      await page.getByTestId('new-listing-btn').click();
      await page.getByTestId('form-name').fill('Journey Water Basket');
      await page.getByTestId('form-subtitle').fill('Companies solving water scarcity');
      await page.getByTestId('next-step-btn').click();
      // constituents: two rows, typed directly (symbol search needs a Kite session)
      const rows = page.getByTestId('constituent-row');
      await rows.nth(0).locator('[data-testid=constituent-symbol-input]').fill('RELIANCE');
      await rows.nth(0).locator('input[placeholder=Name]').fill('Reliance Industries');
      await rows.nth(0).locator('input[type=number]').fill('50');
      await page.getByRole('button', { name: /Add constituent/ }).click();
      await rows.nth(1).locator('[data-testid=constituent-symbol-input]').fill('INFY');
      await rows.nth(1).locator('input[placeholder=Name]').fill('Infosys');
      await rows.nth(1).locator('input[type=number]').fill('50');
      await expect(page.getByTestId('weights-total')).toContainText('100%');
      await page.getByTestId('next-step-btn').click();
      // story
      await page.locator('[data-testid=form-rationale] [contenteditable]').fill('Water is the scarcest input in India. We own the enablers.');
      await page.locator('[data-testid=form-methodology] [contenteditable]').fill('Equal weight, reviewed quarterly.');
      await page.getByPlaceholder('Long-term capital growth via…').fill('Long-term growth');
      await page.getByPlaceholder('Investors with a 3+ year horizon who…').fill('Investors with a 3+ year horizon');
      await page.locator('textarea').last().fill('Sector concentration; regulatory delays.');
      await page.getByTestId('next-step-btn').click(); // rebalance
      await page.getByTestId('next-step-btn').click(); // pricing
      await page.getByTestId('next-step-btn').click(); // documents (optional)
      await page.getByTestId('next-step-btn').click(); // review
      await expect(page.getByTestId('readiness')).toContainText(/Everything's in place/);
      await page.getByTestId('save-submit-btn').click();
      await expect(page.getByTestId('portfolio-row').filter({ hasText: 'Journey Water Basket' })).toContainText('Awaiting approval');

      // 5. admin approves (API) → listing is live with a cover, investors can open + share it
      const mine = await (await request.get(`${API}/admin/portfolios`, { headers: auth })).json();
      const listing = (mine.portfolios || []).find((p) => p.name === 'Journey Water Basket');
      expect(listing).toBeTruthy();
      pid = listing.id;
      expect(listing.cover?.theme).toBe('water');
      expect((await request.post(`${API}/admin/portfolios/${pid}/review`, { data: { action: 'approve' }, headers: auth })).ok()).toBeTruthy();
      await page.context().clearCookies();
      await page.evaluate(() => localStorage.clear());
      await page.goto(`/model-portfolios/${pid}`);
      await expect(page.getByRole('heading', { name: 'Journey Water Basket' })).toBeVisible();
      await expect(page.locator('[data-theme=water]').first()).toBeVisible();
      await expect(page.getByTestId('stat-tiles')).toContainText(/Since launch|CAGR/);
      const share = await page.evaluate(() => new Promise((res) => { navigator.share = (d) => { res(d); return Promise.resolve(); }; document.querySelector('[data-testid=share-button]').click(); }));
      expect(share.url).toMatch(/\/s\/[a-f0-9]{8}$/);
      expect(share.text).toContain('Journey Water Basket');
    } finally {
      // cleanup everything the journey created
      if (pid) { await request.delete(`${API}/admin/db/portfolio_performance/${pid}`, { headers: auth }); await request.delete(`${API}/admin/db/analyst_portfolios/${pid}`, { headers: auth }); }
      if (appId) {
        const docs = await (await request.get(`${API}/admin/db/partner_documents`, { params: { limit: 100 }, headers: auth })).json();
        for (const d of docs.documents || []) if (d.application_id === appId) await request.delete(`${API}/admin/db/partner_documents/${d.id}`, { headers: auth });
        await request.delete(`${API}/admin/db/partner_applications/${appId}`, { headers: auth });
      }
      if (userId) await request.delete(`${API}/admin/db/users/${userId}`, { headers: auth });
      const mgrs = await (await request.get(`${API}/admin/db/managers`, { params: { q: firm }, headers: auth })).json();
      for (const m of mgrs.documents || []) await request.delete(`${API}/admin/db/managers/${m.id}`, { headers: auth });
    }
  });
});

test.describe('Admin', () => {
  test('team login page → console → listings tab and settings load', async ({ page }) => {
    await page.goto('/login?admin=1');
    await expect(page.getByTestId('login-admin-form')).toBeVisible();
    await page.locator('[data-testid=login-admin-form] input[type=email]').fill(ADMIN.email);
    await page.locator('[data-testid=login-admin-form] input[type=password]').fill(ADMIN.password);
    await page.locator('[data-testid=login-admin-form] button[type=submit], [data-testid=login-admin-form] button').last().click();
    await expect(page).toHaveURL(/\/admin/);
    await page.getByTestId('admin-nav-listings').click();
    await expect(page.getByTestId('listing-filters')).toBeVisible();
    await page.getByTestId('admin-nav-dropdowns').click();
    await expect(page.getByTestId('listing-settings')).toBeVisible();
    await page.getByTestId('admin-nav-engine').click();
    await expect(page.getByTestId('engine-admin')).toBeVisible();
  });
});
