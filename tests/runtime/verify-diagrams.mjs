// browser.mjs --script for examples/sample-plan.html. Measures the rendered
// diagrams on a cold load and three warm reloads, then exercises a re-connect
// and an empty source in the live page. Every field in `pass` must be true.
const settle = (page) => page.waitForFunction(
  () => document.querySelectorAll('plan-diagram').length > 0
     && document.querySelectorAll('.diagram-render[aria-busy]').length === 0,
  null, { timeout: 30000 },
);

const measure = (page) => page.evaluate(() => {
  const ds = [...document.querySelectorAll('plan-diagram')];
  const svgOf = (i) => ds[i] && ds[i].querySelector('.diagram-render svg');
  const brSvg = ds.find((d) => (d.getAttribute('caption') || '').startsWith('Slices with two-line labels'));
  const wide = ds.find((d) => (d.getAttribute('caption') || '').startsWith('A long pipeline'));
  const wideSvg = wide && wide.querySelector('svg');
  const wideBody = wide && wide.querySelector('.diagram-body');
  const labels = brSvg ? [...brSvg.querySelectorAll('.nodeLabel')].map((n) => n.innerText) : [];
  return {
    diagrams: ds.length,
    svg: document.querySelectorAll('.diagram-render svg').length,
    errors: [...document.querySelectorAll('.diagram-error')].map((e) => e.textContent),
    brElements: brSvg ? brSvg.querySelectorAll('svg br').length : -1,
    labels,
    ampersand: labels.includes('S3 · Reporting & exports'),
    wideNatural: wideSvg ? wideSvg.viewBox.baseVal.width : -1,
    wideRendered: wideSvg ? wideSvg.getBoundingClientRect().width : -1,
    wideBodyClient: wideBody ? wideBody.clientWidth : -1,
    wideBodyScroll: wideBody ? wideBody.scrollWidth : -1,
    firstSvgPresent: !!svgOf(0),
  };
});

export default async (page) => {
  await settle(page);
  const cold = await measure(page);
  const warm = [];
  for (let i = 0; i < 3; i++) {
    await page.reload();
    await settle(page);
    warm.push(await measure(page));
  }

  // Move the first diagram: a second connectedCallback must re-render from the
  // stashed source, not from the SVG the first render left behind.
  await page.evaluate(() => {
    const d = document.querySelector('plan-diagram');
    d.parentNode.appendChild(d);
  });
  await settle(page);
  const moved = await page.evaluate(() => {
    const d = document.querySelector('main plan-section:last-of-type > plan-diagram:last-child');
    return { svg: !!d.querySelector('.diagram-render svg'), error: !!d.querySelector('.diagram-error') };
  });

  // A diagram connected with no source at all reports the runtime, not Mermaid.
  const empty = await page.evaluate(() => {
    const d = document.createElement('plan-diagram');
    document.querySelector('main').appendChild(d);
    const e = d.querySelector('.diagram-error');
    const text = e ? e.textContent : null;
    d.remove();
    return text;
  });

  // Colours come from tones. A probe span resolves each token to the rgb()
  // string getComputedStyle reports, so every comparison is exact. The sample's
  // header status is `draft`.
  const colours = await page.evaluate(() => {
    const token = (v) => {
      const p = document.createElement('span');
      p.style.color = `var(${v})`;
      document.body.appendChild(p);
      const c = getComputedStyle(p).color;
      p.remove();
      return c;
    };
    const badge = (type) => getComputedStyle(document.querySelector(`plan-tab plan-badge[type="${type}"]`)).color;
    return {
      statusDot: getComputedStyle(document.querySelector('plan-header .meta-row .meta-chip:first-child .dot')).backgroundColor,
      badges: {
        decided: badge('decided'), open: badge('open'), deferred: badge('deferred'),
        high: badge('high'), medium: badge('medium'), low: badge('low'),
      },
      token: { amber: token('--amber'), red: token('--red'), green: token('--green'), muted: token('--text-muted') },
    };
  });
  const b = colours.badges, k = colours.token;

  const good = (m) => m.svg === m.diagrams && m.errors.length === 0;
  return {
    pass: {
      coldAllRendered: good(cold),
      warmAllRendered: warm.every(good),
      brKept: cold.brElements === 2 && cold.labels.includes('S1 · Staging environment\ninfra + portals'),
      entityDecoded: cold.ampersand,
      wideNaturalSize: cold.wideRendered === cold.wideNatural && cold.wideBodyScroll > cold.wideBodyClient,
      movedRerenders: moved.svg && !moved.error,
      emptySourceLoud: typeof empty === 'string' && empty.includes('not a content error'),
      statusDotToned: colours.statusDot === k.amber,
      badgeColoursKept: b.decided === k.green && b.open === k.amber && b.deferred === k.muted
        && b.high === k.green && b.medium === k.amber && b.low === k.red,
    },
    cold,
    warm: warm.map((m) => ({ svg: m.svg, errors: m.errors.length })),
    moved,
    empty,
    colours,
  };
};
