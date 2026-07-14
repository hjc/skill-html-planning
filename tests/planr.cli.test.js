import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { run, runAt, stageSkill, mkTmp, rmTmp, EXPECTED_SUBPATH } from './helpers.js';

// This is the WIRING suite: it proves what only a real subprocess can — argv
// dispatch, real exit codes, stdin piping, byte-exact file round-trips, the
// resolveSkillSubpath argv[1] bake, and that a PlanError actually becomes exit 1
// via main()'s catch → die(). Per-command validation MESSAGES and stdout FORMAT
// live in tests/planr.cores.test.js (in-process, via toThrow / return values).

let dir;
const P = () => join(dir, 'plan.html');
const readPlan = () => readFileSync(P(), 'utf8');
const freshPlan = () => {
  const r = run(['new', P(), '--template', 'tdd']);
  expect(r.code, r.stderr).toBe(0);
};

beforeEach(() => { dir = mkTmp(); });
afterEach(() => { rmTmp(dir); });

describe('dispatch + exit codes', () => {
  it('prints usage with no args (exit 0)', () => {
    const r = run([]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('generate and manipulate plan files');
  });
  it('rejects an unknown command (exit 1) — proves main() catch → die() fires', () => {
    const r = run(['frobnicate']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("unknown command 'frobnicate'");
  });
  it('requires a <file> argument (exit 1)', () => {
    const r = run(['list']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("'list' requires a <file> argument");
  });
});

describe('resolveSkillSubpath wiring (real argv[1] under .claude)', () => {
  it('bakes the install subpath name-agnostically', () => {
    const staged = stageSkill(dir, 'skills/custom-name');
    const out = join(dir, 'out.html');
    expect(runAt(staged, ['new', out]).code).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('/skills/custom-name');
  });
});

describe('read --body | set-body round-trip (crosses the process boundary)', () => {
  it('is byte-exact via --file — file bytes unchanged', () => {
    freshPlan();
    const before = readPlan();
    const body = run(['read', P(), 'overview', '--body']).stdout;
    const hunk = join(dir, 'hunk.html');
    writeFileSync(hunk, body);
    expect(run(['set-body', P(), 'overview', '--file', hunk]).code).toBe(0);
    expect(readPlan()).toBe(before);
  });
  it('replaces a body from stdin (stdin piping wiring)', () => {
    freshPlan();
    expect(run(['set-body', P(), 'overview'], { input: '<p>x</p>' }).code).toBe(0);
    expect(run(['read', P(), 'overview', '--body']).stdout).toBe('<p>x</p>');
  });
});

describe('end-to-end editing flow', () => {
  it('new -> add-section -> set -> read reflects each change', () => {
    freshPlan();
    expect(run(['add-section', P(), '--id', 'risks', '--title', 'Risks', '--after', 'overview']).code).toBe(0);
    expect(run(['set', P(), 'steps.step-1.status=done']).code).toBe(0);
    expect(run(['read', P(), 'risks']).stdout).toContain('<plan-section id="risks"');
    expect(run(['read', P(), 'steps.step-1']).stdout).toContain('status="done"');
    // a PlanError path that only the subprocess can assert (exit 1): proves the
    // core's throw is mapped to die() → exit 1 by main()'s catch.
    const bad = run(['set', P(), 'steps.step-1.status=finished']);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain("invalid status 'finished'");
  });
});
