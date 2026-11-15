// `npm run verify:loader` — the required check for any change to the inline
// loader in templates/_shell.html. Stages the skill in a throwaway repo at
// <tmp>/repo/.claude/skills/html-planning, scaffolds plans in the places a
// consuming repo keeps them, and loads each one in a headless browser over
// file:// and over HTTP (serve-split.mjs, unsplit), asserting what rendered:
//
//   .claude/plans/a.html         new loader, inside .claude      styled, no failed request
//   docs/plans/x/map.html        new loader, outside .claude     styled, no failed request
//   .plans/y/plan.html           new loader, sibling mount       styled, no failed request
//   .claude/plans/legacy.html    version-1 loader, inside .claude  styled, no failed request
//   docs/plans/legacy/map.html   version-1 loader, outside .claude unstyled (the bug), then
//                                `planr loader` -> styled, no failed request
//   docs/a/b/c/moved.html        new loader, moved after `new` (stale hint): styled by the
//                                ancestor search; `check` warns; `planr loader` -> no failed request
//
// Kept out of `npm test` for the same reason as verify:runtime: it needs the
// browser-automation driver (~/.claude/skills/browser-automation/browser.mjs,
// or BROWSER_MJS). Exits 1 on any failed expectation.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = resolve(HERE, '..', '..', 'skills', 'html-planning');
const PROBE = join(HERE, 'loader-probe.mjs');
const BROWSER = process.env.BROWSER_MJS || join(homedir(), '.claude', 'skills', 'browser-automation', 'browser.mjs');
if (!existsSync(BROWSER)) {
  console.error(`verify:loader: browser driver not found at ${BROWSER} (set BROWSER_MJS)`);
  process.exit(1);
}

// The loader every plan carried before data-planr-loader="2", verbatim.
const V1_LOADER = `<script>
    (function() {
      var segs = location.pathname.split('/');
      var idx = segs.indexOf('.claude');
      if (idx === -1) { /* fallback: try parent dirs */
        var base = location.pathname.substring(0, location.pathname.lastIndexOf('/'));
        while (base && !base.endsWith('.claude')) base = base.substring(0, base.lastIndexOf('/'));
        if (base) idx = base.split('/').indexOf('.claude');
      }
      var root = idx !== -1 ? segs.slice(0, idx + 1).join('/') : '.claude';
      var skillBase = root + '/skills/html-planning';
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = skillBase + '/plan-styles.css';
      document.head.appendChild(link);
      var script = document.createElement('script');
      script.src = skillBase + '/plan-runtime.js';
      document.head.appendChild(script);
    })();
  </script>`;

const tmp = mkdtempSync(join(tmpdir(), 'planr-loader-'));
const repo = join(tmp, 'repo');
const planr = join(repo, '.claude', 'skills', 'html-planning', 'planr.js');
mkdirSync(dirname(dirname(planr)), { recursive: true });
cpSync(SKILL_DIR, dirname(planr), { recursive: true });

