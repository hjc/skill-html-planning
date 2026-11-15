import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { PLANR_URL, SKILL_DIR } from './helpers.js';

// The inline loader in templates/_shell.html, run in-process against a fake
// document: which URLs it tries, in what order, and where it stops. What a real
// browser does with those URLs is `npm run verify:loader`'s job.

let planr;
let shell;
beforeAll(async () => {
  const m = await import(PLANR_URL);
  planr = m.default ?? m;
  shell = readFileSync(join(SKILL_DIR, 'templates', '_shell.html'), 'utf8');
});

// The loader <script> the shell renders for these baked values, as
// { attrs, code }.
function loaderFor(vars) {
  const html = planr.render(shell, vars);
  const l = planr.findLoader(html);
  const el = html.slice(l.start, l.end);
  const open = el.indexOf('>') + 1;
  return { attrs: el.slice(0, open), code: el.slice(open, el.lastIndexOf('</script')) };
}

// Run the loader at `href`, where `exists(url)` says which stylesheet/script
// URLs load. Events fire asynchronously, as a browser's do. Resolves once the
// loader stops: with the stylesheets it tried, the script it injected, and any
// console.error.
function runLoader({ href, skillHref = '', skillSubpath = 'skills/html-planning', exists }) {
  const { attrs, code } = loaderFor({ skillHref, skillSubpath });
  const attr = (n) => planr.decodeEntities(planr.getAttr(attrs.slice('<script'.length, -1), n) ?? '');
  return new Promise((resolve) => {
    const tried = [], scripts = [], errors = [];
    let pending = 0;
    const settle = () => { if (pending === 0) resolve({ tried, scripts, errors }); };
    const head = {
      appendChild(el) {
        el.parentNode = head;
        if (el.tag === 'script') { scripts.push(el.src); return; }
        tried.push(el.href);
        pending++;
        setTimeout(() => {
          pending--;
          (exists(el.href) ? el.onload : el.onerror)();
          settle();
        }, 0);
      },
      removeChild(el) { el.removed = true; },
    };
    const document = {
      currentScript: { getAttribute: attr },
      createElement: (tag) => ({ tag }),
      head,
    };
    const location = new URL(href);
    vm.runInNewContext(code, {
      document, location, URL,
      console: { error: (m) => { errors.push(m); } },
    });
    settle();
  });
}
const SKILL = 'file:///C:/repo/.claude/skills/html-planning';
const at = (base) => (u) => u === `${base}/plan-styles.css`;

describe('the inline loader (templates/_shell.html)', () => {
  it('loads from the baked hint first, and nothing else, when it is right', async () => {
    const r = await runLoader({
      href: 'file:///C:/repo/docs/plans/x/map.html',
      skillHref: '../../../.claude/skills/html-planning',
      exists: at(SKILL),
    });
    expect(r.tried).toEqual([`${SKILL}/plan-styles.css`]);
    expect(r.scripts).toEqual([`${SKILL}/plan-runtime.js`]);
    expect(r.errors).toEqual([]);
  });

  it('finds a version-1 style plan inside .claude with no hint at all', async () => {
    const r = await runLoader({ href: 'file:///C:/repo/.claude/plans/deep/a.html', exists: at(SKILL) });
    expect(r.tried).toEqual([`${SKILL}/plan-styles.css`]);
    expect(r.scripts).toEqual([`${SKILL}/plan-runtime.js`]);
  });

  it('tries the hint once even when it equals the .claude path', async () => {
    const r = await runLoader({
      href: 'file:///C:/repo/.claude/plans/a.html', skillHref: '../skills/html-planning', exists: at(SKILL),
    });
    expect(r.tried).toEqual([`${SKILL}/plan-styles.css`]);
  });

  it('falls back from a stale hint to the nearest ancestor holding .claude/<subpath>', async () => {
    const r = await runLoader({
      href: 'file:///C:/repo/docs/a/b/moved.html',
      skillHref: '../../.claude/skills/html-planning',   // right for docs/plans/x/, wrong here
      exists: at(SKILL),
    });
    expect(r.tried).toEqual([
      'file:///C:/repo/docs/.claude/skills/html-planning/plan-styles.css',   // the stale hint
      'file:///C:/repo/docs/a/b/.claude/skills/html-planning/plan-styles.css',
      'file:///C:/repo/docs/a/.claude/skills/html-planning/plan-styles.css',
      `${SKILL}/plan-styles.css`,
    ]);
    expect(r.scripts).toEqual([`${SKILL}/plan-runtime.js`]);
  });

  it('finds a sibling .plans/ mount by walking up, with no hint', async () => {
    const r = await runLoader({ href: 'file:///C:/repo/.plans/y/plan.html', exists: at(SKILL) });
    expect(r.tried.at(-1)).toBe(`${SKILL}/plan-styles.css`);
    expect(r.scripts).toEqual([`${SKILL}/plan-runtime.js`]);
  });

  it('resolves against the server root over HTTP', async () => {
    const base = 'http://localhost:8080/.claude/skills/html-planning';
    const r = await runLoader({
      href: 'http://localhost:8080/docs/plans/x/map.html?v=1#top',
      skillHref: '../../../.claude/skills/html-planning',
      exists: at(base),
    });
    expect(r.tried).toEqual([`${base}/plan-styles.css`]);
    expect(r.scripts).toEqual([`${base}/plan-runtime.js`]);
  });

  it('uses the baked subpath, so the skill may live under any name', async () => {
    const base = 'file:///C:/repo/.claude/tools/planning';
    const r = await runLoader({
      href: 'file:///C:/repo/docs/p.html', skillSubpath: 'tools/planning', exists: at(base),
    });
    expect(r.scripts).toEqual([`${base}/plan-runtime.js`]);
  });

  it('stops after ten directories and says what it tried', async () => {
    const deep = 'file:///C:/' + Array.from({ length: 14 }, (_, i) => `d${i}`).join('/') + '/p.html';
    const r = await runLoader({ href: deep, exists: () => false });
    expect(r.tried).toHaveLength(10);
    expect(r.tried[0]).toBe('file:///C:/d0/d1/d2/d3/d4/d5/d6/d7/d8/d9/d10/d11/d12/d13/.claude/skills/html-planning/plan-styles.css');
    expect(r.scripts).toEqual([]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/^html-planning: plan-styles\.css not found; tried /);
  });

  it('includes the filesystem root in a shallow walk', async () => {
    const r = await runLoader({ href: 'http://h/p.html', exists: () => false });
    expect(r.tried).toEqual(['http://h/.claude/skills/html-planning/plan-styles.css']);
  });
});
