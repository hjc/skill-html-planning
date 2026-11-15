// browser.mjs --script for verify-loader.mjs. Waits for the inline loader to
// finish, then reports whether plan-styles.css applied (its :root --bg token)
// and plan-runtime.js rendered the components, and where each came from.
// The driver evaluates in an isolated world, where `customElements` is null, so
// "the runtime ran" is read from the DOM: <plan-header> is empty on disk and
// PlanHeader fills it.
export default async function probe(page) {
  await page.waitForFunction(() => {
    const h = document.querySelector('plan-header');
    return !!h && h.innerHTML.trim().length > 0;
  }, null, { timeout: 10000 }).catch(() => {});
  return page.evaluate(() => {
    const h = document.querySelector('plan-header');
    return {
      styled: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() === '#0d1117',
      runtime: !!h && h.innerHTML.trim().length > 0,
      css: [...document.querySelectorAll('link[rel=stylesheet]')]
        .map((l) => l.href).filter((u) => u.endsWith('/plan-styles.css')),
      js: [...document.querySelectorAll('script[src]')]
        .map((s) => s.src).filter((u) => u.endsWith('/plan-runtime.js')),
    };
  });
}