function cli(args) {
  const r = spawnSync(process.execPath, [planr, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`planr ${args.join(' ')} exited ${r.status}: ${r.stderr}`);
  return r.stdout;
}
const at = (rel) => join(repo, ...rel.split('/'));
const scaffold = (rel) => cli(['new', at(rel), '--title', rel]);
function legacy(rel) {
  scaffold(rel);
  const html = readFileSync(at(rel), 'utf8');
  writeFileSync(at(rel), html.replace(/<script data-planr-loader[\s\S]*?<\/script>/, V1_LOADER));
}

scaffold('.claude/plans/a.html');
scaffold('docs/plans/x/map.html');
scaffold('.plans/y/plan.html');
legacy('.claude/plans/legacy.html');
legacy('docs/plans/legacy/map.html');
scaffold('docs/plans/x/moved.html');
mkdirSync(at('docs/a/b/c'), { recursive: true });
renameSync(at('docs/plans/x/moved.html'), at('docs/a/b/c/moved.html'));

function load(url) {
  const r = spawnSync(process.execPath, [BROWSER, url, '--script', PROBE], { encoding: 'utf8', timeout: 120000 });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const start = out.indexOf('{', out.indexOf('script'));
  const end = out.indexOf('console errors/warnings');
  let result = null;
  try { result = JSON.parse(out.slice(start, end).trim()); } catch { /* reported below */ }
  const failed = Number((/requests failed \((\d+)\)/.exec(out) || [])[1] ?? NaN);
  return { result, failed, out };
}

let ok = true;
function expectPage(label, url, { styled, failed }) {
  const r = load(url);
  const good = r.result && r.result.styled === styled && r.result.runtime === styled
    && (failed === 'any' || r.failed === failed);
  ok = ok && !!good;
  console.log(`${good ? 'PASS' : 'FAIL'}  ${label.padEnd(54)} styled=${r.result?.styled} runtime=${r.result?.runtime} failed=${r.failed}`);
  if (!good) console.log(r.out);
}
function expectWarning(rel, pattern) {
  const r = spawnSync(process.execPath, [planr, 'check', at(rel)], { encoding: 'utf8' });
  const good = r.status === 0 && pattern.test(r.stdout);
  ok = ok && good;
  console.log(`${good ? 'PASS' : 'FAIL'}  check ${rel} warns ${pattern}`);
  if (!good) console.log(r.stdout + r.stderr);
}

function sweep(base, label) {
  const url = (rel) => base === 'file'
    ? pathToFileURL(at(rel)).href
    : `${base}/${rel.split('/').map(encodeURIComponent).join('/')}`;
  expectPage(`${label} .claude/plans/a.html`, url('.claude/plans/a.html'), { styled: true, failed: 0 });
  expectPage(`${label} docs/plans/x/map.html`, url('docs/plans/x/map.html'), { styled: true, failed: 0 });
  expectPage(`${label} .plans/y/plan.html`, url('.plans/y/plan.html'), { styled: true, failed: 0 });
  expectPage(`${label} .claude/plans/legacy.html (v1)`, url('.claude/plans/legacy.html'), { styled: true, failed: 0 });
  expectPage(`${label} docs/a/b/c/moved.html (stale hint)`, url('docs/a/b/c/moved.html'), { styled: true, failed: 'any' });
}

function serve() {
  return new Promise((resolveUrl, reject) => {
    // `-` names no page, so nothing is split: a plain static server.
    const child = spawn(process.execPath, [join(HERE, 'serve-split.mjs'), repo, '-', '0', '0', '300']);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      const m = /(http:\/\/[^/\s]+)/.exec(chunk);
      if (m) resolveUrl({ child, origin: m[1] });
    });
    child.on('error', reject);
  });
}

try {
  // The bug, as it shipped: a version-1 plan outside .claude renders unstyled.
  expectPage('file:// docs/plans/legacy/map.html (v1, before)', pathToFileURL(at('docs/plans/legacy/map.html')).href,
    { styled: false, failed: 'any' });
  expectWarning('docs/plans/legacy/map.html', /finds the skill only from inside a \.claude directory/);
  expectWarning('docs/a/b/c/moved.html', /data-skill-href '\.\.\/\.\.\/\.\.\/\.claude\/skills\/html-planning' does not reach/);

  sweep('file', 'file://');
  const { child, origin } = await serve();
  try { sweep(origin, 'http'); } finally { child.kill(); }

  // The upgrade path: rewrite the loader in place, then it renders with no miss.
  const before = readFileSync(at('docs/plans/legacy/map.html'), 'utf8');
  console.log(`      planr loader: ${cli(['loader', at('docs/plans/legacy/map.html')]).trim()}`);
  console.log(`      planr loader: ${cli(['loader', at('docs/a/b/c/moved.html')]).trim()}`);
  const after = readFileSync(at('docs/plans/legacy/map.html'), 'utf8');
  const i = before.indexOf(V1_LOADER);
  const exact = i !== -1 && after.slice(0, i) === before.slice(0, i)
    && after.endsWith(before.slice(i + V1_LOADER.length));
  ok = ok && exact;
  console.log(`${exact ? 'PASS' : 'FAIL'}  planr loader leaves everything outside the <script> byte-exact`);
  expectPage('file:// docs/plans/legacy/map.html (after loader)', pathToFileURL(at('docs/plans/legacy/map.html')).href,
    { styled: true, failed: 0 });
  expectPage('file:// docs/a/b/c/moved.html (after loader)', pathToFileURL(at('docs/a/b/c/moved.html')).href,
    { styled: true, failed: 0 });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
