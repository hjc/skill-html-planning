import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { run, runAt, stageSkill, mkTmp, rmTmp, EXPECTED_SUBPATH } from './helpers.js';

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
  it('rejects an unknown command (exit 1)', () => {
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

describe('new (generation)', () => {
  it('creates a plan, bakes the resolved subpath, leaves no placeholders', () => {
    const r = run(['new', P(), '--title', 'Smoke']);
    expect(r.code, r.stderr).toBe(0);
    const html = readPlan();
    expect(html).toContain('Smoke');
    expect(html).toContain('/' + EXPECTED_SUBPATH);   // e.g. /skills/html-planning
    expect(html).not.toMatch(/\{\{\w+\}\}/);
  });
  it('rejects an unknown template (exit 1)', () => {
    const r = run(['new', P(), '--template', 'nope']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("unknown template 'nope'");
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
  it('replaces a body from stdin', () => {
    freshPlan();
    expect(run(['set-body', P(), 'overview'], { input: '<p>x</p>' }).code).toBe(0);
    expect(run(['read', P(), 'overview', '--body']).stdout).toBe('<p>x</p>');
  });
  it('structural guard aborts and preserves the file (exit 1)', () => {
    freshPlan();
    const before = readPlan();
    const r = run(['set-body', P(), 'overview'], { input: '<plan-section id="loose">bad' });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('would break the plan');
    expect(readPlan()).toBe(before);
  });
});

describe('end-to-end editing flow', () => {
  it('new -> add-section -> set -> read reflects each change', () => {
    freshPlan();
    expect(run(['add-section', P(), '--id', 'risks', '--title', 'Risks', '--after', 'overview']).code).toBe(0);
    expect(run(['set', P(), 'steps.step-1.status=done']).code).toBe(0);
    expect(run(['read', P(), 'risks']).stdout).toContain('<plan-section id="risks"');
    expect(run(['read', P(), 'steps.step-1']).stdout).toContain('status="done"');
    // a die() error path that only the subprocess can assert (exit 1):
    const bad = run(['set', P(), 'steps.step-1.status=finished']);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain("invalid status 'finished'");
  });
});

// ── Per-command coverage (stdout format, mutation, exit codes) ──

describe('templates', () => {
  it('lists selectable templates and hides _shell', () => {
    const r = run(['templates']);
    expect(r.code, r.stderr).toBe(0);
    const names = r.stdout.trim().split('\n');
    expect(names).toContain('basic');
    expect(names).toContain('tdd');
    expect(names).not.toContain('_shell');
  });
});

describe('list', () => {
  it('prints the header line and indents nested sections', () => {
    freshPlan();
    const r = run(['list', P()]);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^# .*\[draft\]/);              // header + status
    expect(r.stdout).toMatch(/\n1\. overview\b.*Overview/);  // top-level, numbered
    expect(r.stdout).toMatch(/\n {4}step-1\b.*\[todo\]/);    // depth-1 indent + status
  });
});

describe('tasks', () => {
  it('lists open (non-done) tasks, address first', () => {
    freshPlan();
    const r = run(['tasks', P()]);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^steps\.step-1\s+\[todo\]\s+First step/m);
  });
  it('--status filters; an empty set prints the notice', () => {
    freshPlan();
    expect(run(['tasks', P(), '--status', 'done']).stdout).toBe('no open tasks\n');
  });
  it('--all includes every status-bearing section', () => {
    freshPlan();
    expect(run(['tasks', P(), '--all']).stdout).toContain('steps.step-1');
  });
});

describe('read', () => {
  it('prints outerHTML by default, inner-only with --body', () => {
    freshPlan();
    const outer = run(['read', P(), 'overview']);
    expect(outer.code, outer.stderr).toBe(0);
    expect(outer.stdout).toContain('<plan-section id="overview"');
    expect(outer.stdout.trimEnd().endsWith('</plan-section>')).toBe(true);
    const body = run(['read', P(), 'overview', '--body']).stdout;
    expect(body).not.toContain('<plan-section');          // inner content only
  });
  it('reads the header element', () => {
    freshPlan();
    expect(run(['read', P(), 'header']).stdout).toContain('<plan-header');
  });
  it('errors (exit 1) on an unknown address', () => {
    freshPlan();
    const r = run(['read', P(), 'nope']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("section 'nope' not found");
  });
});

describe('set-body (--append + report line)', () => {
  it('appends to the existing body and reports a char count', () => {
    freshPlan();
    const orig = run(['read', P(), 'overview', '--body']).stdout;
    const r = run(['set-body', P(), 'overview', '--append'], { input: '<p>tail</p>' });
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/set body of overview \(appended\).* \d+ chars/);  // dash-agnostic
    expect(run(['read', P(), 'overview', '--body']).stdout).toBe(orig + '<p>tail</p>');
  });
});

describe('add-section', () => {
  it('inserts --after / --before a ref, in document order', () => {
    freshPlan();
    expect(run(['add-section', P(), '--id', 'risks', '--title', 'Risks', '--after', 'overview']).code).toBe(0);
    expect(run(['add-section', P(), '--id', 'intro', '--before', 'overview']).code).toBe(0);
    const list = run(['list', P()]).stdout;
    expect(list.indexOf('intro')).toBeLessThan(list.indexOf('overview'));
    expect(list.indexOf('risks')).toBeGreaterThan(list.indexOf('overview'));
    expect(list.indexOf('risks')).toBeLessThan(list.indexOf('scope'));
  });
  it('nests under --parent and seeds from --body-file', () => {
    freshPlan();
    const bf = join(dir, 'body.html');
    writeFileSync(bf, '<p>seeded</p>');
    expect(run(['add-section', P(), '--id', 'step-2', '--parent', 'steps', '--body-file', bf]).code).toBe(0);
    expect(run(['read', P(), 'steps.step-2', '--body']).stdout).toContain('<p>seeded</p>');
  });
  it('refuses a duplicate id and a missing --id (exit 1)', () => {
    freshPlan();
    const dup = run(['add-section', P(), '--id', 'overview']);
    expect(dup.code).toBe(1);
    expect(dup.stderr).toContain("section 'overview' already exists");
    const noId = run(['add-section', P(), '--title', 'x']);
    expect(noId.code).toBe(1);
    expect(noId.stderr).toContain('add-section requires --id');
  });
});

describe('rm-section', () => {
  it('removes a section', () => {
    freshPlan();
    const r = run(['rm-section', P(), 'anti-patterns']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toBe("removed 'anti-patterns'\n");
    expect(run(['list', P()]).stdout).not.toContain('anti-patterns');
  });
  it('refuses to remove the header (exit 1)', () => {
    freshPlan();
    const r = run(['rm-section', P(), 'header']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('cannot remove the header');
  });
});

describe('move-section', () => {
  it('moves a section before a ref', () => {
    freshPlan();
    const r = run(['move-section', P(), 'verification', '--before', 'overview']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toBe("moved 'verification' before 'overview'\n");
    const list = run(['list', P()]).stdout;
    expect(list.indexOf('verification')).toBeLessThan(list.indexOf('overview'));
  });
  it('rejects moving relative to itself and a missing ref (exit 1)', () => {
    freshPlan();
    const self = run(['move-section', P(), 'overview', '--after', 'overview']);
    expect(self.code).toBe(1);
    expect(self.stderr).toContain('cannot move a section relative to itself');
    const noRef = run(['move-section', P(), 'overview']);
    expect(noRef.code).toBe(1);
    expect(noRef.stderr).toContain('requires --after');
  });
});
