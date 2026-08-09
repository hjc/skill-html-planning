import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { run, runAt, stageSkill, mkTmp, rmTmp, EXPECTED_SUBPATH, SKILL_DIR } from './helpers.js';

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
// `templates` prints a name/description table; the name is the first column of
// each row above the trailing hint paragraph.
const templateNames = () =>
  run(['templates']).stdout.split('\n\n')[0].trim().split('\n').map(l => l.split(/\s+/)[0]);

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

describe('new --set (one-command scaffold)', () => {
  it('applies dotted keys to the generated file, so `new` needs no follow-up `set`', () => {
    const r = run(['new', P(), '--title', 'Probe', '--template', 'issue',
      '--set', 'header.subtitle=SUB', '--set', 'header.chips=A | B', '--set', 'header.status=review']);
    expect(r.code, r.stderr).toBe(0);
    const html = readPlan();
    expect(html).toContain('subtitle="SUB"');
    expect(html).toContain('chips="A | B"');
    expect(html).toContain('status="review"');
  });
  it('fills every variable the shell declares, bare — including lang', () => {
    const r = run(['new', P(), '--title', 'Probe', '--set', 'lang=fr',
      '--set', 'subtitle=SUB', '--set', 'status=review', '--set', 'chips=A | B']);
    expect(r.code, r.stderr).toBe(0);
    const html = readPlan();
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('subtitle="SUB"');
    expect(html).toContain('status="review"');
    expect(html).toContain('chips="A | B"');
    expect(html).not.toContain('{{');
  });
  it('falls back to each declared default when a variable is not set', () => {
    expect(run(['new', P(), '--title', 'Probe']).code).toBe(0);
    const html = readPlan();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('status="draft"');
    expect(html).toContain('subtitle=""');
  });
  it('exits 1 rather than dropping an unknown --set key, and lists the real ones', () => {
    const r = run(['new', P(), '--set', 'frobnicate=1']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("matches no {{placeholder}}");
    expect(r.stderr).toMatch(/lang \(default: en\)/);
  });
  it('validates a bare status fill, not just the dotted node address', () => {
    // The placeholder path bypasses planSet, so it needs its own check or
    // `--set status=aproved` silently writes a typo the header renders greyed.
    for (const spec of ['status=aproved', 'header.status=aproved']) {
      const r = run(['new', P(), '--set', spec]);
      expect(r.code, spec).toBe(1);
      expect(r.stderr, spec).toContain("invalid status 'aproved'");
    }
  });
});

describe('check', () => {
  it('passes a freshly generated plan and fails a corrupted one (exit 1)', () => {
    freshPlan();
    const ok = run(['check', P()]);
    expect(ok.code, ok.stderr).toBe(0);
    expect(ok.stdout).toContain('structure OK');
    // `check` and `list` must agree on the section count. A commented plan tag
    // in a template inflated `grep -c` — balanced, so it never read as a
    // failure — and sent readers hunting a splice bug that did not exist.
    expect(ok.stdout).toMatch(/sections: 9 \(1 nested\)/);
    expect(ok.stdout).toContain('plan-section 9');
    const listed = run(['list', P(), '--no-outline']).stdout.trim().split('\n').length - 1;  // minus the title line
    expect(listed).toBe(9);

    writeFileSync(P(), readPlan().replace('</plan-section>', ''));
    const bad = run(['check', P()]);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain('structure check FAILED');
  });
});

describe('templates', () => {
  it('lists every template with a gist, and describes one by name', () => {
    const list = run(['templates']);
    expect(list.code, list.stderr).toBe(0);
    expect(list.stdout).toMatch(/^basic\s+\S/m);
    const one = run(['templates', 'tdd']);
    expect(one.code, one.stderr).toBe(0);
    expect(one.stdout).toContain('# tdd');
    expect(one.stdout).toContain('Scaffolds 9 sections:');
    expect(run(['templates', 'nope']).code).toBe(1);
  });
  it('every shipped template documents itself, with no literal plan tag in the comment', () => {
    // The convention this enforces: a template's leading comment IS its docs.
    // A literal <plan-* inside it would inflate a reader's grep count.
    for (const name of templateNames()) {
      const out = run(['templates', name]);
      expect(out.stdout, name).not.toContain('no leading comment');
      const doc = readFileSync(join(SKILL_DIR, 'templates', `${name}.html`), 'utf8');
      const comment = /^\s*<!--([\s\S]*?)-->/.exec(doc);
      expect(comment, name).toBeTruthy();
      expect(comment[1], name).not.toMatch(/<plan-[a-z]/);
    }
  });
});

describe('shipped artifacts pass their own check', () => {
  it('validates every template and the sample plan', () => {
    // The showcase and every scaffold are the skill's own output; if `check`
    // rejects one of them, either the artifact or the checker is wrong.
    expect(run(['check', join(SKILL_DIR, 'examples', 'sample-plan.html')]).code).toBe(0);
    for (const t of templateNames()) {
      const out = join(dir, `${t}.html`);
      expect(run(['new', out, '--template', t]).code, t).toBe(0);
      const r = run(['check', out]);
      expect(r.code, `${t}: ${r.stderr}`).toBe(0);
    }
  });
});

describe('section-relative writes', () => {
  it('appends into a nested container from --file and stays structurally valid', () => {
    freshPlan();
    const hunk = join(dir, 'hunk.html');
    writeFileSync(hunk, '<tr><td>2</td><td>added row</td><td>via the CLI</td></tr>');
    const r = run(['append', P(), 'recon', '--into', 'tbody', '--file', hunk]);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain("at the end of 'recon' → tbody");
    expect(readPlan()).toContain('<td>added row</td>');
    expect(run(['check', P()]).code).toBe(0);
  });
  it('prepends from stdin and anchors on a heading', () => {
    freshPlan();
    expect(run(['prepend', P(), 'overview'], { input: '<plan-callout type="warn">Amended.</plan-callout>' }).code).toBe(0);
    expect(run(['read', P(), 'overview', '--body']).stdout).toMatch(/^\s*<plan-callout type="warn">Amended\./);
    const r = run(['insert', P(), 'steps.step-1', '--after-heading', 'Green Phase'], { input: '<p>note</p>' });
    expect(r.code, r.stderr).toBe(0);
    expect(readPlan()).toMatch(/<h4>Green Phase<\/h4>\n\s*<p>note<\/p>/);
  });
  it('exits 1 when `insert` is given no anchor', () => {
    freshPlan();
    const r = run(['insert', P(), 'overview'], { input: '<p>x</p>' });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('insert requires --before-heading');
  });
});

describe('badge', () => {
  it('flips a badge inside a table row, and refuses an ambiguous match (exit 1)', () => {
    freshPlan();
    const hunk = join(dir, 'rows.html');
    writeFileSync(hunk, '<plan-table><table><tbody>' +
      '<tr><td>q16 staging</td><td><plan-badge type="open"></plan-badge></td></tr>' +
      '<tr><td>q18 signals</td><td><plan-badge type="open"></plan-badge></td></tr>' +
      '</tbody></table></plan-table>');
    expect(run(['set-body', P(), 'recon', '--file', hunk]).code).toBe(0);
    expect(run(['badge', P(), '--match', 'q16', '--set', 'decided']).code).toBe(0);
    expect(readPlan()).toContain('<td>q16 staging</td><td><plan-badge type="decided">');
    expect(readPlan()).toContain('<td>q18 signals</td><td><plan-badge type="open">');
    const amb = run(['badge', P(), '--match', 'q1', '--set', 'decided']);
    expect(amb.code).toBe(1);
    expect(amb.stderr).toContain('matches 2 rows');
  });
});

describe('list outline', () => {
  it('includes authored headings by default, and drops them for --no-outline', () => {
    freshPlan();
    const out = run(['list', P()]).stdout;
    expect(out).toMatch(/5\.1\. step-1 — First step.*\n\s+h4\s+Red Phase\n\s+h4\s+Green Phase/);
    expect(run(['list', P(), '--no-outline']).stdout).not.toContain('Red Phase');
  });
});

describe('flag parsing', () => {
  it('lets a valueless flag precede the file — it used to eat the filename', () => {
    // `tasks --all plan.html` consumed plan.html as --all's value, then failed
    // with "requires a <file> argument" while the file sat on the command line.
    freshPlan();
    for (const args of [['tasks', '--all', P()], ['tasks', P(), '--all']]) {
      const r = run(args);
      expect(r.code, `${args.join(' ')}: ${r.stderr}`).toBe(0);
      expect(r.stdout).toContain('steps.step-1');
    }
    expect(run(['list', '--no-outline', P()]).code).toBe(0);
    expect(run(['read', '--body', P(), 'overview']).stdout).not.toContain('<plan-section');
    // A flag that DOES take a value still consumes the next token either way.
    expect(run(['tasks', '--status', 'todo', P()]).stdout).toContain('step-1');
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
  it('applies every positional assignment `set` is given', () => {
    freshPlan();
    const r = run(['set', P(), 'header.status=review', 'header.chips=A | B | C', 'overview.status=done']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout.trim().split('\n')).toHaveLength(3);
    const html = readPlan();
    expect(html).toContain('status="review"');
    expect(html).toContain('chips="A | B | C"');
    expect(run(['read', P(), 'overview']).stdout).toContain('status="done"');
  });
});
