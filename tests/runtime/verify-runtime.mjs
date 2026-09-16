// `npm run verify:runtime` — the required check for any plan-runtime.js or
// plan-styles.css change. Loads examples/sample-plan.html in a headless browser
// twice, through verify-diagrams.mjs:
//
//   1. over file://, and
//   2. through serve-split.mjs, which pauses the HTML mid-diagram so the runtime
//      registers while the parser is still inside the element. A file:// load
//      never reproduces that parse race, so it cannot prove a registration fix.
//
// Every `pass` field must be true and the page must log no console errors or
// warnings, on both loads. Exits 1 otherwise. Kept out of `npm test` on
// purpose: it needs a browser and network access (Mermaid loads from cdnjs).
//
// The browser driver defaults to ~/.claude/skills/browser-automation/browser.mjs;
// set BROWSER_MJS to point elsewhere.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = resolve(HERE, '..', '..', 'skills', 'html-planning');
const PAGE = 'examples/sample-plan.html';
const ASSERTIONS = join(HERE, 'verify-diagrams.mjs');
const BROWSER = process.env.BROWSER_MJS || join(homedir(), '.claude', 'skills', 'browser-automation', 'browser.mjs');

if (!existsSync(BROWSER)) {
  console.error(`verify:runtime: browser driver not found at ${BROWSER} (set BROWSER_MJS)`);
  process.exit(1);
}

function load(label, url) {
  const r = spawnSync(process.execPath, [BROWSER, url, '--script', ASSERTIONS], { encoding: 'utf8', timeout: 180000 });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const start = out.indexOf('{', out.indexOf('script'));
  const end = out.indexOf('console errors/warnings');
  let result = null;
  try { result = JSON.parse(out.slice(start, end).trim()); } catch { /* reported below */ }
  const consoleClean = /console errors\/warnings \(0\)/.test(out);
  const pass = result && result.pass;
  const ok = !!pass && Object.values(pass).every((v) => v === true) && consoleClean;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  ${url}`);
  if (!ok) {
    console.log(pass ? JSON.stringify({ pass, consoleClean }, null, 2) : out);
  }
  return ok;
}

function startServer() {
  return new Promise((resolveUrl, reject) => {
    const child = spawn(process.execPath, [join(HERE, 'serve-split.mjs'), SKILL_DIR, PAGE, '0', '800', '300']);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      const m = /http:\/\/\S+/.exec(chunk);
      if (m) resolveUrl({ child, url: m[0] });
    });
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`serve-split exited early (${code})`)));
  });
}

const fileOk = load('file://', pathToFileURL(join(SKILL_DIR, PAGE)).href);
const { child, url } = await startServer();
let httpOk = false;
try {
  httpOk = load('split-stream HTTP', url);
} finally {
  child.kill();
}
process.exit(fileOk && httpOk ? 0 : 1);
