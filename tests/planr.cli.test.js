import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
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

// planNew's own behaviour (bare vs dotted keys, defaults, validation) is
// covered in-process by the core suite. These prove the wiring, and that the
// SHIPPED _shell.html really declares the variables the core can fill.
describe('new --set (one-command scaffold)', () => {
  it('fills the shipped shell from repeated --set flags, bare and dotted', () => {
    const r = run(['new', P(), '--title', 'Probe', '--set', 'lang=fr',
      '--set', 'subtitle=SUB', '--set', 'status=review', '--set', 'header.date=2026-01-02']);
    expect(r.code, r.stderr).toBe(0);
    const html = readPlan();
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('subtitle="SUB"');
    expect(html).toContain('status="review"');
    expect(html).toContain('date="2026-01-02"');
    expect(html).not.toContain('chips=');      // the shell no longer emits the deprecated attribute
    expect(html).not.toContain('{{');           // every declared var resolved
  });
  it('exits 1 on an unknown key and on an invalid value, by either key shape', () => {
    expect(run(['new', P(), '--set', 'frobnicate=1']).stderr).toContain('matches no {{placeholder}}');
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
    expect(ok.stdout).toMatch(/sections: 10 \(1 nested\)/);
    expect(ok.stdout).toContain('plan-section 10');
    const listed = run(['list', P(), '--no-outline']).stdout.trim().split('\n').length - 1;  // minus the title line
    expect(listed).toBe(10);

    writeFileSync(P(), readPlan().replace('</plan-section>', ''));
    const bad = run(['check', P()]);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain('structure check FAILED');
  });
  it('exits 1 on a balanced but misnested document', () => {
    freshPlan();
    writeFileSync(P(), readPlan().replace('</main>',
      '  <p><code><plan-callout type="info">x</plan-callout></code></p>\n</main>'));
    const bad = run(['check', P()]);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain('<plan-callout> inside inline <code>');
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
    expect(one.stdout).toContain('Scaffolds 10 sections:');
    expect(run(['templates', 'nope']).code).toBe(1);
  });
  it('tdd and issue scaffold their fixed section ids, in order', () => {
    const ids = (name) => [...run(['templates', name]).stdout.matchAll(/^\s+[\d.]+\. (\S+)$/gm)].map(m => m[1]);
    expect(ids('issue')).toEqual(['overview', 'root-cause', 'impact', 'remediation', 'not-affected', 'open']);
    expect(ids('tdd')).toEqual(['overview', 'scope', 'recon', 'decisions', 'steps', 'step-1',
      'callsites', 'migration', 'verification', 'anti-patterns']);
  });
  it('new writes none of a shipped template\'s guidance comment into the document', () => {
    for (const name of templateNames()) {
      const out = join(dir, `${name}.html`);
      expect(run(['new', out, '--template', name]).code, name).toBe(0);
      expect(readFileSync(out, 'utf8').split('<main>')[1], name).not.toContain('<!--');
    }
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

describe('shipped docs stand alone', () => {
  // Only skills/html-planning/ is installed. A shipped doc that links outside
  // it, or points at repo-only tooling, is a broken reference for every reader
  // who did not clone the repo.
  // They are read by an LLM, never clicked, so a reference is a bare backtick
  // path: a relative Markdown link only repeats the path it wraps.
  const docs = ['SKILL.md', 'references/template-authoring.md', 'references/authoring-traps.md'];
  it('cite only references that ship, as bare paths, and never repo-only tooling', () => {
    let checked = 0;
    for (const doc of docs) {
      const text = readFileSync(join(SKILL_DIR, doc), 'utf8');
      expect(text, doc).not.toMatch(/npm (test|install)|package\.json|CLAUDE\.md|node_modules|\btests\//);
      expect(text, doc).not.toMatch(/\]\((?!https?:|#)[^)]+\)/);
      for (const rel of new Set([...text.matchAll(/`(references\/[\w.-]+\.md)`/g)].map(m => m[1]))) {
        expect(existsSync(join(SKILL_DIR, rel)), `${doc} → ${rel}`).toBe(true);
        checked++;
      }
    }
    expect(checked, 'no cited references found — has the pattern gone stale?').toBeGreaterThan(0);
  });
  it('document the consumer template directory', () => {
    // Scoped to the two docs Templates/template-authoring guidance lives in —
    // not the full `docs` list above, which also covers authoring-traps.md,
    // an unrelated reference this feature has no reason to touch.
    for (const doc of ['SKILL.md', 'references/template-authoring.md'])
      expect(readFileSync(join(SKILL_DIR, doc), 'utf8'), doc).toContain('.claude/planr-templates/');
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

describe('badge labels', () => {
  it('refuses a custom label without --text and writes nothing, even for valid rows (exit 1); --text "" clears', () => {
    freshPlan();
    const hunk = join(dir, 'rows.html');
    writeFileSync(hunk, '<plan-table><table><tbody>' +
      '<tr><td>q30 derived</td><td><plan-badge type="open">Open</plan-badge></td></tr>' +
      '<tr><td>q31 custom</td><td><plan-badge type="open">not started</plan-badge></td></tr>' +
      '</tbody></table></plan-table>');
    expect(run(['set-body', P(), 'recon', '--file', hunk]).code).toBe(0);
    const before = readPlan();
    const refused = run(['badge', P(), '--match', 'q3', '--set', 'decided', '--all']);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain('carries "not started"');
    expect(readPlan()).toBe(before);
    // An empty argv element must survive the process boundary as --text's value.
    const cleared = run(['badge', P(), '--match', 'q31', '--set', 'decided', '--text', '']);
    expect(cleared.code, cleared.stderr).toBe(0);
    expect(readPlan()).toContain('<td>q31 custom</td><td><plan-badge type="decided"></plan-badge>');
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

describe('set header.title', () => {
  it('moves the head <title> with the header, so check --strict stays clean', () => {
    freshPlan();
    const r = run(['set', P(), 'header.title=Renamed Plan']);
    expect(r.code, r.stderr).toBe(0);
    expect(readPlan()).toContain('<title>Renamed Plan</title>');
    const c = run(['check', P(), '--strict']);
    expect(c.code, c.stdout).toBe(0);
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
    const r = run(['set', P(), 'header.status=review', 'header.subtitle=A | B | C', 'overview.status=done']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout.trim().split('\n')).toHaveLength(3);
    const html = readPlan();
    expect(html).toContain('status="review"');
    expect(html).toContain('subtitle="A | B | C"');
    expect(run(['read', P(), 'overview']).stdout).toContain('status="done"');
  });
});

describe('check warnings', () => {
  it('prints warnings after the structure report and exits 0; --strict exits 1', () => {
    freshPlan();
    writeFileSync(P(), readPlan().replace('<main>', '<main>\n<!-- guidance banner left behind -->'));
    const soft = run(['check', P()]);
    expect(soft.code, soft.stderr).toBe(0);
    expect(soft.stdout).toMatch(/^structure OK[\s\S]*\n1 warning\(s\)[^\n]*\n {2}line \d+: <main> opens with a comment carrying text/);
    // --strict BEFORE the file: a valueless flag not in BOOLEAN_FLAGS eats the filename.
    const strict = run(['check', '--strict', P()]);
    expect(strict.code).toBe(1);
    expect(strict.stdout).toContain('1 warning(s)');
    expect(strict.stderr).toContain('check --strict: 1 warning(s), listed above');
  });
});

describe('check warnings (guards)', () => {
  it('every shipped template scaffolds a document that passes --strict', () => {
    for (const t of templateNames()) {
      const out = join(dir, `${t}.html`);
      expect(run(['new', out, '--template', t]).code, t).toBe(0);
      const r = run(['check', out, '--strict']);
      expect(r.code, `${t}: ${r.stdout}${r.stderr}`).toBe(0);
    }
  });
});

describe('bare-id addressing', () => {
  it('reads and sets a nested section by its bare id', () => {
    freshPlan();
    expect(run(['set', P(), 'step-1.status=done']).code).toBe(0);
    const r = run(['read', P(), 'step-1']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain('<plan-section id="step-1" title="First step" status="done">');
  });
});

describe('read --text', () => {
  it('prints structure-preserving text, with --text accepted before the file', () => {
    freshPlan();
    const r = run(['read', '--text', P(), 'step-1']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^### \d+\.1\. First step\n/);
    expect(r.stdout).toContain('#### Red Phase\n');
    expect(r.stdout).not.toContain('<');
    expect(run(['--help']).stdout).toMatch(/read\s+<file> <address> \[--body\] \[--text\]/);
  });
});

describe('text-addressed writes', () => {
  // overview gets a running list and a sentence to address by visible text.
  const seed = () => {
    freshPlan();
    const hunk = join(dir, 'seed.html');
    writeFileSync(hunk, '\n    <ul>\n      <li>alpha item</li>\n      <li>beta item</li>\n    </ul>\n' +
                        '    <p>We ship on Friday, after the review.</p>\n  ');
    expect(run(['set-body', P(), 'overview', '--file', hunk]).code).toBe(0);
  };
  const skill = () => readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');

  it('rm-item removes a list item by its text, and exits 1 on an ambiguous match', () => {
    seed();
    const amb = run(['rm-item', P(), 'overview', '--match', 'item']);
    expect(amb.code).toBe(1);
    expect(amb.stderr).toContain('matches 2 items');
    const r = run(['rm-item', P(), 'overview', '--match', 'beta', '--into', 'ul']);
    expect(r.code, r.stderr).toBe(0);
    expect(readPlan()).not.toContain('beta item');
    expect(run(['rm-item', P(), 'overview', '--all', '--match', 'item']).code).toBe(0);
    expect(readPlan()).not.toContain('alpha item');
    expect(run(['check', P()]).code).toBe(0);
    expect(run(['--help']).stdout).toContain('rm-item');
    expect(skill()).toContain('| `rm-item` |');
  });

  it('strike wraps a matched run in <s>, and exits 1 on a run already struck', () => {
    seed();
    const r = run(['strike', P(), 'overview', '--match', 'on friday']);
    expect(r.code, r.stderr).toBe(0);
    expect(readPlan()).toContain('<p>We ship <s>on Friday</s>, after the review.</p>');
    const again = run(['strike', P(), 'overview', '--match', 'Friday']);
    expect(again.code).toBe(1);
    expect(again.stderr).toContain('is already struck');
    expect(run(['check', P()]).code).toBe(0);
    expect(run(['--help']).stdout).toContain('strike');
    expect(skill()).toContain('| `strike` |');
  });

  it('replace takes the replacement from --with, --file, or stdin', () => {
    seed();
    expect(run(['replace', P(), 'overview', '--match', 'Friday', '--with', 'Monday']).code).toBe(0);
    const hunk = join(dir, 'with.html');
    writeFileSync(hunk, 'the audit\n');
    expect(run(['replace', P(), 'overview', '--match', 'the review', '--file', hunk]).code).toBe(0);
    const piped = run(['replace', P(), 'overview', '--match', 'ship'], { input: 'land' });
    expect(piped.code, piped.stderr).toBe(0);
    expect(run(['read', P(), 'overview', '--body', '--text']).stdout)
      .toBe('- alpha item\n- beta item\nWe land on Monday, after the audit.\n');
    const both = run(['replace', P(), 'overview', '--match', 'land', '--with', 'x', '--file', hunk]);
    expect(both.code).toBe(1);
    expect(both.stderr).toContain('use only one of --with / --file');
    expect(run(['--help']).stdout).toContain('replace');
    expect(skill()).toContain('| `replace` |');
  });
  it("replace exits 1 rather than splice a row into a cell's <code>, and leaves the file untouched", () => {
    freshPlan();
    const rows = join(dir, 'rows.html');
    writeFileSync(rows, '\n    <plan-table><table><tbody>\n' +
                        '      <tr><td><code>some-issue.html</code></td><td>a note</td></tr>\n' +
                        '    </tbody></table></plan-table>\n  ');
    expect(run(['set-body', P(), 'overview', '--file', rows]).code).toBe(0);
    const before = readPlan();
    const row = join(dir, 'row.html');
    writeFileSync(row, '<tr><td><code>other.html</code></td><td>replaced</td></tr>\n');
    const r = run(['replace', P(), 'overview', '--match', 'some-issue.html', '--file', row]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('replace would open <tr> inside <code>');
    expect(readPlan()).toBe(before);
  });
});

describe('consumer template directory (.claude/planr-templates/)', () => {
  const PROBE = [
    '<!-- ════════════════════════════════════════',
    '     Probe consumer template — owned by the repo, not the skill.',
    '     ════════════════════════════════════════ -->',
    '',
    '  <plan-section id="probe" title="Probe"></plan-section>',
  ].join('\n');
  // Stage the skill at <dir>/.claude/skills/html-planning and write `files` into
  // its sibling consumer directory. Returns the staged planr.js.
  const stageWithConsumer = (files) => {
    const staged = stageSkill(dir, 'skills/html-planning');
    const consumerDir = join(dir, '.claude', 'planr-templates');
    mkdirSync(consumerDir, { recursive: true });
    for (const [name, body] of Object.entries(files)) writeFileSync(join(consumerDir, name), body);
    return staged;
  };

  it('lists, describes and scaffolds a consumer template beside the skill ones', () => {
    const staged = stageWithConsumer({ 'probe.html': PROBE });
    const list = runAt(staged, ['templates']);
    expect(list.code, list.stderr).toBe(0);
    expect(list.stdout).toMatch(/^probe\s+\[consumer\] Probe consumer template/m);
    expect(list.stdout).toMatch(/^tdd\s+TDD implementation plan/m);
    expect(list.stdout).not.toContain('Template problems');

    const one = runAt(staged, ['templates', 'probe']);
    expect(one.code, one.stderr).toBe(0);
    expect(one.stdout).toContain('source: consumer template');
    expect(one.stdout).toContain('1. probe');

    const out = join(dir, 'probe-plan.html');
    const made = runAt(staged, ['new', out, '--template', 'probe']);
    expect(made.code, made.stderr).toBe(0);
    expect(made.stdout).toContain('(template: probe, consumer:');
    const html = readFileSync(out, 'utf8');
    expect(html).toContain('<plan-section id="probe" title="Probe">');
    expect(html).toContain('/skills/html-planning');   // the shell still comes from the skill
    expect(run(['check', out]).code).toBe(0);
  });
  it('lets a consumer template shadow a skill template, and says so', () => {
    const staged = stageWithConsumer({ 'tdd.html': PROBE });
    expect(runAt(staged, ['templates']).stdout).toMatch(/^tdd\s+\[consumer, shadows skill\] Probe consumer template/m);
    const out = join(dir, 'shadowed.html');
    expect(runAt(staged, ['new', out, '--template', 'tdd']).code).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('id="probe"');
    expect(readFileSync(out, 'utf8')).not.toContain('id="anti-patterns"');
  });
  it('refuses a consumer _shell.html (exit 1)', () => {
    const staged = stageWithConsumer({ '_shell.html': '{{body}}' });
    for (const args of [['templates'], ['new', join(dir, 'x.html')]]) {
      const r = runAt(staged, args);
      expect(r.code, args[0]).toBe(1);
      expect(r.stderr, args[0]).toContain('the shell is skill-owned');
    }
  });
  it('reports a consumer template that breaks the template rules', () => {
    const staged = stageWithConsumer({ 'bare.html': '<plan-section id="bare" title="Bare"></plan-section>' });
    const r = runAt(staged, ['templates']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Template problems:\n {2}bare \[consumer\]: no leading comment/);
  });

  // Regression guard — passes before AND after this step. Placed inside the
  // describe above: with no planr-templates/ beside the staged skill, the
  // listing is exactly what the unstaged skill prints.
  it('is simply absent when the directory does not exist', () => {
    const staged = stageSkill(dir, 'skills/html-planning');
    expect(runAt(staged, ['templates']).stdout).toBe(run(['templates']).stdout);
  });
});

describe('release metadata', () => {
  it('SKILL.md, package.json, the lockfile root and the README release notes name one version', () => {
    const root = join(SKILL_DIR, '..', '..');
    const json = (f) => JSON.parse(readFileSync(join(root, f), 'utf8'));
    const pkg = json('package.json');
    const lock = json('package-lock.json');
    const skillVersion = /^version:\s*(\S+)$/m.exec(readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8'))[1];
    expect(skillVersion).toBe(pkg.version);
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[''].version).toBe(pkg.version);
    expect(readFileSync(join(root, 'README.md'), 'utf8')).toContain(`## What's new in ${pkg.version}`);
  });
});

describe('meta (read)', () => {
  it('resolves from the header and the path, and names the schema in force', () => {
    const root = mkTmp();
    try {
      const staged = stageSkill(root, 'skills/html-planning');
      const doc = join(root, '.claude', 'plans', 'issues', 'foo.html');
      expect(runAt(staged, ['new', doc, '--template', 'issue', '--title', 'Quota cache']).code).toBe(0);
      const r = runAt(staged, ['meta', doc]);
      expect(r.code, r.stderr).toBe(0);
      expect(r.stdout).toMatch(/^title +Quota cache +\(header\)$/m);
      // The issue template declares type=issue as a literal metadata default
      // (step 7), which resolves via `meta` and outranks the issues/ path
      // inference — both agree on the value, so this still proves the chain.
      expect(r.stdout).toMatch(/^type +issue +\(meta\)$/m);
      expect(r.stdout).toMatch(/^status +draft +\(header\)$/m);
      expect(r.stdout).toMatch(/planr-schema\.json/);
    } finally { rmTmp(root); }
  });

  it('merges a consumer .claude/planr-schema.json over the core, and names both', () => {
    const root = mkTmp();
    try {
      const staged = stageSkill(root, 'skills/html-planning');
      writeFileSync(join(root, '.claude', 'planr-schema.json'), JSON.stringify({
        fields: { priority: { type: 'enum', values: ['p0', 'p1', 'p2'] } },
        defaults: { priority: 'p2' },
      }));
      const doc = join(root, '.claude', 'plans', 'issues', 'foo.html');
      expect(runAt(staged, ['new', doc, '--template', 'issue', '--title', 'X']).code).toBe(0);
      const r = runAt(staged, ['meta', doc]);
      expect(r.stdout).toMatch(/^priority +p2 +\(default\)$/m);   // a consumer-only field and its default
      expect(r.stdout).toMatch(/schema: .*planr-schema\.json \+ .*\.claude\/planr-schema\.json/);
    } finally { rmTmp(root); }
  });

  it('exits 1 on a malformed consumer schema, naming the file', () => {
    const root = mkTmp();
    try {
      const staged = stageSkill(root, 'skills/html-planning');
      writeFileSync(join(root, '.claude', 'planr-schema.json'), '{ "feilds": {} }');
      const doc = join(root, '.claude', 'plans', 'x.html');
      expect(runAt(staged, ['new', doc, '--title', 'X']).code).toBe(1);
      const r = runAt(staged, ['meta', doc]);
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/planr-schema\.json: unknown key 'feilds'/);
    } finally { rmTmp(root); }
  });

  it('is listed in the usage text and the skill command table', () => {
    expect(run(['--help']).stdout).toContain('meta ');
    expect(readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8')).toContain('| `meta` |');
  });
});

describe('meta (write)', () => {
  it('writes, re-reads and unsets through the CLI, leaving the document checkable', () => {
    const root = mkTmp();
    try {
      const staged = stageSkill(root, 'skills/html-planning');
      const doc = join(root, '.claude', 'plans', 'issues', 'foo.html');
      expect(runAt(staged, ['new', doc, '--template', 'issue', '--title', 'Quota']).code).toBe(0);
      expect(runAt(staged, ['meta', doc, '--set', 'reference-paths=crm,celery']).code).toBe(0);
      expect(runAt(staged, ['meta', doc]).stdout).toMatch(/^reference-paths +crm,celery +\(meta\)$/m);
      expect(runAt(staged, ['check', doc]).code).toBe(0);
      const bad = runAt(staged, ['meta', doc, '--set', 'reference-paths=']);
      expect(bad.code).toBe(1);
      expect(bad.stderr).toMatch(/use `--unset reference-paths`/);
      expect(runAt(staged, ['meta', doc, '--unset', 'reference-paths']).code).toBe(0);
      expect(runAt(staged, ['meta', doc]).stdout).toMatch(/^unset: .*reference-paths/m);
      // a valueless --set is an error, never a silent fall-through to the report
      expect(runAt(staged, ['meta', doc, '--set']).code).toBe(1);
    } finally { rmTmp(root); }
  });

  it('--stamp brings a document in line with a consumer schema, and refuses --set beside it', () => {
    const root = mkTmp();
    try {
      const staged = stageSkill(root, 'skills/html-planning');
      writeFileSync(join(root, '.claude', 'planr-schema.json'), JSON.stringify({
        fields: { priority: { type: 'enum', values: ['p0', 'p1'], tones: { p0: 'danger' } } },
      }));
      const doc = join(root, '.claude', 'plans', 'issues', 'foo.html');
      expect(runAt(staged, ['new', doc, '--template', 'issue', '--title', 'Quota']).code).toBe(0);
      // A field written by hand, before stamps existed.
      writeFileSync(doc, readFileSync(doc, 'utf8').replace('<plan-field key="type">issue</plan-field>',
        '<plan-field key="type">issue</plan-field>\n    <plan-field key="priority">p0</plan-field>'));
      const r = runAt(staged, ['meta', '--stamp', doc]);   // valueless flag BEFORE the file
      expect(r.code, r.stderr).toBe(0);
      expect(r.stdout).toBe('stamped priority\n');
      expect(readFileSync(doc, 'utf8')).toContain('<plan-field key="priority" tone="danger">p0</plan-field>');
      const both = runAt(staged, ['meta', doc, '--stamp', '--set', 'priority=p1']);
      expect(both.code).toBe(1);
      expect(both.stderr).toMatch(/--stamp rewrites stamps only/);
    } finally { rmTmp(root); }
  });
});

it('check reports a metadata problem as a warning, and --strict makes it fatal', () => {
  const root = mkTmp();
  try {
    const staged = stageSkill(root, 'skills/html-planning');
    const doc = join(root, '.claude', 'plans', 'x.html');
    expect(runAt(staged, ['new', doc, '--title', 'X']).code).toBe(0);
    const html = readFileSync(doc, 'utf8')
      .replace('<main>', '<main>\n  <plan-meta><plan-field key="severity">high</plan-field></plan-meta>');
    writeFileSync(doc, html);
    const r = runAt(staged, ['check', doc]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/unknown field 'severity'/);
    expect(runAt(staged, ['check', doc, '--strict']).code).toBe(1);
  } finally { rmTmp(root); }
});

it('scaffolds a tdd plan with its declared type, and reports reference-paths as a settable variable', () => {
  const root = mkTmp();
  try {
    const staged = stageSkill(root, 'skills/html-planning');
    const doc = join(root, '.claude', 'plans', 'x.html');
    expect(runAt(staged, ['new', doc, '--template', 'tdd', '--title', 'T', '--set', 'reference-paths=server,client']).code).toBe(0);
    const meta = runAt(staged, ['meta', doc]).stdout;
    expect(meta).toMatch(/^type +tdd +\(meta\)$/m);
    expect(meta).toMatch(/^reference-paths +server,client +\(meta\)$/m);
    expect(runAt(staged, ['check', doc, '--strict']).code, 'a scaffold must be warning-free').toBe(0);
    expect(runAt(staged, ['templates', 'tdd']).stdout).toMatch(/^ {2}reference-paths +\(default: empty\)$/m);
    // an empty value means "no value" — the field is dropped, not written and warned about later
    const bad = runAt(staged, ['new', join(root, '.claude', 'y.html'), '--template', 'tdd', '--title', 'Y', '--set', 'reference-paths=']);
    expect(bad.code).toBe(0);
    expect(readFileSync(join(root, '.claude', 'y.html'), 'utf8')).not.toContain('key="reference-paths"');
  } finally { rmTmp(root); }
});


describe('metadata documentation', () => {
  const skillDoc = (f) => readFileSync(join(SKILL_DIR, f), 'utf8');

  it('SKILL.md carries a Metadata section covering the schema, the chain and the command', () => {
    const s = skillDoc('SKILL.md');
    expect(s).toContain('## Metadata');
    expect(s).toContain('.claude/planr-schema.json');
    for (const t of ['enum', 'string', 'list', 'path', 'date', 'number']) expect(s, t).toContain(`\`${t}\``);
    expect(s).toMatch(/<plan-meta>.*header.*path.*default/s);   // the resolution chain, in order
    expect(s).toContain('planr set <file> header.status=');       // C9 names the real writer
  });

  it('template-authoring.md says how a template declares metadata defaults', () => {
    expect(skillDoc('references/template-authoring.md')).toContain('<plan-meta>');
  });

  it('the README names the component and the schema file', () => {
    const r = readFileSync(join(SKILL_DIR, '..', '..', 'README.md'), 'utf8');
    expect(r).toContain('plan-meta');
    expect(r).toContain('planr-schema.json');
  });

  it('the repo CLAUDE.md records the metadata invariants a change must not break', () => {
    const c = readFileSync(join(SKILL_DIR, '..', '..', 'CLAUDE.md'), 'utf8');
    expect(c).toContain('planr-schema.json');
    expect(c).toContain('validateField');
    expect(c).toContain('resolveMeta');
    expect(c).toContain('headerOwnedProblem');
    expect(c).toContain('One writable home per fact');
    expect(c).toContain('fieldStamp');
    expect(c).toContain('TONES');
  });

  it('SKILL.md documents tones, the stamps, the hidden flag and the chips deprecation', () => {
    const s = skillDoc('SKILL.md');
    expect(s).toContain('### Tones and the header');
    for (const t of ['danger', 'warn', 'info', 'ok', 'final', 'muted']) expect(s, t).toContain(`\`${t}\``);
    expect(s).toContain('"tones"');
    expect(s).toContain('"hidden"');
    expect(s).toContain('planr meta <file> --stamp');
    expect(s).toMatch(/`chips` is deprecated/);
    expect(s).not.toMatch(/--set "?(header\.)?chips=/);
  });

  it('the README carries the 1.4.0 release notes and no chips example', () => {
    const r = readFileSync(join(SKILL_DIR, '..', '..', 'README.md'), 'utf8');
    expect(r).toContain("## What's new in 1.4.0");
    expect(r).not.toMatch(/chips="|--set "?chips=/);
  });
});

// ── query / next wiring ───────────────────────────────────
// A staged skill plus a consumer .claude/planr-schema.json is the only way to
// exercise a real ranking end to end: rankings are schema data, and the shipped
// core schema declares none.
const CONSUMER_SCHEMA = {
  fields: {
    priority: { type: 'enum', values: ['p0', 'p1', 'p2', 'p3'] },
    impact: { type: 'enum', values: ['low', 'medium', 'high'] },
  },
  rankings: {
    default: { where: { status: { ne: 'implemented' }, priority: { set: true } },
               order: ['priority', 'impact:desc'] },
    triage: { where: { priority: { set: false } }, order: ['date:asc'] },
  },
};

// Stage the skill, write the consumer schema, and scaffold an issue corpus.
// Returns { planr, dir } where dir is the issues directory, relative to root.
function stageCorpus(root) {
  const staged = stageSkill(root, 'skills/html-planning');
  writeFileSync(join(root, '.claude', 'planr-schema.json'), JSON.stringify(CONSUMER_SCHEMA));
  const issues = join(root, '.claude', 'plans', 'issues');
  mkdirSync(issues, { recursive: true });
  const make = (name, title, meta) => {
    const out = join(issues, name);
    expect(runAt(staged, ['new', out, '--template', 'issue', '--title', title]).code, name).toBe(0);
    const sets = Object.entries(meta).flatMap(([k, v]) => ['--set', `${k}=${v}`]);
    if (sets.length) expect(runAt(staged, ['meta', out, ...sets]).code, name).toBe(0);
    return out;
  };
  const quota = make('quota.html', 'Quota cache', { priority: 'p0', impact: 'high' });
  make('webhook.html', 'Webhook retry', { priority: 'p1', impact: 'high' });
  make('pgp.html', 'PGP filename', { priority: 'p2', impact: 'low' });
  const untriaged = make('splits.html', 'Overlapping splits', {});
  expect(runAt(staged, ['set', join(issues, 'pgp.html'), 'header.status=implemented']).code).toBe(0);
  expect(runAt(staged, ['set', quota, 'remediation.status=todo']).code).toBe(0);
  // one non-document and one that does not balance, so the skip report has work
  writeFileSync(join(issues, 'mockup.html'), '<html><body><h1>mock</h1></body></html>\n');
  writeFileSync(join(issues, 'broken.html'),
    readFileSync(untriaged, 'utf8').replace('</plan-section>', ''));
  return { planr: staged, issues };
}

describe('query (wiring)', () => {
  it('scans a directory, prints the table on stdout and the skip list on stderr, exit 0', () => {
    const root = mkTmp();
    try {
      const { planr: P, issues } = stageCorpus(root);
      const r = runAt(P, ['query', issues, '--fields', 'path,priority']);
      expect(r.code, r.stderr).toBe(0);
      expect(r.stdout).toMatch(/^path\s+priority$/m);
      expect(r.stdout).toContain('4 of 6 document(s) match');
      expect(r.stdout).not.toContain('mockup');
      expect(r.stderr).toContain('2 file(s) skipped');
      expect(r.stderr).toContain('not a plan document');
      expect(r.stderr).toContain('structure does not balance');
    } finally { rmTmp(root); }
  });

  it('runs a consumer-declared ranking, and lets a flag override it per field', () => {
    const root = mkTmp();
    try {
      const { planr: P, issues } = stageCorpus(root);
      const paths = (args) => runAt(P, ['query', issues, '--format', 'paths', ...args])
        .stdout.trim().split('\n').map(s => s.replace(/^.*[\\/]/, ''));
      expect(paths(['--rank', 'default'])).toEqual(['quota.html', 'webhook.html']);
      expect(paths(['--rank', 'default', '--where', 'priority=p1'])).toEqual(['webhook.html']);
      expect(paths(['--rank', 'triage'])).toEqual(['splits.html']);
      expect(paths(['--where', 'impact>=high', '--sort', 'priority:desc']))
        .toEqual(['webhook.html', 'quota.html']);
      expect(runAt(P, ['query', issues, '--rank', 'nope']).stderr)
        .toContain("unknown ranking 'nope' — declared: default, triage");
    } finally { rmTmp(root); }
  });

  it('emits parseable JSON with the counts, the schema in force and the skip list', () => {
    const root = mkTmp();
    try {
      const { planr: P, issues } = stageCorpus(root);
      const r = runAt(P, ['query', issues, '--format', 'json', '--rank', 'default',
        '--limit', '1', '--fields', 'path']);
      expect(r.code, r.stderr).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out).toMatchObject({ rank: 'default', scanned: 6, matched: 2, returned: 1 });
      expect(out.results[0].fields.priority.value).toBe('p0');
      // The whole record, not just the projected columns: a field no document
      // in the corpus has yet is an explicit null, never a missing key.
      expect(out.fields).toEqual(['path']);
      expect(Object.keys(out.results[0].fields))
        .toEqual(['title', 'type', 'status', 'date', 'reference-paths', 'blocked-by', 'priority', 'impact']);
      expect(out.results[0].fields['reference-paths']).toEqual(
        { value: null, raw: null, source: null, type: 'list', rank: null });
      expect(out.schema.map(s => s.replace(/^.*\//, ''))).toEqual(['planr-schema.json', 'planr-schema.json']);
      expect(out.skipped).toHaveLength(2);
    } finally { rmTmp(root); }
  });

  it('gates on --strict, resolves a glob, and refuses a target that is not there', () => {
    const root = mkTmp();
    try {
      const { planr: P, issues } = stageCorpus(root);
      expect(runAt(P, ['query', issues, '--strict']).code).toBe(1);
      expect(runAt(P, ['query', `${issues.replace(/\\/g, '/')}/q*.html`, '--format', 'paths'])
        .stdout.trim().replace(/^.*[\\/]/, '')).toBe('quota.html');
      const gone = runAt(P, ['query', join(root, 'nowhere')]);
      expect(gone.code).toBe(1);
      expect(gone.stderr).toContain('no such file or directory');
      expect(runAt(P, ['query']).stderr).toContain("'query' requires a <dir|glob> argument");
    } finally { rmTmp(root); }
  });

  it('is listed in the usage text and the skill command table', () => {
    expect(run(['--help']).stdout).toContain('query ');
    expect(readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8')).toContain('| `query` |');
  });
});
describe('a ranking is validated when the schema is READ', () => {
  it('fails every command that loads the schema, naming the file and the operator', () => {
    const root = mkTmp();
    try {
      const staged = stageSkill(root, 'skills/html-planning');
      writeFileSync(join(root, '.claude', 'planr-schema.json'), JSON.stringify({
        fields: { priority: { type: 'enum', values: ['p0', 'p1'] } },
        rankings: { default: { where: { priority: { gte: 'p1' } }, order: [] } },
      }));
      const doc = join(root, '.claude', 'plans', 'x.html');
      for (const args of [['new', doc, '--title', 'X'], ['templates'], ['query', join(root, '.claude')]]) {
        const r = runAt(staged, args);
        expect(r.code, args[0]).toBe(1);
        expect(r.stderr, args[0]).toMatch(/planr-schema\.json: ranking 'default' where on 'priority': unknown operator 'gte'/);
      }
    } finally { rmTmp(root); }
  });
});

describe('next (wiring)', () => {
  it('hands over the top-ranked document, its metadata and its open sections', () => {
    const root = mkTmp();
    try {
      const { planr: P, issues } = stageCorpus(root);
      const r = runAt(P, ['next', issues]);
      expect(r.code, r.stderr).toBe(0);
      expect(r.stdout).toContain('quota.html');
      expect(r.stdout).toContain('Quota cache');
      expect(r.stdout).toMatch(/^ +priority +p0 +\(meta\)$/m);
      expect(r.stdout).toContain("ranking 'default' — 1 of 2 matching, 6 scanned");
      expect(r.stdout).toMatch(/^ +remediation +\[todo\] +Remediation$/m);
      expect(r.stdout).toContain('start at: remediation');

      const j = JSON.parse(runAt(P, ['next', issues, '--format', 'json']).stdout);
      expect(j.document.next_section).toBe('remediation');
      expect(j.document.sections.map(s => s.addr))
        .toEqual(['overview', 'root-cause', 'impact', 'remediation', 'not-affected', 'open']);
    } finally { rmTmp(root); }
  });

  it('treats an empty queue as an answer: exit 0, and a null document in JSON', () => {
    const root = mkTmp();
    try {
      const { planr: P, issues } = stageCorpus(root);
      expect(runAt(P, ['meta', join(issues, 'splits.html'), '--set', 'priority=p3']).code).toBe(0);
      const r = runAt(P, ['next', issues, '--rank', 'triage']);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain("no document matches ranking 'triage' — 6 scanned");
      expect(JSON.parse(runAt(P, ['next', issues, '--rank', 'triage', '--format', 'json']).stdout).document).toBeNull();
    } finally { rmTmp(root); }
  });

  it('refuses to guess a queue when the schema declares no ranking', () => {
    const root = mkTmp();
    try {
      const staged = stageSkill(root, 'skills/html-planning');   // core schema only
      const doc = join(root, '.claude', 'plans', 'x.html');
      expect(runAt(staged, ['new', doc, '--title', 'X']).code).toBe(0);
      const r = runAt(staged, ['next', join(root, '.claude', 'plans')]);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("unknown ranking 'default' — declared: (none)");
      expect(r.stderr).toContain("declare one named 'default', or pass --rank");
    } finally { rmTmp(root); }
  });

  it('is listed in the usage text and the skill command table', () => {
    expect(run(['--help']).stdout).toContain('next ');
    expect(readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8')).toContain('| `next` |');
  });
});

describe('blockers (wiring)', () => {
  const names = (out) => out.trim().split('\n').filter(Boolean).map(p => p.replace(/^.*[\\/]/, ''));

  it('query and next read a blocker from disk, inside the scan or not', () => {
    const root = mkTmp();
    try {
      const { planr: P, issues } = stageCorpus(root);
      // quota (p0) is blocked by webhook (p1, draft) — a sibling, named bare.
      expect(runAt(P, ['meta', join(issues, 'quota.html'), '--set', 'blocked-by=webhook.html']).code).toBe(0);
      const free = runAt(P, ['query', issues, '--rank', 'default', '--where', 'blocked=false', '--format', 'paths']);
      expect(free.code, free.stderr).toBe(0);
      expect(names(free.stdout)).toEqual(['webhook.html']);
      // webhook.html is outside this glob, so it is read through the filesystem.
      const held = runAt(P, ['query', `${issues.replace(/\\/g, '/')}/q*.html`, '--where', 'blocked=true', '--format', 'paths']);
      expect(names(held.stdout)).toEqual(['quota.html']);
      const next = runAt(P, ['next', issues]);
      expect(next.code, next.stderr).toBe(0);
      expect(next.stdout.split('\n')[0]).toMatch(/quota\.html$/);
      expect(next.stdout).toMatch(/\nblocked by:\n {2}\S*webhook\.html {2}\[draft\]\n/);
    } finally { rmTmp(root); }
  });
});

describe('querying documentation', () => {
  const skillDoc = (f) => readFileSync(join(SKILL_DIR, f), 'utf8');

  it('SKILL.md carries a Querying section covering the operators, the formats and the ranking', () => {
    const s = skillDoc('SKILL.md');
    expect(s).toContain('## Querying');
    for (const op of ['--where', '--has', '--missing', "!=", '>=', '~']) expect(s, op).toContain(op);
    for (const f of ['table', 'json', 'tsv', 'paths']) expect(s, f).toContain(`\`${f}\``);
    for (const t of ['--rank', '--limit', '--strict', 'planr next', 'next_section'])
      expect(s, t).toContain(t);
    // the trap a reader gets wrong: >= compares DECLARED ORDER, not importance
    expect(s).toMatch(/declared order/i);
  });

  it('the README names both commands and what JSON is for', () => {
    const r = readFileSync(join(SKILL_DIR, '..', '..', 'README.md'), 'utf8');
    expect(r).toContain('planr query');
    expect(r).toContain('planr next');
  });

  it('the repo CLAUDE.md records the query invariants a change must not break', () => {
    const c = readFileSync(join(SKILL_DIR, '..', '..', 'CLAUDE.md'), 'utf8');
    expect(c).toContain('compileWhere');
    expect(c).toContain('queryDocs');
    expect(c).toContain('NEEDS_TARGET');
  });
});

describe('nesting documentation', () => {
  const doc = (f) => readFileSync(join(SKILL_DIR, f), 'utf8');
  it('SKILL.md documents the parent-legality check and the replace refusal', () => {
    const skill = doc('SKILL.md');
    expect(skill).toContain('a legal parent for every balanced tag');
    expect(skill).toContain('refuses a replacement that would open a block element inside the match');
    expect(skill).toContain('**`replace` rewrites text inside an element, never the element.**');
  });
  it('the authoring-traps reference carries the row-rewrite trap', () => {
    expect(doc('references/authoring-traps.md')).toMatch(/^## Rewriting a table row$/m);
  });
});
