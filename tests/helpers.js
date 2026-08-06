import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// ── The ONE line that changes when the skill folder moves ──
// pre-move value:  resolve(HERE, '..', 'planr.js')
export const PLANR = resolve(HERE, '..', 'skills', 'html-planning', 'planr.js');

export const PLANR_URL = pathToFileURL(PLANR).href;   // for `await import()` in the unit suite
export const SKILL_DIR = dirname(PLANR);
export const TODAY = new Date().toISOString().slice(0, 10);
// Subpath resolveSkillSubpath() bakes when planr runs OUTSIDE any .claude tree.
export const EXPECTED_SUBPATH = 'skills/' + basename(SKILL_DIR);

// Run planr as a subprocess. Returns the exit code (never throws) so error
// paths are assertable. opts.input pipes stdin (for `set-body` from stdin).
export function runAt(planrPath, args, opts = {}) {
  const r = spawnSync(process.execPath, [planrPath, ...args], { encoding: 'utf8', ...opts });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
export function run(args, opts) { return runAt(PLANR, args, opts); }

export function mkTmp() { return mkdtempSync(join(tmpdir(), 'planr-')); }
export function rmTmp(d) { rmSync(d, { recursive: true, force: true }); }

// Copy the whole skill into <root>/.claude/<subpath>/ and return that planr.js,
// to prove resolveSkillSubpath() reads the real argv[1] end-to-end, any name.
export function stageSkill(root, subpath) {
  const dest = join(root, '.claude', subpath);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(SKILL_DIR, dest, { recursive: true });
  return join(dest, 'planr.js');
}
