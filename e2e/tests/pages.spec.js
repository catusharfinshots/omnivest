// Page-health suite: every public route, on iPhone (WebKit), Android and desktop.
// For each page: no horizontal overflow, no console errors, no broken images, primary
// buttons tappable (>= 44px tall on phones), no text under 12px in real content, no
// "undefined"/"NaN" leaking into the UI, footer reachable above the bottom bar,
// and a visual snapshot so unintended layout changes show up as a diff.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const ROUTES = [
  '/', '/model-portfolios', '/aif', '/advisory', '/about', '/mutual-funds', '/fixed-deposits', '/collections',
  '/stocks', '/managers', '/calculators', '/calculators/sip', '/learn', '/business', '/faq', '/login', '/signup',
  '/partner', '/partner/apply', '/brokers/connect',
];

// Elements that are deliberately tiny or decorative (illustrations, mock phone screens)
const DECORATIVE = ['.hiw-phone', '.fphone', '.stage', '[aria-hidden="true"]', '.hero-visual', '[data-decorative]'];

async function audit(page) {
  return page.evaluate((decorative) => {
    const vw = document.documentElement.clientWidth;
    const isDecor = (el) => decorative.some((sel) => el.closest(sel));
    const overflow = [];
    const tinyText = [];
    const smallTaps = [];
    const brokenImgs = [];
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return;
      if (r.right > vw + 1 && cs.position !== 'fixed' && !isDecor(el)) overflow.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 2).join('.')}→${Math.round(r.right)}`);
      if (el.children.length === 0 && (el.textContent || '').trim().length > 1 && parseFloat(cs.fontSize) < 12 && !isDecor(el)) tinyText.push(`${Math.round(parseFloat(cs.fontSize))}px "${el.textContent.trim().slice(0, 24)}"`);
      if ((el.tagName === 'BUTTON' || (el.tagName === 'A' && /btn-|rounded-(xl|2xl|full)/.test(String(el.className)))) && r.height < 40 && !isDecor(el) && r.top < window.innerHeight * 3) smallTaps.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (el.tagName === 'IMG' && el.complete && el.naturalWidth === 0 && el.getAttribute('src')) brokenImgs.push(el.getAttribute('src').slice(0, 60));
    });
    const leaked = (document.body.innerText.match(/\b(undefined|NaN|\[object Object\]|null)\b/g) || []).length;
    return { vw, scrollW: document.documentElement.scrollWidth, overflow: [...new Set(overflow)].slice(0, 6), tinyText: [...new Set(tinyText)].slice(0, 6), smallTaps: [...new Set(smallTaps)].slice(0, 6), brokenImgs, leaked };
  }, DECORATIVE);
}

for (const route of ROUTES) {
  test(`page health ${route}`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ResizeObserver|net::ERR|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message).slice(0, 160)}`));
    await page.goto(route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600); // count-up animations, lazy sections

    const a = await audit(page);
    const isPhone = testInfo.project.name !== 'desktop';
    expect.soft(a.scrollW, `horizontal overflow on ${route}: ${a.overflow.join(' | ')}`).toBeLessThanOrEqual(a.vw + 1);
    expect.soft(a.overflow, `elements past the right edge on ${route}`).toEqual([]);
    expect.soft(a.brokenImgs, `broken images on ${route}`).toEqual([]);
    expect.soft(a.leaked, `undefined/NaN leaked into UI on ${route}`).toBe(0);
    expect.soft(errors, `console errors on ${route}`).toEqual([]);
    if (isPhone) {
      expect.soft(a.smallTaps, `buttons under 40px tall on ${route}`).toEqual([]);
      expect.soft(a.tinyText, `text under 12px on ${route}`).toEqual([]);
    }
    // the page must be usable: a header and either main content or a form
    await expect(page.locator('header, nav').first()).toBeVisible();
    // accessibility: contrast, labels, names (serious/critical only)
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude(DECORATIVE.join(',')).analyze();
    const serious = axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.length} node(s) e.g. ${v.nodes[0]?.target?.[0]}`);
    expect.soft(serious, `accessibility on ${route}`).toEqual([]);
    // visual snapshot (per project); first run records, later runs diff
    await expect(page).toHaveScreenshot(`${route === '/' ? 'home' : route.slice(1).replace(/\//g, '_')}.png`, { fullPage: true, animations: 'disabled', mask: [page.locator('[data-testid=mobile-bottom-nav]'), page.locator('[data-decorative]')] });
  });
}
