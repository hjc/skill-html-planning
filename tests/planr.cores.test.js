import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PLANR_URL, SKILL_DIR } from './helpers.js';

let planr;
beforeAll(async () => { const m = await import(PLANR_URL); planr = m.default ?? m; });

// Multi-line, mirroring real plan structure — insert/remove/move are LINE-oriented,
// so a single-line fixture would misplace add-section (append at EOL, not after ref).
const DOC = [
  '<plan-header title="T" status="draft"></plan-header>',
  '<plan-section id="a" num="1" title="Alpha">',
  '  <plan-section id="a1" status="todo"></plan-section>',
  '</plan-section>',
  '<plan-section id="b" title="Beta"></plan-section>',
  '<plan-section id="c" title="Gamma"></plan-section>',   // 3 top-level sections so
].join('\n');                                              // before/after yield distinct orders

// immediate child ids of a section (sectionIds is top-level only, by design).
const childIds = (html, id) => {
  const p = planr.findSectionById(html, id);
  return planr.childSections(html, p.innerStart, p.innerEnd).map(k => planr.getAttr(k.attrsRaw, 'id'));
};

// A shell/body pair standing in for templates/_shell.html + a body template.
const SHELL = [
  '<title>{{title}}</title>',
  '<script>var b = "{{skillSubpath}}";</script>',
  '<plan-header title="{{title}}" subtitle="" status="draft" date="{{date}}" chips="">',
  '</plan-header>',
  '<main>',
  '{{body}}',
  '</main>',
].join('\n');
const BODY = '  <plan-section id="overview" title="Overview"></plan-section>';

// A document with the shapes section-relative writes actually target: a running
// <ul>, a table of rows carrying empty <plan-badge> tags, authored <h3>s, and a
// NESTED section holding a decoy heading and list that must never be picked up
// as the parent's own.
const RICH = [
  '<plan-header title="Map" status="draft"></plan-header>',
  '<main>',
  '  <plan-section id="map" title="Map">',
  '    <h3>Decisions so far</h3>',
  '    <ul>',
  '      <li>First.</li>',
  '    </ul>',
  '    <h3>Tickets</h3>',
  '    <plan-table>',
  '      <table id="tickets">',
  '        <tbody>',
  '          <tr><td>q16 staging</td><td><plan-badge type="open"></plan-badge></td></tr>',
  '          <tr><td>q18 signals</td><td><plan-badge type="open"></plan-badge></td></tr>',
  '        </tbody>',
  '      </table>',
  '    </plan-table>',
  '    <plan-section id="vocab" title="Vocabulary">',
  '      <h3>Nested heading</h3>',
  '      <ul><li>Nested list.</li></ul>',
  '    </plan-section>',
  '  </plan-section>',
  '</main>',
].join('\n');
const bodyOf = (html, addr) => planr.planRead(html, addr, { body: true });

// A sub-record in both shapes <plan-defs> takes: standalone, and inside a table
// cell. Two lists, so an `--into plan-defs` without `:<n>` has to pick the LAST.
const DEFS_DOC = [
  '<plan-header title="Defs" status="draft"></plan-header>',
  '<main>',
  '  <plan-section id="fields" title="Fields">',
  '    <plan-defs>',
  '      <plan-def key="country_code">CharField(max_length=2)</plan-def>',
  '    </plan-defs>',
  '    <plan-table>',
  '      <table>',
  '        <tbody>',
  '          <tr><td>SmsLog</td><td><plan-defs><plan-def key="tier">CharField</plan-def></plan-defs></td></tr>',
  '        </tbody>',
  '      </table>',
  '    </plan-table>',
  '  </plan-section>',
  '</main>',
].join('\n');
const skillFile = (f) => readFileSync(join(SKILL_DIR, f), 'utf8');

describe('planList', () => {
  it('formats header + numbered top level + indented child', () => {
    const out = planr.planList(DOC);
    expect(out).toMatch(/^# T {2}\[draft\]/);
    expect(out).toMatch(/\n1\. a .* Alpha/);
    expect(out).toMatch(/\n {4}1\.1\. a1 .*\[todo\]/);   // depth-1: 4-space indent, dotted number
  });
  it('numbers from document position, not the num attribute', () => {
    // 'b' and 'c' carry no num=; their numbers are derived (2, 3), and a
    // section added later renumbers everything after it with no attribute edit.
    expect(planr.planList(DOC)).toMatch(/\n2\. b .*\n3\. c /);
    const { html } = planr.planAddSection(DOC, { id: 'x', title: 'X', after: 'a' }, null);
    expect(planr.planList(html)).toMatch(/\n2\. x .*\n3\. b .*\n4\. c /);
  });
  it('decodes entities in titles', () => {
    const html = '<plan-section id="s" title="Scope &amp; Prerequisites"></plan-section>';
    expect(planr.planList(html)).toContain('Scope & Prerequisites');
  });
});

describe('sectionNumber', () => {
  it('joins onto the parent, and takes a DOTTED override as complete', () => {
    expect(planr.sectionNumber(undefined, '', 3)).toBe('3');
    expect(planr.sectionNumber(undefined, '5', 1)).toBe('5.1');
    expect(planr.sectionNumber('2', '5', 9)).toBe('5.2');     // bare override joins
    expect(planr.sectionNumber('5.1', '5', 9)).toBe('5.1');   // dotted is used as-is
  });
});

describe('planTasks', () => {
  it('lists open tasks and honors --status / --all', () => {
    expect(planr.planTasks(DOC, {})).toMatch(/a\.a1\s+\[todo\]/);
    expect(planr.planTasks(DOC, { status: 'done' })).toBe('no open tasks\n');
    expect(planr.planTasks(DOC, { all: true })).toContain('a.a1');
  });
});

describe('planNew', () => {
  const base = { title: 'Probe', date: '2026-08-09', skillSubpath: 'skills/html-planning' };
  it('fills the base placeholders and splices the body', () => {
    const html = planr.planNew(SHELL, BODY, base);
    expect(html).toContain('<title>Probe</title>');
    expect(html).toContain('"skills/html-planning"');
    expect(html).toContain('date="2026-08-09"');
    expect(html).toContain('<plan-section id="overview"');
    expect(html).not.toContain('{{');            // no placeholder survives
  });
  it('applies a DOTTED --set key as a node address — the one-command scaffold', () => {
    const html = planr.planNew(SHELL, BODY, {
      ...base,
      sets: ['header.subtitle=SUB', 'header.chips=A | B', 'header.status=review', 'overview.status=todo'],
    });
    expect(html).toContain('subtitle="SUB"');
    expect(html).toContain('chips="A | B"');
    expect(html).toContain('status="review"');
    expect(planr.getAttr(planr.findSectionById(html, 'overview').attrsRaw, 'status')).toBe('todo');
  });
  it('validates a dotted key exactly as `set` does', () => {
    expect(() => planr.planNew(SHELL, BODY, { ...base, sets: ['header.status=aproved'] }))
      .toThrow(/invalid status 'aproved' for <plan-header>/);
    expect(() => planr.planNew(SHELL, BODY, { ...base, sets: ['header.staus=review'] }))
      .toThrow(/unknown attribute 'staus'/);
    expect(() => planr.planNew(SHELL, BODY, { ...base, sets: ['nosuch.title=X'] }))
      .toThrow(/section 'nosuch' not found/);
  });
  it('fills a BARE key from the template\'s own declaration, or its default', () => {
    const shell = '<html lang="{{lang:en}}"><plan-header title="{{title}}" status="{{status:draft}}">' +
                  '</plan-header><main>{{body}}</main>';
    expect(planr.planNew(shell, BODY, base)).toContain('lang="en"');
    expect(planr.planNew(shell, BODY, { ...base, sets: ['lang=fr'] })).toContain('lang="fr"');
    // A bare fill bypasses planSet, so it needs its own validation.
    expect(() => planr.planNew(shell, BODY, { ...base, sets: ['status=aproved'] }))
      .toThrow(/invalid status 'aproved' for <plan-header>/);
  });
  it('throws on a bare key with no placeholder — it used to be dropped in silence', () => {
    // The exact shape reached for first: a header attribute with no dot.
    expect(() => planr.planNew(SHELL, BODY, { ...base, sets: ['subtitle=SUB'] }))
      .toThrow(/--set header\.subtitle=/);
    expect(() => planr.planNew(SHELL, BODY, { ...base, sets: ['frobnicate=1'] }))
      .toThrow(/this template offers: date, skillSubpath, title/);
    expect(() => planr.planNew(SHELL, BODY, { ...base, sets: ['nope'] }))
      .toThrow(/--set expects key=value/);
  });
  it('never lets --set reach {{body}}', () => {
    expect(() => planr.planNew(SHELL, BODY, { ...base, sets: ['body=<p>x</p>'] })).toThrow(/matches no \{\{placeholder\}\}/);
  });
  it('leaves the template\'s leading guidance comment out of the document, and only that comment', () => {
    const body = [
      '  <!-- ════════════════════════════════════════',
      '       Probe template — guidance for whoever fills it in.',
      '       ════════════════════════════════════════ -->',
      '',
      '  <plan-section id="overview" title="Overview"></plan-section>',
      '  <!-- an inline note the author kept -->',
    ].join('\n');
    const html = planr.planNew(SHELL, body, base);
    expect(html).not.toContain('Probe template');
    // The blank lines between the comment and the first element go with it.
    expect(html).toContain('<main>\n  <plan-section id="overview"');
    expect(html).toContain('  <!-- an inline note the author kept -->');
  });
});

describe('planSet', () => {
  it('returns mutated html + message on success', () => {
    const { html, message } = planr.planSet(DOC, 'a.a1.status=done');
    expect(html).toContain('id="a1" status="done"');
    expect(message).toBe('set a.a1.status = "done"');
  });
  it('applies EVERY assignment, not just the first', () => {
    // The live failure: a ticket claim set status plus a second header attribute
    // together, the second was dropped, and the command still exited 0 printing
    // a success line.
    const { html, message } = planr.planSet(DOC, ['header.status=review', 'header.subtitle=A | B | C']);
    const hdr = planr.findElement(html, 'plan-header').attrsRaw;
    expect(planr.getAttr(hdr, 'status')).toBe('review');
    expect(planr.getAttr(hdr, 'subtitle')).toBe('A | B | C');
    expect(message).toBe('set header.status = "review"\nset header.subtitle = "A | B | C"');
  });
  it('re-resolves between assignments, so two writes to one node both land', () => {
    const { html } = planr.planSet(DOC, ['a.title=Renamed', 'a.status=done', 'a.a1.status=blocked']);
    expect(planr.getAttr(planr.findSectionById(html, 'a').attrsRaw, 'title')).toBe('Renamed');
    expect(planr.getAttr(planr.findSectionById(html, 'a').attrsRaw, 'status')).toBe('done');
    expect(planr.planTasks(html, { all: true })).toMatch(/a\.a1\s+\[blocked\]/);
  });
  it('validates the HEADER status against its own enum', () => {
    expect(planr.planSet(DOC, 'header.status=review').html).toContain('status="review"');
    expect(planr.planSet(DOC, 'header.status=rejected').html).toContain('status="rejected"');
    expect(() => planr.planSet(DOC, 'header.status=aproved'))
      .toThrow(/invalid status 'aproved' for <plan-header> — valid: draft, review, approved, implemented, rejected/);
    // …and a section still gets the SECTION enum, not the header's.
    expect(() => planr.planSet(DOC, 'a.status=review')).toThrow(/invalid status 'review' for <plan-section>/);
  });
  it('throws PlanError on bad spec / attr / status', () => {
    expect(() => planr.planSet(DOC, 'a.a1.status')).toThrow(planr.PlanError);
    expect(() => planr.planSet(DOC, 'a.color=red')).toThrow(/unknown attribute 'color'/);
    expect(() => planr.planSet(DOC, 'a.a1.status=nope')).toThrow(/invalid status 'nope'/);
    expect(() => planr.planSet(DOC, [])).toThrow(/set expects <path>=<value>/);
    expect(() => planr.planSet(DOC, ['a.title=X', 'garbage'])).toThrow(/got "garbage"/);
  });
});

describe('planAddSection', () => {
  it('places a top-level section --after AND --before a ref', () => {
    const after = planr.planAddSection(DOC, { id: 'x', after: 'a' }, null);
    expect(planr.sectionIds(after.html)).toEqual(['a', 'x', 'b', 'c']);
    expect(after.message).toBe("added section 'x' after 'a'");

    const before = planr.planAddSection(DOC, { id: 'x', before: 'a' }, null);
    expect(planr.sectionIds(before.html)).toEqual(['x', 'a', 'b', 'c']);
  });
  it('nests from a FULL sibling address — --parent is not needed', () => {
    const after = planr.planAddSection(DOC, { id: 'a2', after: 'a.a1' }, null).html;
    expect(childIds(after, 'a')).toEqual(['a1', 'a2']);
    expect(planr.sectionIds(after)).toEqual(['a', 'b', 'c']);   // nested, not top-level

    const before = planr.planAddSection(DOC, { id: 'a0', before: 'a.a1' }, null).html;
    expect(childIds(before, 'a')).toEqual(['a0', 'a1']);
  });
  it('appends as the last child of --parent when no ref is given', () => {
    const out = planr.planAddSection(DOC, { id: 'a2', parent: 'a' }, null).html;
    expect(childIds(out, 'a')).toEqual(['a1', 'a2']);
  });
  it('rejects a --parent that contradicts the ref', () => {
    expect(() => planr.planAddSection(DOC, { id: 'x', parent: 'b', after: 'a.a1' }, null))
      .toThrow(/contradicts/);
  });
  it('rejects --after together with --before', () => {
    expect(() => planr.planAddSection(DOC, { id: 'x', after: 'a', before: 'b' }, null))
      .toThrow(/only one of --after/);
  });
  it('throws on a duplicate id at ANY depth, and on a missing --id', () => {
    expect(() => planr.planAddSection(DOC, { id: 'a' }, null)).toThrow(/already exists/);
    expect(() => planr.planAddSection(DOC, { id: 'a1' }, null)).toThrow(/already exists/); // nested
    expect(() => planr.planAddSection(DOC, {}, null)).toThrow('add-section requires --id');
  });
});

describe('planSetBody', () => {
  it('replaces and appends inner content', () => {
    const rep = planr.planSetBody(DOC, 'b', '<p>x</p>', {});
    expect(planr.planRead(rep.html, 'b', { body: true })).toBe('<p>x</p>');
    const app = planr.planSetBody(DOC, 'a', '<p>tail</p>', { append: true });
    expect(planr.planRead(app.html, 'a', { body: true })).toContain('<p>tail</p>');
  });
  it('throws when the splice would break the plan', () => {
    expect(() => planr.planSetBody(DOC, 'a', '<plan-section id="loose">', {})).toThrow(/would break the plan/);
  });
  it('also catches a break that leaves every section id resolving', () => {
    // An unclosed <plan-callout> swallows its siblings, but `a` still resolves —
    // the id check alone passes it, so the full structure check has to run too.
    expect(() => planr.planSetBody(DOC, 'a', '<plan-callout type="info">oops', {}))
      .toThrow(/<plan-callout> is never closed/);
    expect(() => planr.planSetBody(DOC, 'a', '<plan-callout type="info">ok</plan-callout>', {})).not.toThrow();
  });
  it('still edits a plan that arrived already unbalanced', () => {
    // Only a break this write INTRODUCES aborts; a pre-existing one must not
    // lock the document against every future edit.
    const broken = DOC + '\n</plan-table>';
    expect(planr.planCheck(broken).ok).toBe(false);
    expect(() => planr.planSetBody(broken, 'b', '<p>x</p>', {})).not.toThrow();
  });
});

describe('planRmSection', () => {
  it('removes a section and reports', () => {
    const { html, message } = planr.planRmSection(DOC, 'b');
    expect(planr.sectionIds(html)).toEqual(['a', 'c']);
    expect(message).toBe("removed 'b'");
  });
  it('throws on the header', () => {
    expect(() => planr.planRmSection(DOC, 'header')).toThrow('cannot remove the header');
  });
});

describe('planMoveSection', () => {
  it('reorders --before AND --after a ref', () => {
    const before = planr.planMoveSection(DOC, 'c', { before: 'a' });
    expect(planr.sectionIds(before.html)).toEqual(['c', 'a', 'b']);
    expect(before.message).toBe("moved 'c' before 'a'");

    const after = planr.planMoveSection(DOC, 'a', { after: 'c' });
    expect(planr.sectionIds(after.html)).toEqual(['b', 'c', 'a']);
    expect(after.message).toBe("moved 'a' after 'c'");
  });
  it('rejects --after with --before, a self-move, and a missing direction', () => {
    expect(() => planr.planMoveSection(DOC, 'a', { after: 'b', before: 'c' })).toThrow(/only one of --after/);
    expect(() => planr.planMoveSection(DOC, 'a', { after: 'a' })).toThrow(/relative to itself/);
    expect(() => planr.planMoveSection(DOC, 'a', {})).toThrow(/requires --after/);
  });
});

describe('planCheck', () => {
  it('reports balance, section stats, and per-tag counts on a sound document', () => {
    const { ok, report } = planr.planCheck(RICH);
    expect(ok).toBe(true);
    expect(report).toContain('structure OK');
    expect(report).toContain('sections: 2 (1 nested), ids unique');
    expect(report).toMatch(/plan-badge 2/);
    expect(report).toMatch(/tr 2/);
  });
  it('counts only REAL tags — a commented example never inflates the total', () => {
    // This is what made `grep -c '<plan-section'` unreliable: it reported 2/2 on
    // a one-section document, balanced, so it never looked like a failure.
    const html = '<!-- <plan-section id="ghost"></plan-section> -->\n<plan-section id="real"></plan-section>';
    const { ok, report } = planr.planCheck(html);
    expect(ok).toBe(true);
    expect(report).toContain('plan-section 1');
    expect(report).toContain('sections: 1 (0 nested)');
  });
  it('flags an unclosed tag, with the line it opened on', () => {
    const html = '<plan-section id="a">\n  <plan-callout type="info">oops\n</plan-section>';
    const { ok, report } = planr.planCheck(html);
    expect(ok).toBe(false);
    expect(report).toMatch(/line 2: <plan-callout> is never closed/);
  });
  it('flags a stray close tag', () => {
    const { ok, report } = planr.planCheck('<plan-section id="a"></plan-section>\n</plan-table>');
    expect(ok).toBe(false);
    expect(report).toMatch(/line 2: stray <\/plan-table>/);
  });
  it('flags an unregistered component and a duplicate section id', () => {
    const html = '<plan-section id="a">\n  <plan-callour>typo</plan-callour>\n</plan-section>\n<plan-section id="a"></plan-section>';
    const { report } = planr.planCheck(html);
    expect(report).toMatch(/unknown component <plan-callour>/);
    expect(report).toMatch(/duplicate section id 'a' — first used on line 1/);
  });
  it('balances plain table tags too — the other half of the grep recipe', () => {
    const { ok, report } = planr.planCheck('<plan-table><table><tbody><tr><td>x</td></tr></table></plan-table>');
    expect(ok).toBe(false);
    expect(report).toMatch(/<tbody> is never closed/);
  });
  it('notes sections that carry no id', () => {
    expect(planr.planCheck('<plan-section title="A"></plan-section>').report)
      .toContain('1 without an id (not addressable)');
  });
});

describe('planCheck — parent legality', () => {
  const SPLICED = [
    '<plan-section id="rows" title="Rows">',
    '  <plan-table><table><tbody>',
    '    <tr><td><code><tr><td><code>other.html</code></td><td>replaced</td></tr></code></td><td>a note</td></tr>',
    '  </tbody></table></plan-table>',
    '</plan-section>',
  ].join('\n');
  it('fails a balanced row spliced into a cell, naming the line and the inline parent', () => {
    const { ok, report, warnings } = planr.planCheck(SPLICED);
    expect(ok).toBe(false);
    expect(report).toMatch(/line 3: <tr> inside <code> — a <tr> belongs directly in <table>, <thead>, <tbody>, <tfoot>/);
    expect(report).toContain('A misnested tag is usually a `replace` whose match sat inside an inline element');
    expect(warnings).toEqual([]);
  });
  it('fails a block component inside inline code', () => {
    const html = '<plan-section id="s">\n  <p><code><plan-callout type="info">x</plan-callout></code></p>\n</plan-section>';
    expect(planr.planCheck(html).report)
      .toMatch(/line 2: <plan-callout> inside inline <code> — a block element cannot sit in running text/);
  });
  it('says so on a sound document', () => {
    expect(planr.planCheck(RICH).report).toContain('structure OK — every <plan-*> and table tag is balanced and legally nested');
    expect(planr.planCheck(DEFS_DOC).ok).toBe(true);
  });
  it('reports nesting only once the tags balance', () => {
    const { report } = planr.planCheck(SPLICED.replace('</plan-table>', ''));
    expect(report).toMatch(/<plan-table> is never closed/);
    expect(report).not.toMatch(/inside <code>/);
    expect(report).toContain("An unescaped '<' in code content is the usual cause");
  });
  it('refuses a write that would nest a row in a row, on a document that passes check', () => {
    expect(() => planr.planInsert(RICH, 'map', '<tr><td>new</td></tr>', { where: 'end', into: 'tr:1' }))
      .toThrow(/insert would break the plan[\s\S]*<tr> inside <tr>/);
  });
});

// A plan body placed inside <main>, below a header: the body's first line is line 3.
const inMain = (body) => ['<plan-header title="T" status="draft"></plan-header>', '<main>', body, '</main>'].join('\n');

describe('planCheck warnings', () => {
  it('returns an empty warning list for a clean document', () => {
    expect(planr.planCheck(RICH).warnings).toEqual([]);
  });
  it('warns when <main> opens with a text-carrying comment — a scaffold banner — at its line', () => {
    const html = inMain('  <!-- ════════════\n       TDD plan — the spine.\n       ════════════ -->\n  <plan-section id="a"></plan-section>');
    const { ok, warnings } = planr.planCheck(html);
    expect(ok).toBe(true);
    expect(warnings).toEqual([{ line: 3, text: expect.stringMatching(/^<main> opens with a comment carrying text/) }]);
  });
  it('ignores a rule-only comment, and a comment after the first element', () => {
    expect(planr.planCheck(inMain('<!-- ═══════════════ -->\n<plan-section id="a"></plan-section>')).warnings).toEqual([]);
    expect(planr.planCheck(inMain('<plan-section id="a"></plan-section>\n<!-- a real note -->')).warnings).toEqual([]);
  });
  it('gathers no warnings on a document that fails the structure check', () => {
    expect(planr.planCheck(inMain('<!-- banner text -->\n<plan-callout type="info">oops'))).toMatchObject({ ok: false, warnings: [] });
  });
  it('warningReport prints one line per warning, and nothing when there are none', () => {
    expect(planr.warningReport([])).toBe('');
    expect(planr.warningReport([{ line: 3, text: 'a' }, { line: 9, text: 'b' }]))
      .toBe('2 warning(s) — the document balances, but will not render as written:\n  line 3: a\n  line 9: b');
  });
});

describe('planCheck warnings — code components', () => {
  it('warns on an unescaped tag inside <plan-file> and <plan-diff>, at the first tag\'s line', () => {
    const html = inMain([
      '<plan-file path="a.js">',          // 3
      'const x = 1;',                     // 4
      'return <Flex gap="2" />;',         // 5
      '</plan-file>',                     // 6
      '<plan-diff path="b.js">',          // 7
      ' ok',                              // 8
      '+  &lt;Box&gt; is escaped',        // 9
      '-  </div>',                        // 10
      '</plan-diff>',
    ].join('\n'));
    expect(planr.planCheck(html).warnings).toEqual([
      { line: 5, text: expect.stringMatching(/^<plan-file path="a\.js">: 1 unescaped tag\(s\), first <Flex> — /) },
      { line: 10, text: expect.stringMatching(/^<plan-diff path="b\.js">: 1 unescaped tag\(s\), first <\/div> — /) },
    ]);
  });
  it('warns once per <plan-diff> on lines with no gutter character, listing each line', () => {
    const html = inMain([
      '<plan-diff path="c.py">',          // 3
      ' class Config:',                   // 4
      'debug = True',                     // 5  no gutter
      '',                                 // 6  blank line = context
      '+    verbose = True',              // 7
      '\tindented = 1',                   // 8  a tab is not a gutter
      '&lt;T&gt; = 2',                    // 9  decodes to "<", not a gutter
      '  </plan-diff>',
    ].join('\n'));
    expect(planr.planCheck(html).warnings).toEqual([
      { line: 5, text: expect.stringMatching(/^<plan-diff path="c\.py">: 3 line\(s\) with no gutter character \(lines 5, 8, 9\) — /) },
    ]);
  });
});

describe('planCheck warnings — code components (guards)', () => {
  it('accepts every gutter the runtime accepts, and ignores blank edge lines', () => {
    expect(planr.planCheck(inMain('<plan-diff>\n\n   \n ctx\n-del\n+add\n\n   \n</plan-diff>')).warnings).toEqual([]);
  });
});

describe('planCheck warnings — section references', () => {
  it('warns on an in-page link whose whole text is a bare section number, suggesting the name', () => {
    const html = inMain([
      '<plan-section id="reviews" title="Reviews">',                                             // 3
      '  <p>See <a href="#reviews">&sect;1</a>.</p>',                                             // 4
      '  <p>See <a href="#reviews">§1.2</a> and <a href="#reviews">&sect;1 Reviews</a>.</p>',      // 5
      '  <p><a href="https://example.test/#s">§3</a></p>',                                        // 6
      '</plan-section>',
    ].join('\n'));
    const warnings = planr.planCheck(html).warnings;
    expect(warnings.map(w => w.line)).toEqual([4, 5]);
    expect(warnings[0].text).toBe('link text "§1" (href="#reviews") is a bare section number — numbers re-derive ' +
      'when a section is added or moved; name the section too, e.g. "§1 Reviews"');
  });
});

describe('planCheck warnings — badge labels', () => {
  it('warns on a badge whose label is a DIFFERENT type\'s label', () => {
    const html = inMain([
      '<table><tbody>',                                                                   // 3
      '<tr><td>a</td><td><plan-badge type="open">Decided</plan-badge></td></tr>',         // 4  names another type
      '<tr><td>b</td><td><plan-badge type="decided">Decided</plan-badge></td></tr>',      // 5  its own label
      '<tr><td>c</td><td><plan-badge type="open">not started</plan-badge></td></tr>',     // 6  custom
      '<tr><td>d</td><td><plan-badge>low</plan-badge></td></tr>',                         // 7  no type means open
      '</tbody></table>',
    ].join('\n'));
    const warnings = planr.planCheck(html).warnings;
    expect(warnings.map(w => w.line)).toEqual([4, 7]);
    expect(warnings[0].text).toBe('<plan-badge type="open"> reads "Decided", the label of type "decided" — it renders ' +
      'one state and names another; clear the label with `badge --set <type> --text ""`');
    expect(warnings[1].text).toMatch(/^<plan-badge type="open"> reads "low", the label of type "low"/);
  });
});

describe('header title and the head <title>', () => {
  const DOCUMENT = [
    '<!DOCTYPE html>',
    '<html><head>',
    '  <title>Old &amp; Busted</title>',
    '</head><body>',
    '<plan-header title="Old &amp; Busted" status="draft"></plan-header>',
    '<main>',
    '<plan-section id="a" title="A"></plan-section>',
    '</main>',
    '</body></html>',
  ].join('\n');
  const headText = (html) => /<title>([\s\S]*?)<\/title>/.exec(html)[1];
  it('set header.title writes the same bytes into <title>, and reports both writes', () => {
    const { html, message } = planr.planSet(DOCUMENT, 'header.title=New &amp; Shiny');
    expect(headText(html)).toBe('New &amp; Shiny');
    expect(planr.getAttr(planr.findElement(html, 'plan-header').attrsRaw, 'title')).toBe('New &amp; Shiny');
    expect(message).toBe('set header.title = "New &amp; Shiny"\nset <title> = "New &amp; Shiny"');
  });
  it('new --set header.title keeps both titles in step', () => {
    const shell = '<html><head><title>{{title}}</title></head><body>' +
      '<plan-header title="{{title}}" status="draft"></plan-header><main>{{body}}</main></body></html>';
    const html = planr.planNew(shell, BODY, { title: 'First', date: 'd', skillSubpath: 's', sets: ['header.title=Second'] });
    expect(headText(html)).toBe('Second');
  });
  it('check warns when <title> and the header title diverge, comparing decoded text', () => {
    expect(planr.planCheck(DOCUMENT).warnings).toEqual([]);
    const drifted = DOCUMENT.replace('<title>Old &amp; Busted</title>', '<title>Old & Busted v1</title>');
    expect(planr.planCheck(drifted).warnings).toEqual([{
      line: 3,
      text: '<title> reads "Old & Busted v1" but the header title is "Old & Busted" — `set header.title=…` rewrites both',
    }]);
  });
});

describe('header title and the head <title> (guards)', () => {
  it('leaves <title> alone for any other header attribute and for a section title', () => {
    const doc = '<html><head><title>Keep</title></head><body><plan-header title="Keep" status="draft"></plan-header>' +
      '\n<plan-section id="a" title="A"></plan-section></body></html>';
    const { html } = planr.planSet(doc, ['header.subtitle=S', 'a.title=Renamed']);
    expect(/<title>([\s\S]*?)<\/title>/.exec(html)[1]).toBe('Keep');
  });
  it('sets header.title on a document with no <head> without inventing one', () => {
    const { html, message } = planr.planSet(DOC, 'header.title=Renamed');
    expect(html).not.toContain('<title>');
    expect(message).toBe('set header.title = "Renamed"');
  });
});

describe('attribute rules — every writer validates through validateAttr', () => {
  const TAG_IN_TITLE = /contains an HTML tag — titles are plain text/;
  it('add-section rejects an out-of-enum --status — it used to write it and drop out of `tasks`', () => {
    expect(() => planr.planAddSection(DOC, { id: 'x', status: 'bogus' }, null))
      .toThrow("invalid status 'bogus' for <plan-section> — valid: todo, in-progress, done, blocked");
  });
  it('add-section rejects a --title carrying a tag', () => {
    expect(() => planr.planAddSection(DOC, { id: 'x', title: 'Add the <code>Order</code> model' }, null))
      .toThrow('title "Add the <code>Order</code> model" on <plan-section> contains an HTML tag — titles are plain text ' +
        '(the navigation shows markup as literal tags); remove the markup, or write a literal < as &lt;');
  });
  it('set rejects a tag in a section title and in the header title, closing tags included', () => {
    expect(() => planr.planSet(DOC, 'a.title=<b>Bold</b>')).toThrow(/^title "<b>Bold<\/b>" on <plan-section> contains an HTML tag/);
    expect(() => planr.planSet(DOC, 'header.title=End</title>')).toThrow(/^title "End<\/title>" on <plan-header> contains an HTML tag/);
  });
  it('new rejects a tag in the title from --title, a bare --set, and a dotted --set', () => {
    const base = { date: 'd', skillSubpath: 's' };
    expect(() => planr.planNew(SHELL, BODY, { ...base, title: 'A <em>plan</em>' })).toThrow(TAG_IN_TITLE);
    expect(() => planr.planNew(SHELL, BODY, { ...base, sets: ['title=<i>x</i>'] })).toThrow(TAG_IN_TITLE);
    expect(() => planr.planNew(SHELL, BODY, { ...base, sets: ['header.title=<i>x</i>'] })).toThrow(TAG_IN_TITLE);
  });
  it('new validates the rendered sections, not only the header', () => {
    const base = { title: 'T', date: 'd', skillSubpath: 's' };
    expect(() => planr.planNew(SHELL, '  <plan-section id="o" status="bogus"></plan-section>', base))
      .toThrow("invalid status 'bogus' for <plan-section>");
    expect(() => planr.planNew(SHELL, '  <plan-section id="o" title="<b>x</b>"></plan-section>', base))
      .toThrow(/^title "<b>x<\/b>" on <plan-section> contains an HTML tag/);
  });
});

describe('titles are plain text (guards)', () => {
  it('accepts a bare < that opens no tag, and escaped markup', () => {
    expect(() => planr.planSet(DOC, 'a.title=a < b &amp; c')).not.toThrow();
    expect(() => planr.planAddSection(DOC, { id: 'x', title: 'Use &lt;code&gt; sparingly' }, null)).not.toThrow();
  });
});

describe('template documentation (the leading-comment convention)', () => {
  const TPL = [
    '  <!-- ════════════════════════════════════════',
    '       Probe template — for probing things. Not for anything else.',
    '',
    '       Conventions:',
    '         · One bullet.',
    '       ════════════════════════════════════════ -->',
    '',
    '  <plan-section id="overview" title="Overview"></plan-section>',
  ].join('\n');

  it('extracts the leading comment, dropping rules and de-indenting', () => {
    expect(planr.templateDoc(TPL)).toBe(
      'Probe template — for probing things. Not for anything else.\n\nConventions:\n  · One bullet.');
  });
  it('summarises to the first sentence', () => {
    expect(planr.templateSummary(TPL)).toBe('Probe template — for probing things.');
    // No sentence break → the whole first paragraph, whitespace collapsed.
    expect(planr.templateSummary('<!--\n  Just a label\n-->')).toBe('Just a label');
  });
  it('only counts a comment at the very top', () => {
    expect(planr.templateDoc('<plan-section id="a"></plan-section>\n<!-- inline note -->')).toBeNull();
    expect(planr.templateSummary('<plan-section id="a"></plan-section>')).toBe('');
  });

  const entries = [
    { name: 'zeta', body: TPL },
    { name: 'alpha', body: '<plan-section id="only"></plan-section>' },
  ];
  it('lists templates alphabetically with their gist', () => {
    const out = planr.planTemplateReport(entries);
    expect(out).toMatch(/^alpha {2}\(no description\)\nzeta {3}Probe template/);
    expect(out).toContain('Run `planr templates <name>`');
  });
  it('describes one template: its guidance, what it scaffolds, and its variables', () => {
    const out = planr.planTemplateReport(entries, 'zeta');
    expect(out).toContain('# zeta');
    expect(out).toContain('· One bullet.');
    expect(out).toContain('Scaffolds 1 section:');
    expect(out).toContain('1. overview');
  });
  it('lists variables from the SHELL as well as the body — that is where lang lives', () => {
    const shell = '<html lang="{{lang:en}}"><title>{{title}}</title>{{body}}';
    const out = planr.planTemplateReport(entries, 'zeta', shell);
    expect(out).toMatch(/lang\s+\(default: en\)/);
    expect(out).toMatch(/title\s+\(no default — always filled\)/);
    expect(out).not.toContain('body');   // the slot is not a knob
  });
  it('says so when a template carries no guidance, and rejects an unknown name', () => {
    expect(planr.planTemplateReport(entries, 'alpha')).toContain('no leading comment');
    expect(() => planr.planTemplateReport(entries, 'nope')).toThrow(/unknown template 'nope' — have: alpha, zeta/);
    expect(() => planr.planTemplateReport([])).toThrow(/no templates found/);
  });

  // Inside describe('template documentation (the leading-comment convention)'),
  // after the existing `entries` tests — TPL and `entries` are in scope there.
  const PROBE_SHELL = '<title>{{title}}</title>\n<plan-header title="{{title}}" status="draft"></plan-header>\n<main>\n{{body}}\n</main>';

  it('templateProblems holds a template to the rules every shipped template meets', () => {
    expect(planr.templateProblems(TPL, PROBE_SHELL)).toEqual([]);
    expect(planr.templateProblems('<plan-section id="a"></plan-section>', PROBE_SHELL))
      .toEqual(['no leading comment — open the template with an HTML comment saying what it is for']);
    expect(planr.templateProblems('<!-- Uses <plan-callout> for notes. -->\n<plan-section id="a"></plan-section>', PROBE_SHELL))
      .toEqual(['its leading comment contains a literal <plan-*> tag — refer to components in prose']);
    expect(planr.templateProblems('<!-- Broken. -->\n<plan-section id="a">', PROBE_SHELL))
      .toContain('fails check once scaffolded — run `planr new` with it and `planr check` the result');
  });
  it('templateProblems counts a check WARNING in the scaffold as a problem', () => {
    // A diff line with no gutter character: structurally sound, one S2 warning.
    const body = '<!-- Gutterless. -->\n<plan-section id="a" title="A">\n<plan-diff path="a.py">\nno gutter\n</plan-diff>\n</plan-section>';
    const problems = planr.templateProblems(body, PROBE_SHELL);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^check warning once scaffolded — line \d+: /);
  });
  it('every shipped template has no problems', () => {
    const dir = join(SKILL_DIR, 'templates');
    const shell = readFileSync(join(dir, '_shell.html'), 'utf8');
    const names = planr.planTemplates(readdirSync(dir));
    expect(names.length).toBeGreaterThan(0);
    for (const n of names)
      expect(planr.templateProblems(readFileSync(join(dir, `${n}.html`), 'utf8'), shell), n).toEqual([]);
  });
  it('marks a consumer template, and one that shadows a skill template, in the list', () => {
    const out = planr.planTemplateReport([
      { name: 'zeta', body: TPL, origin: 'consumer', shadows: false },
      { name: 'tdd', body: TPL, origin: 'consumer', shadows: true },
      { name: 'basic', body: TPL, origin: 'skill', shadows: false },
    ]);
    expect(out).toMatch(/^basic {2}Probe template/m);
    expect(out).toMatch(/^tdd {4}\[consumer, shadows skill\] Probe template/m);
    expect(out).toMatch(/^zeta {3}\[consumer\] Probe template/m);
  });
  it('names a consumer template\'s source file when describing it', () => {
    const out = planr.planTemplateReport([{
      name: 'tdd', body: TPL, origin: 'consumer', shadows: true, path: '/r/.claude/planr-templates/tdd.html',
    }], 'tdd');
    expect(out).toContain("source: consumer template — /r/.claude/planr-templates/tdd.html (shadows the skill template 'tdd')");
  });
  it('reports template problems in the list and in the description', () => {
    expect(planr.planTemplateReport(entries)).toMatch(/Template problems:\n {2}alpha: no leading comment/);
    expect(planr.planTemplateReport(entries, 'alpha')).toMatch(/Problems:\n {2}no leading comment/);
  });
});

describe('planList outline', () => {
  it('lists a section\'s OWN headings by default, never a nested section\'s', () => {
    const out = planr.planList(RICH);
    expect(out).toMatch(/1\. map — Map\n {4}h3 {2}Decisions so far\n {4}h3 {2}Tickets/);
    // "Nested heading" belongs to `vocab`, one level deeper — not to `map`.
    expect(out).toMatch(/1\.1\. vocab — Vocabulary\n {8}h3 {2}Nested heading/);
  });
  it('--no-outline falls back to sections alone', () => {
    const terse = planr.planList(RICH, { 'no-outline': true });
    expect(terse).not.toContain('Decisions so far');
    expect(terse).toContain('1. map — Map');
  });
});

describe('planInsert', () => {
  it('appends a <plan-def> INTO a <plan-defs>', () => {
    const one = planr.planInsert(DEFS_DOC, 'fields',
      '<plan-def key="tier">CharField(max_length=10)</plan-def>', { where: 'end', into: 'plan-defs:1' });
    expect(one.message).toBe("inserted 56 chars at the end of 'fields' → plan-defs:1 of 2");
    expect(one.html).toMatch(
      /<plan-def key="country_code">CharField\(max_length=2\)<\/plan-def>\n {6}<plan-def key="tier">CharField\(max_length=10\)<\/plan-def>\n {4}<\/plan-defs>/);
    expect(planr.planCheck(one.html).ok).toBe(true);

    // No ordinal → the LAST own <plan-defs>, here the one inside the table cell.
    const cell = planr.planInsert(DEFS_DOC, 'fields',
      '<plan-def key="limit">500/day</plan-def>', { where: 'end', into: 'plan-defs' });
    expect(cell.message).toContain('→ plan-defs:2 of 2');
    expect(cell.html).toMatch(
      /<td><plan-defs><plan-def key="tier">CharField<\/plan-def>\s*<plan-def key="limit">500\/day<\/plan-def>\s*<\/plan-defs><\/td>/);
    expect(planr.planCheck(cell.html).ok).toBe(true);
  });
  it('--into refuses exactly the tags the dot-path addresses, and accepts any other component', () => {
    const doc = [
      '<plan-header title="T" status="draft"></plan-header>',
      '<plan-section id="s" title="S">',
      '  <plan-section id="k" title="K"></plan-section>',
      '  <plan-subsection id="u" title="U"></plan-subsection>',
      '  <plan-cards>',
      '    <plan-card label="A"></plan-card>',
      '  </plan-cards>',
      '</plan-section>',
    ].join('\n');
    for (const tag of ['plan-section', 'plan-subsection', 'plan-header'])
      expect(() => planr.planInsert(doc, 's', '<p>x</p>', { into: tag }), tag)
        .toThrow(new RegExp(`address a <${tag}> with the dot-path`));
    const { html, message } = planr.planInsert(doc, 's', '<plan-card label="B"></plan-card>', { where: 'end', into: 'plan-cards' });
    expect(message).toContain('→ plan-cards');
    expect(html).toMatch(/<plan-card label="A"><\/plan-card>\n {4}<plan-card label="B"><\/plan-card>\n {2}<\/plan-cards>/);
    expect(planr.planCheck(html).ok).toBe(true);
  });
  it('prepends to a section body — the amendment-callout write', () => {
    const { html, message } = planr.planInsert(RICH, 'map', '<plan-callout type="warn">Amended.</plan-callout>', { where: 'start' });
    expect(bodyOf(html, 'map').trimStart()).toMatch(/^<plan-callout type="warn">Amended\.<\/plan-callout>/);
    expect(message).toBe("inserted 49 chars at the start of 'map'");
  });
  it('appends to a section body, above the closing tag', () => {
    const { html } = planr.planInsert(RICH, 'map', '<p>tail</p>', { where: 'end' });
    expect(bodyOf(html, 'map').trimEnd()).toMatch(/<p>tail<\/p>$/);
  });
  it('appends INTO the running list — the target is the container, not the body', () => {
    const { html, message } = planr.planInsert(RICH, 'map', '<li>Second.</li>', { where: 'end', into: 'ul' });
    expect(html).toMatch(/<li>First\.<\/li>\n {6}<li>Second\.<\/li>\n {4}<\/ul>/);
    expect(message).toBe("inserted 16 chars at the end of 'map' → ul");
    expect(planr.planCheck(html).ok).toBe(true);
  });
  it('--into ignores containers owned by a nested section', () => {
    // `vocab` has its own <ul>; `map`'s only OWN list is the top one.
    const { html } = planr.planInsert(RICH, 'map', '<li>Second.</li>', { where: 'end', into: 'ul' });
    expect(html).toContain('<ul><li>Nested list.</li></ul>');   // untouched
  });
  it('--into accepts <tag>:<n> and #<id>', () => {
    const byNth = planr.planInsert(RICH, 'map', '<td>new</td>', { where: 'end', into: 'tr:1' });
    expect(byNth.message).toContain('→ tr:1 of 2');
    const byId = planr.planInsert(RICH, 'map', '<tbody></tbody>', { where: 'end', into: '#tickets' });
    expect(byId.message).toContain('→ #tickets');
  });
  it('rejects an unusable --into selector', () => {
    expect(() => planr.planInsert(RICH, 'map', '<li>x</li>', { into: 'ol' })).toThrow(/no <ol> in this section/);
    expect(() => planr.planInsert(RICH, 'map', '<li>x</li>', { into: 'tr:9' })).toThrow(/only 2 <tr>/);
    expect(() => planr.planInsert(RICH, 'map', '<li>x</li>', { into: '#nope' })).toThrow(/no element with id 'nope'/);
    expect(() => planr.planInsert(RICH, 'map', '<li>x</li>', { into: 'a b' })).toThrow(/expected <tag>, <tag>:<n>, or #<id>/);
  });
  it('anchors on a heading, before and after', () => {
    const before = planr.planInsert(RICH, 'map', '<p>A</p>', { beforeHeading: 'Tickets' });
    expect(before.html).toMatch(/<p>A<\/p>\n {4}<h3>Tickets<\/h3>/);
    expect(before.message).toBe('inserted 8 chars before heading "Tickets" of \'map\'');
    const after = planr.planInsert(RICH, 'map', '<p>A</p>', { afterHeading: 'Tickets' });
    expect(after.html).toMatch(/<h3>Tickets<\/h3>\n {4}<p>A<\/p>/);
  });
  it('refuses a heading match that is missing or ambiguous', () => {
    expect(() => planr.planInsert(RICH, 'map', '<p>A</p>', { beforeHeading: 'Nowhere' }))
      .toThrow(/no heading matching "Nowhere".*"Decisions so far", "Tickets"/s);
    expect(() => planr.planInsert(RICH, 'map', '<p>A</p>', { beforeHeading: 'ick' })).not.toThrow();
    // A nested section sees only its OWN headings — the parent's are not in scope.
    expect(() => planr.planInsert(RICH, 'map.vocab', '<p>A</p>', { beforeHeading: 'Decisions' }))
      .toThrow(/no heading matching "Decisions".*"Nested heading"/s);
    const twoHeads = '<plan-section id="s"><h3>Alpha one</h3><h3>Alpha two</h3></plan-section>';
    expect(() => planr.planInsert(twoHeads, 's', '<p>A</p>', { beforeHeading: 'Alpha' }))
      .toThrow(/matches 2 headings/);
  });
  it('requires an anchor when the caller demands one (the `insert` command)', () => {
    expect(() => planr.planInsert(RICH, 'map', '<p>A</p>', { anchored: true })).toThrow(/insert requires --before-heading/);
    expect(() => planr.planInsert(RICH, 'map', '<p>A</p>', { beforeHeading: 'a', afterHeading: 'b' }))
      .toThrow(/only one of --before-heading/);
  });
  it('indents a hunk that carries none, and leaves an indented hunk alone', () => {
    const bare = planr.planInsert(RICH, 'map', '<li>a</li>\n<li>b</li>', { where: 'end', into: 'ul' }).html;
    expect(bare).toContain('      <li>a</li>\n      <li>b</li>');
    const owned = planr.planInsert(RICH, 'map', '\n        <li>a</li>\n', { where: 'end', into: 'ul' }).html;
    expect(owned).toContain('        <li>a</li>');
  });
  it('never leaves a hunk sharing a line with the markup it displaced', () => {
    // A body whose content begins on the opening tag's own line (common after a
    // verbatim set-body) has no line boundary to splice at — one must be made.
    const tight = '<plan-section id="s"><ul><li>a</li></ul></plan-section>';
    expect(planr.planInsert(tight, 's', '<p>note</p>', { where: 'start' }).html)
      .toBe('<plan-section id="s">\n  <p>note</p>\n<ul><li>a</li></ul></plan-section>');
    expect(planr.planInsert(tight, 's', '<li>b</li>', { where: 'end', into: 'ul' }).html)
      .toBe('<plan-section id="s"><ul><li>a</li>\n  <li>b</li>\n</ul></plan-section>');
  });
  it('refuses the header, an empty hunk, and a splice that would break the plan', () => {
    expect(() => planr.planInsert(RICH, 'header', '<p>x</p>', {})).toThrow(/the header holds no body/);
    expect(() => planr.planInsert(RICH, 'map', '   \n  ', {})).toThrow(/nothing to insert/);
    expect(() => planr.planInsert(RICH, 'map', '<plan-section id="loose">', {})).toThrow(/would break the plan/);
    expect(() => planr.planInsert(RICH, '', '<p>x</p>', {})).toThrow(/an address is required/);
  });
});

describe('--into range errors name the nested-section exclusion', () => {
  it('says nested sections are excluded when the addressed section has any', () => {
    expect(() => planr.planInsert(RICH, 'map', '<li>x</li>', { into: 'ul:2' }))
      .toThrow("--into 'ul:2': only 1 <ul> in this section (nested sections are excluded — address the child section directly)");
    expect(() => planr.planInsert(RICH, 'map', '<li>x</li>', { into: 'ol' }))
      .toThrow("--into 'ol': no <ol> in this section (nested sections are excluded — address the child section directly)");
  });
  it('keeps the plain message for a section with no nested sections', () => {
    expect(() => planr.planInsert(RICH, 'map.vocab', '<li>x</li>', { into: 'ul:2' }))
      .toThrow(/^--into 'ul:2': only 1 <ul> in this section$/);
  });
});

describe('planBadge', () => {
  const typeOf = (html, n) => planr.getAttr(planr.findElements(html, 'plan-badge')[n].attrsRaw, 'type');
  it('flips the badge in the row matching --match', () => {
    const { html, message } = planr.planBadge(RICH, { match: 'q16', set: 'decided' });
    expect(typeOf(html, 0)).toBe('decided');
    expect(typeOf(html, 1)).toBe('open');           // the other row is untouched
    expect(message).toBe('set badge type = "decided" in row "q16 staging"');
  });
  it('matches on the row\'s visible text, case-insensitively', () => {
    expect(() => planr.planBadge(RICH, { match: 'Q18 SIGNALS', set: 'deferred' })).not.toThrow();
  });
  it('refuses to guess when --match is ambiguous, unless --all', () => {
    expect(() => planr.planBadge(RICH, { match: 'q1', set: 'decided' })).toThrow(/matches 2 rows/);
    const { html } = planr.planBadge(RICH, { match: 'q1', set: 'decided', all: true });
    expect([typeOf(html, 0), typeOf(html, 1)]).toEqual(['decided', 'decided']);
  });
  it('scopes to --in, and reports a scoped miss as a miss', () => {
    expect(() => planr.planBadge(RICH, { match: 'q16', set: 'decided', in: 'map.vocab' }))
      .toThrow(/no table row matching "q16" in 'map.vocab'/);
    expect(planr.planBadge(RICH, { match: 'q16', set: 'decided', in: 'map' }).html).toBeTruthy();
  });
  it('sets the inner text too when --text is given', () => {
    const { html, message } = planr.planBadge(RICH, { match: 'q16', set: 'decided', text: 'Shipped' });
    expect(html).toContain('<plan-badge type="decided">Shipped</plan-badge>');
    expect(message).toContain('text = "Shipped"');
  });
  it('requires --nth when a row holds more than one badge', () => {
    const two = '<table><tr><td>q9</td><td><plan-badge type="open"></plan-badge>' +
                '<plan-badge type="low"></plan-badge></td></tr></table>';
    expect(() => planr.planBadge(two, { match: 'q9', set: 'decided' })).toThrow(/has 2 badges — pick one with --nth/);
    expect(typeOf(planr.planBadge(two, { match: 'q9', set: 'decided', nth: '2' }).html, 1)).toBe('decided');
    expect(() => planr.planBadge(two, { match: 'q9', set: 'decided', nth: '3' })).toThrow(/has 2 badge\(s\)/);
    expect(() => planr.planBadge(two, { match: 'q9', set: 'decided', nth: 'x' })).toThrow(/--nth expects a 1-based number/);
  });
  it('validates its arguments', () => {
    expect(() => planr.planBadge(RICH, { set: 'decided' })).toThrow(/requires --match/);
    expect(() => planr.planBadge(RICH, { match: 'q16' })).toThrow(/requires --set <type>/);
    expect(() => planr.planBadge(RICH, { match: 'q16', set: 'nope' })).toThrow(/invalid badge type 'nope'/);
    expect(() => planr.planBadge(RICH, { match: 'nothing here', set: 'open' })).toThrow(/no table row matching/);
    const noBadge = '<table><tr><td>q7 plain row</td></tr></table>';
    expect(() => planr.planBadge(noBadge, { match: 'q7', set: 'open' })).toThrow(/none contains a <plan-badge>/);
  });
});

describe('planBadge label handling', () => {
  const LABELLED = [
    '<table><tbody>',
    '<tr><td>q20 derived</td><td><plan-badge type="open">Open</plan-badge></td></tr>',
    '<tr><td>q21 custom</td><td><plan-badge type="open">not started</plan-badge></td></tr>',
    '<tr><td>q22 derived-case</td><td><plan-badge type="deferred"> deferred </plan-badge></td></tr>',
    '<tr><td>q23 custom</td><td><plan-badge type="high">P0</plan-badge></td></tr>',
    '</tbody></table>',
  ].join('\n');
  it('clears a label that is only the current type\'s derived text, and says so', () => {
    const { html, message } = planr.planBadge(LABELLED, { match: 'q20', set: 'decided' });
    expect(html).toContain('<td>q20 derived</td><td><plan-badge type="decided"></plan-badge>');
    expect(message).toBe('set badge type = "decided" in row "q20 derived Open" — cleared its derived label "Open"');
  });
  it('compares the derived label trimmed and case-insensitively', () => {
    const { html } = planr.planBadge(LABELLED, { match: 'q22', set: 'high' });
    expect(html).toContain('<td>q22 derived-case</td><td><plan-badge type="high"></plan-badge>');
  });
  it('refuses a custom label with no --text, naming the label and both remedies', () => {
    expect(() => planr.planBadge(LABELLED, { match: 'q21', set: 'decided' })).toThrow(
      'badge --set would leave a label naming the old state:\n' +
      '  row "q21 custom not started" carries "not started"\n' +
      'pass --text "<label>" to keep or rewrite the label, or --text "" to clear it so the type names it');
  });
  it('lets --text win over any label: rewrite, keep, or clear', () => {
    const rewrite = planr.planBadge(LABELLED, { match: 'q21', set: 'decided', text: 'Shipped' });
    expect(rewrite.html).toContain('<plan-badge type="decided">Shipped</plan-badge>');
    expect(rewrite.message).toBe('set badge type = "decided" text = "Shipped" (was "not started") in row "q21 custom not started"');
    expect(planr.planBadge(LABELLED, { match: 'q21', set: 'decided', text: '' }).html)
      .toContain('<td>q21 custom</td><td><plan-badge type="decided"></plan-badge>');
  });
  it('with --all, refuses before writing anything and lists every custom label', () => {
    expect(() => planr.planBadge(LABELLED, { match: 'q2', set: 'decided', all: true }))
      .toThrow(/carries "not started"\n {2}row "q23 custom P0" carries "P0"\npass --text/);
  });
  it('BADGE_LABELS matches the label map PlanBadge renders from', () => {
    const runtime = readFileSync(join(SKILL_DIR, 'plan-runtime.js'), 'utf8');
    const block = /class PlanBadge[\s\S]*?const labels = \{([\s\S]*?)\};/.exec(runtime);
    expect(block, 'PlanBadge label map not found in plan-runtime.js').toBeTruthy();
    const labels = Object.fromEntries([...block[1].matchAll(/([\w-]+):\s*'([^']*)'/g)].map(m => [m[1], m[2]]));
    expect(planr.BADGE_LABELS).toEqual(labels);
    expect(planr.BADGE_TYPES).toEqual(Object.keys(planr.BADGE_LABELS));
  });
});

describe('resolveNode error path (now throwing, not exiting)', () => {
  it('throws PlanError on an unknown address', () => {
    expect(() => planr.planRead(DOC, 'nope', {})).toThrow(planr.PlanError);
  });
});

describe('bare ids through the cores', () => {
  it('read, set and set-body all accept a nested section by its bare id', () => {
    expect(planr.planRead(DOC, 'a1', {})).toContain('<plan-section id="a1"');
    expect(planr.planSet(DOC, 'a1.status=done').html).toContain('id="a1" status="done"');
    expect(planr.planRead(planr.planSetBody(DOC, 'a1', '<p>x</p>', {}).html, 'a.a1', { body: true })).toBe('<p>x</p>');
  });
  it('add-section accepts a bare ref and a bare --parent that agree', () => {
    const out = planr.planAddSection(DOC, { id: 'a2', parent: 'a', after: 'a1' }, null).html;
    expect(childIds(out, 'a')).toEqual(['a1', 'a2']);
  });
  it('add-section still refuses a --parent that contradicts a bare ref', () => {
    expect(() => planr.planAddSection(DOC, { id: 'x', parent: 'b', after: 'a1' }, null))
      .toThrow(/--parent 'b' contradicts --after 'a1' \(which sits in 'a'\)/);
  });
  it('move-section sees a bare id and its full path as the same section', () => {
    expect(() => planr.planMoveSection(DOC, 'a.a1', { after: 'a1' })).toThrow(/relative to itself/);
  });
});

describe('TEXT_RULES', () => {
  it('declares a read --text rule for every registered component', () => {
    // A component whose content lives in an attribute (a card's value, a
    // diagram's caption) is dropped from text output unless its rule says so.
    const missing = planr.PLAN_TAGS.filter(t => !planr.TEXT_RULES[t]);
    expect(missing).toEqual([]);
    for (const t of planr.PLAN_TAGS) expect(['block', 'inline', 'code'], t).toContain(planr.TEXT_RULES[t].kind);
  });
});

// Prose, lists, a struck line, a code block and a NESTED section repeating the
// parent's phrases — the shapes text-addressed writes (rm-item, strike,
// replace) target, and the decoys they must not reach.
const PROSE = [
  '<plan-header title="Ticket" status="draft"></plan-header>',
  '<main>',
  '  <plan-section id="resolution" title="Resolution">',
  '    <p>We keep the legacy queue &amp; retry',
  '      every hour.</p>',
  '    <p>Alerts go to <code>ops</code> on failure.</p>',
  '    <ul>',
  '      <li>Retry hourly.</li>',
  '      <li>Page on-call.</li>',
  '      <li>Retry daily<ul><li>Backoff doubles.</li></ul></li>',
  '    </ul>',
  '    <p><s>Old plan retired.</s></p>',
  '    <plan-file path="retry.py">',
  'RETRY = &quot;hourly&quot;',
  '    </plan-file>',
  '    <plan-section id="history" title="History">',
  '      <p>We keep the legacy queue for now.</p>',
  '      <ul><li>Retry hourly in history.</li></ul>',
  '    </plan-section>',
  '  </plan-section>',
  '</main>',
].join('\n');

describe('planRmItem', () => {
  it('removes the matching <li> with its whole line', () => {
    const { html, message } = planr.planRmItem(PROSE, 'resolution', { match: 'page ON-CALL' });
    expect(html).not.toContain('Page on-call');
    expect(html).toContain('      <li>Retry hourly.</li>\n      <li>Retry daily');
    expect(message).toBe(`removed <li> "Page on-call." from 'resolution'`);
  });
  it('matches across inline markup the way it renders — no space where <code> sat', () => {
    const html = '<plan-section id="s">\n  <ul>\n    <li>Alerts to <code>ops</code>.</li>\n    <li>Page on-call.</li>\n  </ul>\n</plan-section>';
    const { html: out } = planr.planRmItem(html, 's', { match: 'ops.' });
    expect(out).toBe('<plan-section id="s">\n  <ul>\n    <li>Page on-call.</li>\n  </ul>\n</plan-section>');
  });
  it('removes the innermost item the text belongs to, not its parent', () => {
    const { html } = planr.planRmItem(PROSE, 'resolution', { match: 'backoff' });
    expect(html).toContain('<li>Retry daily<ul></ul></li>');
  });
  it('refuses an ambiguous match with numbered candidates, and takes --nth or --all', () => {
    expect(() => planr.planRmItem(PROSE, 'resolution', { match: 'retry' }))
      .toThrow(/"retry" matches 2 items in 'resolution' — narrow it, pick one with --nth <n>, or pass --all:\n {2}1\. <li> Retry hourly\.\n {2}2\. <li> Retry daily Backoff doubles\./);
    expect(planr.planRmItem(PROSE, 'resolution', { match: 'retry', nth: '2' }).html).not.toContain('Retry daily');
    const both = planr.planRmItem(PROSE, 'resolution', { match: 'retry', all: true });
    expect(both.html).toContain('    <ul>\n      <li>Page on-call.</li>\n    </ul>');
    expect(both.message.split('\n')).toHaveLength(2);
  });
  it('never reaches an item owned by a nested section — address the child for that', () => {
    expect(() => planr.planRmItem(PROSE, 'resolution', { match: 'in history' }))
      .toThrow(/^no item matching "in history" in 'resolution'$/);
    expect(planr.planRmItem(PROSE, 'history', { match: 'in history' }).html).not.toContain('in history');
  });
  it('removes a table row, scoped by --into', () => {
    const { html, message } = planr.planRmItem(RICH, 'map', { match: 'q16', into: 'tbody' });
    expect(html).not.toContain('q16');
    expect(html).toContain('        <tbody>\n          <tr><td>q18 signals</td>');
    expect(message).toBe(`removed <tr> "q16 staging" from 'map' → tbody`);
    expect(planr.planCheck(html).ok).toBe(true);
  });
  it('validates its arguments', () => {
    expect(() => planr.planRmItem(PROSE, '', { match: 'x' })).toThrow(/rm-item requires an address/);
    expect(() => planr.planRmItem(PROSE, 'header', { match: 'x' })).toThrow(/the header holds no body/);
    expect(() => planr.planRmItem(PROSE, 'resolution', {})).toThrow(/rm-item requires --match <text>/);
    expect(() => planr.planRmItem(PROSE, 'resolution', { match: 'retry', nth: 'x' })).toThrow(/--nth expects a 1-based number/);
    expect(() => planr.planRmItem(PROSE, 'resolution', { match: 'retry', nth: '3' })).toThrow(/--nth 3: "retry" matches 2 items/);
    expect(() => planr.planRmItem(PROSE, 'resolution', { match: 'retry', into: 'ol' })).toThrow(/--into 'ol'/);
  });
});

describe('planStrike', () => {
  it('wraps a run that wraps across source lines, matching its decoded text', () => {
    const { html, message } = planr.planStrike(PROSE, 'resolution', { match: 'legacy queue & retry every hour' });
    expect(html).toContain('<p>We keep the <s>legacy queue &amp; retry\n      every hour</s>.</p>');
    expect(message).toBe(`struck "legacy queue & retry every hour" at line 4 of 'resolution'`);
    // The nested section's identical phrase is not the parent's to strike.
    expect(html).toContain('<p>We keep the legacy queue for now.</p>');
  });
  it('accepts an entity in --match as the character it renders', () => {
    expect(planr.planStrike(PROSE, 'resolution', { match: 'queue &amp; retry' }).html)
      .toContain('<s>queue &amp; retry</s>');
  });
  it('refuses an ambiguous run with numbered, located candidates, and takes --nth or --all', () => {
    expect(() => planr.planStrike(PROSE, 'resolution', { match: 'retry' }))
      .toThrow(/"retry" matches 4 text runs in 'resolution' — narrow it, pick one with --nth <n>, or pass --all:\n {2}1\. line 4: We keep the legacy queue & \[retry\]\n {2}2\. line 8: \[Retry\] hourly\.\n {2}3\. line 10: \[Retry\] daily Backoff doubles\.\n {2}4\. line 14: \[RETRY\] = "hourly"/);
    expect(planr.planStrike(PROSE, 'resolution', { match: 'retry', nth: '2' }).html).toContain('<li><s>Retry</s> hourly.</li>');
    // --all refuses the whole write when any one run is unstrikeable (the fourth sits in code).
    expect(() => planr.planStrike(PROSE, 'resolution', { match: 'retry', all: true })).toThrow(/inside <plan-file>/);
    const list = planr.planStrike(PROSE, 'resolution', { match: 'retry', all: true, into: 'ul:1' }).html;
    expect(list.match(/<s>retry<\/s>/gi)).toHaveLength(2);
  });
  it('scopes to an --into container', () => {
    expect(planr.planStrike(PROSE, 'resolution', { match: 'page', into: 'ul:1' }).html).toContain('<li><s>Page</s> on-call.</li>');
  });
  it('refuses a run that crosses an element boundary', () => {
    expect(() => planr.planStrike(PROSE, 'resolution', { match: 'go to ops' }))
      .toThrow(/"go to ops" crosses an element boundary — strike acts on text inside one element; narrow the match \(line 6: /);
  });
  it('refuses a run already struck, and one inside a code component', () => {
    expect(() => planr.planStrike(PROSE, 'resolution', { match: 'old plan' })).toThrow(/"old plan" is already struck/);
    expect(() => planr.planStrike(PROSE, 'resolution', { match: 'RETRY = "hourly"' }))
      .toThrow(/"RETRY = "hourly"" is inside <plan-file>, and markup there corrupts the code/);
  });
  it('validates its arguments', () => {
    expect(() => planr.planStrike(PROSE, 'resolution', {})).toThrow(/strike requires --match <text>/);
    expect(() => planr.planStrike(PROSE, 'resolution', { match: 'nowhere' })).toThrow(/^no text run matching "nowhere" in 'resolution'$/);
    expect(() => planr.planStrike(PROSE, 'resolution', { match: 'retry', nth: '1', all: true })).toThrow(/use only one of --nth \/ --all/);
    expect(() => planr.planStrike(PROSE, 'header', { match: 'x' })).toThrow(/the header holds no body/);
  });
});

describe('planReplace', () => {
  it('replaces a run with --with, spliced verbatim as markup', () => {
    const { html, message } = planr.planReplace(PROSE, 'resolution', null, { match: 'every hour', with: 'every <em>day</em>' });
    expect(html).toContain('retry\n      every <em>day</em>.</p>');
    expect(message).toBe(`replaced "every hour" at line 5 of 'resolution'`);
  });
  it('takes the replacement from a body, dropping its trailing newline', () => {
    const { html } = planr.planReplace(PROSE, 'resolution', 'on-call lead\n', { match: 'on-call' });
    expect(html).toContain('<li>Page on-call lead.</li>');
  });
  it('deletes the run with --with "", and rewrites struck text (the one-element rule is all it enforces)', () => {
    expect(planr.planReplace(PROSE, 'resolution', null, { match: 'old plan', with: '' }).html).toContain('<p><s> retired.</s></p>');
  });
  it('applies --all to every run, code components included', () => {
    const { html } = planr.planReplace(PROSE, 'resolution', null, { match: 'retry', with: 'Resend', all: true });
    expect(html.match(/Resend/g)).toHaveLength(4);
    expect(html).toContain('Resend = &quot;hourly&quot;');
    expect(html).toContain('<li>Retry hourly in history.</li>');   // nested section untouched
  });
  it('refuses a run that crosses an element boundary, and a replacement that breaks the plan', () => {
    expect(() => planr.planReplace(PROSE, 'resolution', null, { match: 'go to ops', with: 'x' }))
      .toThrow(/"go to ops" crosses an element boundary — replace acts on text inside one element/);
    expect(() => planr.planReplace(PROSE, 'resolution', null, { match: 'on-call', with: '<plan-callout>' }))
      .toThrow(/would break the plan/);
  });
  it('validates where the replacement comes from', () => {
    expect(() => planr.planReplace(PROSE, 'resolution', null, { match: 'on-call', with: true }))
      .toThrow(/--with needs a value — pass --with "" to delete the matched text/);
    expect(() => planr.planReplace(PROSE, 'resolution', null, { match: 'on-call', with: 'x', file: 'f.html' }))
      .toThrow(/use only one of --with \/ --file/);
    expect(() => planr.planReplace(PROSE, 'resolution', '\n', { match: 'on-call' }))
      .toThrow(/the replacement is empty — pass --with "" to delete the matched text/);
    expect(() => planr.planReplace(PROSE, 'resolution', 'x', {})).toThrow(/replace requires --match <text>/);
  });
});

describe("planReplace — a replacement never opens a block inside its match's parent", () => {
  const ROWS = (extra = '') => [
    '<plan-header title="T" status="draft"></plan-header>',
    '<main>',
    '  <plan-section id="rows" title="Rows">',
    '    <plan-table><table><tbody>',
    '      <tr><td><a href="some-issue.html"><code>some-issue.html</code></a></td><td>a note</td></tr>',
    '      <tr><td>plain cell</td><td>b</td></tr>',
    '    </tbody></table></plan-table>',
    extra,
    '  </plan-section>',
    '</main>',
  ].join('\n');
  const ROW = '<tr><td><code>other.html</code></td><td>replaced</td></tr>';

  it("refuses a row replacing a filename inside a cell's <code>, naming the inline parent", () => {
    expect(() => planr.planReplace(ROWS(), 'rows', ROW, { match: 'some-issue.html' }))
      .toThrow(/^replace would open <tr> inside <code> — the match sits in <code> \(line 5: \[some-issue\.html\] a note\)[\s\S]*`rm-item --match` then `append --into tbody`[\s\S]*Aborted; no changes written\.$/);
  });
  it('refuses it on a document that already fails check, where assertIntact lets writes through', () => {
    const dirty = ROWS('    <p><code><plan-callout type="info">old damage</plan-callout></code></p>');
    expect(planr.planCheck(dirty).ok).toBe(false);
    expect(() => planr.planReplace(dirty, 'rows', ROW, { match: 'some-issue.html' }))
      .toThrow(/^replace would open <tr> inside <code>/);
  });
  it("refuses a row replacing a cell's own text, naming the cell", () => {
    expect(() => planr.planReplace(ROWS(), 'rows', ROW, { match: 'plain cell' }))
      .toThrow(/^replace would open <tr> inside <td> — the match sits in <td> \(line 6: /);
  });
  it('refuses the whole write under --all when one run of several would misnest', () => {
    const two = ROWS('    <p>See some-issue.html for the history.</p>');
    expect(() => planr.planReplace(two, 'rows', '<plan-callout type="info">moved</plan-callout>', { match: 'some-issue.html', all: true }))
      .toThrow(/^replace would open <plan-callout> inside <code> — the match sits in <code> \(line 5: /);
  });
});

describe("planReplace — a replacement never opens a block inside its match's parent (guards)", () => {
  // Baseline-green: these pass before and after the refusal lands, and pin
  // what it must NOT refuse.
  const ROWS = [
    '<plan-header title="T" status="draft"></plan-header>',
    '<main>',
    '  <plan-section id="rows" title="Rows">',
    '    <plan-table><table><tbody>',
    '      <tr><td><a href="some-issue.html"><code>some-issue.html</code></a></td><td>a note</td></tr>',
    '    </tbody></table></plan-table>',
    '  </plan-section>',
    '</main>',
  ].join('\n');
  it('accepts plain text inside the <code>, inline markup in a cell, and a block component in a cell', () => {
    expect(planr.planReplace(ROWS, 'rows', null, { match: 'some-issue.html', with: 'other.html' }).html)
      .toContain('<code>other.html</code>');
    expect(planr.planReplace(ROWS, 'rows', null, { match: 'a note', with: 'see <code>x</code>' }).html)
      .toContain('<td>see <code>x</code></td>');
    const defs = planr.planReplace(ROWS, 'rows', '<plan-defs><plan-def key="k">v</plan-def></plan-defs>', { match: 'a note' }).html;
    expect(planr.planCheck(defs).ok).toBe(true);
  });
  it("strike and rm-item share the matcher but cannot misnest: <s> is inline, and rm-item removes a whole item", () => {
    const struck = planr.planStrike(ROWS, 'rows', { match: 'some-issue.html' }).html;
    expect(struck).toContain('<code><s>some-issue.html</s></code>');
    expect(planr.planCheck(struck).ok).toBe(true);
    const removed = planr.planRmItem(ROWS, 'rows', { match: 'some-issue.html' }).html;
    expect(removed).not.toContain('some-issue.html');
    expect(planr.planCheck(removed).ok).toBe(true);
  });
});

describe('planRead --text', () => {
  const TEXTY = [
    '<plan-section id="t" title="Scope &amp; Text">',
    '  <p>First   paragraph,',
    '     wrapped &amp; <code>inline</code> &mdash; done &rarr; next.</p>',
    '  <plan-callout type="warn">Mind the <strong>gap</strong>.</plan-callout>',
    '  <ul>',
    '    <li>Outer',
    '      <ul><li>Inner</li></ul>',
    '    </li>',
    '  </ul>',
    '  <plan-file path="app.py">',
    '    if a &lt; b:',
    '        return &quot;x&quot;',
    '  </plan-file>',
    '  <plan-table><table><thead><tr><th>#</th><th>Decision</th></tr></thead>',
    '  <tbody><tr><td>1</td><td>Keep <b>it</b><br>whole</td></tr></tbody></table></plan-table>',
    '  <!-- <p>commented out</p> -->',
    '</plan-section>',
  ].join('\n');
  it('renders one block per line: title, prose, callout, nested list, fenced code, table rows', () => {
    expect(planr.planRead(TEXTY, 't', { text: true })).toBe([
      '## 1. Scope & Text',
      'First paragraph, wrapped & inline — done → next.',
      '[warn] Mind the gap.',
      '- Outer',
      '  - Inner',
      '```app.py',
      '    if a < b:',
      '        return "x"',
      '```',
      '# | Decision',
      '1 | Keep it whole',
      '',
    ].join('\n'));
  });
  it('--body drops the node\'s own title line and keeps the rest', () => {
    const body = planr.planRead(TEXTY, 't', { text: true, body: true });
    expect(body.startsWith('First paragraph, wrapped & inline — done → next.\n')).toBe(true);
    expect(body).not.toContain('## 1.');
  });
  it('includes nested sections under their own numbered titles, and badges by label', () => {
    expect(planr.planRead(RICH, 'map', { text: true })).toBe([
      '## 1. Map',
      '### Decisions so far',
      '- First.',
      '### Tickets',
      'q16 staging | [open]',
      'q18 signals | [open]',
      '',
      '### 1.1. Vocabulary',
      '### Nested heading',
      '- Nested list.',
      '',
    ].join('\n'));
  });
  it('reads a nested section by address, and the header as its title', () => {
    expect(planr.planRead(RICH, 'map.vocab', { text: true })).toBe('### 1.1. Vocabulary\n### Nested heading\n- Nested list.\n');
    expect(planr.planRead(RICH, 'header', { text: true })).toBe('# Map\n');
  });
  it('prints a badge\'s own label when it carries one', () => {
    const html = '<plan-section id="s"><table><tr><td>q1</td><td><plan-badge type="decided">Shipped</plan-badge></td></tr></table></plan-section>';
    expect(planr.planRead(html, 's', { text: true, body: true })).toBe('q1 | [Shipped]\n');
  });
  it('prints the attributes that carry a component\'s content', () => {
    const html = [
      '<plan-section id="c" title="C">',
      '<plan-cards><plan-card label="Cost" value="$780" subtitle="per month"><p>Detail.</p></plan-card></plan-cards>',
      '<plan-tabs><plan-tab label="Summary"><p>Inside.</p></plan-tab></plan-tabs>',
      '<plan-timeline><plan-phase num="1" title="Foundation" weeks="Weeks 1-2"><ul><li>Models</li></ul></plan-phase></plan-timeline>',
      '<plan-formula expr="Total = Sub &times; Rate" note="at checkout"></plan-formula>',
      '<plan-principles><plan-principle label="Idempotent">Safe to retry.</plan-principle></plan-principles>',
      '<plan-diagram caption="Write path">',
      'flowchart LR',
      '  A --&gt; B',
      '</plan-diagram>',
      '</plan-section>',
    ].join('\n');
    expect(planr.planRead(html, 'c', { text: true, body: true })).toBe([
      'Cost: $780', 'per month', 'Detail.', '[Summary]', 'Inside.', 'Foundation (Weeks 1-2)', '- Models',
      'Total = Sub × Rate — at checkout', 'Idempotent: Safe to retry.',
      '```mermaid', 'flowchart LR', '  A --> B', '```', 'Write path', '',
    ].join('\n'));
    const header = '<plan-header title="Plan" subtitle="What it covers"></plan-header>';
    expect(planr.planRead(header, 'header', { text: true })).toBe('# Plan\nWhat it covers\n');
  });
  it('prints only the title line for an empty section, and nothing for its empty body', () => {
    const empty = '<plan-section id="e" title="Empty"></plan-section>';
    expect(planr.planRead(empty, 'e', { text: true })).toBe('## 1. Empty\n');
    expect(planr.planRead(empty, 'e', { text: true, body: true })).toBe('');
  });
});

describe('<plan-defs> component', () => {
  it('is registered in the runtime, and PLAN_TAGS matches the runtime registry', () => {
    const map = /const components = \{([\s\S]*?)\};/.exec(skillFile('plan-runtime.js'))[1];
    const registered = [...map.matchAll(/'(plan-[a-z-]+)'\s*:/g)].map(m => m[1]);
    expect(registered).toEqual(expect.arrayContaining(['plan-defs', 'plan-def']));
    expect([...registered].sort()).toEqual([...planr.PLAN_TAGS].sort());
  });
  it('passes check standalone and inside a table cell', () => {
    const { ok, report } = planr.planCheck(DEFS_DOC);
    expect(ok, report).toBe(true);
    expect(report).toContain('plan-def 2, plan-defs 2');
  });
  it('reads as text: one `key: value` line per pair, and pairs joined by `; ` inside a table cell', () => {
    // The key lives only in an attribute, so the text rule has to print it.
    const html = [
      '<plan-section id="d" title="D">',
      '  <plan-defs>',
      '    <plan-def key="country_code">CharField(max_length=2), <code>ISO</code> alpha-2</plan-def>',
      '    <plan-def key="tier">CharField(max_length=10)</plan-def>',
      '  </plan-defs>',
      '  <plan-table><table><tbody>',
      '    <tr><td>Default limits</td><td><plan-defs><plan-def key="Enterprise">500/day</plan-def><plan-def key="Professional">100/day</plan-def></plan-defs></td></tr>',
      '  </tbody></table></plan-table>',
      '</plan-section>',
    ].join('\n');
    expect(planr.planRead(html, 'd', { text: true, body: true })).toBe([
      'country_code: CharField(max_length=2), ISO alpha-2',
      'tier: CharField(max_length=10)',
      'Default limits | Enterprise: 500/day; Professional: 100/day',
      '',
    ].join('\n'));
  });
  it('is styled as a compact block, per row, and chromeless inside a table cell', () => {
    const css = skillFile('plan-styles.css');
    expect(css).toMatch(/^plan-defs\s*\{[^}]*display:\s*table;/m);
    expect(css).toMatch(/^plan-def\s*\{[^}]*display:\s*table-row;/m);
    expect(css).toMatch(/^plan-def::before\s*\{[^}]*content:\s*attr\(key\);/m);
    expect(css).toMatch(/^plan-table td plan-defs\s*\{[^}]*border:\s*none;/m);
  });
  it('is demonstrated in the sample plan, standalone and inside a table cell', () => {
    const sample = skillFile('examples/sample-plan.html');
    const all = (tag) => planr.findElementsDeep(sample, tag, 0, sample.length);
    const cells = all('td');
    const inCell = (d) => cells.some(td => td.innerStart <= d.outerStart && d.outerEnd <= td.innerEnd);
    const defs = all('plan-defs');
    expect(defs.filter(d => !inCell(d)).length).toBeGreaterThan(0);
    expect(defs.filter(inCell).length).toBeGreaterThan(0);
  });
  it('is documented in SKILL.md, and replaces the nested-table workaround', () => {
    const skill = skillFile('SKILL.md');
    expect(skill).toContain('#### `<plan-defs>` / `<plan-def>`');
    expect(skill).toContain('--into plan-defs');
    expect(skill).not.toMatch(/bold(ed)? leads/);
  });
});

describe('planTemplateIndex', () => {
  it('merges skill and consumer listings into one sorted index, marking origin', () => {
    expect(planr.planTemplateIndex({
      skill: ['_shell.html', 'basic.html', 'tdd.html'],
      consumer: ['map.html', 'notes.txt', '_draft.html'],
      consumerDir: '/r/.claude/planr-templates',
    })).toEqual([
      { name: 'basic', origin: 'skill', shadows: false },
      { name: 'map', origin: 'consumer', shadows: false },
      { name: 'tdd', origin: 'skill', shadows: false },
    ]);
  });
  it('lets a consumer template shadow the skill template of the same name, and records it', () => {
    expect(planr.planTemplateIndex({ skill: ['tdd.html'], consumer: ['tdd.html'], consumerDir: '/r' }))
      .toEqual([{ name: 'tdd', origin: 'consumer', shadows: true }]);
  });
  it('is the skill listing alone when there is no consumer directory', () => {
    expect(planr.planTemplateIndex({ skill: ['basic.html'], consumer: null, consumerDir: null }))
      .toEqual([{ name: 'basic', origin: 'skill', shadows: false }]);
  });
  it('refuses a consumer _shell.html — the shell is skill-owned', () => {
    expect(() => planr.planTemplateIndex({
      skill: ['basic.html'], consumer: ['_shell.html'], consumerDir: '/r/.claude/planr-templates',
    })).toThrow(/\/r\/\.claude\/planr-templates\/_shell\.html: the shell is skill-owned/);
  });
});

describe('<plan-meta> component', () => {
  it('is registered in the runtime, and PLAN_TAGS matches the runtime registry', () => {
    const map = /const components = \{([\s\S]*?)\};/.exec(skillFile('plan-runtime.js'))[1];
    const registered = [...map.matchAll(/'(plan-[a-z-]+)'\s*:/g)].map(m => m[1]);
    expect(registered).toEqual(expect.arrayContaining(['plan-meta', 'plan-field']));
    expect([...registered].sort()).toEqual([...planr.PLAN_TAGS].sort());
  });

  it('is a store the page never shows: the block is hidden, and the header styles its chips', () => {
    const css = skillFile('plan-styles.css');
    expect(css).toMatch(/^plan-meta\s*\{\s*display:\s*none;\s*\}/m);
    expect(css).not.toMatch(/^plan-field(::before)?\s*\{/m);
    expect(css).toMatch(/^\.meta-field \.meta-value\s*\{[^}]*text-overflow:\s*ellipsis;/m);
    // The store runs no JS of its own: PlanHeader renders the fields.
    expect(skillFile('plan-runtime.js')).toMatch(/class PlanMeta extends HTMLElement \{\}/);
    expect(skillFile('plan-runtime.js')).toMatch(/class PlanField extends HTMLElement \{\}/);
    expect(skillFile('plan-runtime.js')).toMatch(/class PlanHeader[\s\S]*?\$\{_metaChips\(\)\}/);
  });

  it('reads as text: one `key: value` line per field', () => {
    const html = [
      '<plan-section id="d" title="D">',
      '  <plan-meta>',
      '    <plan-field key="type">issue</plan-field>',
      '    <plan-field key="area">crm, celery</plan-field>',
      '  </plan-meta>',
      '</plan-section>',
    ].join('\n');
    expect(planr.planRead(html, 'd', { text: true, body: true }))
      .toBe('type: issue\narea: crm, celery\n');
  });

  it('passes check, and an unregistered sibling tag does not', () => {
    const doc = '<main><plan-meta><plan-field key="type">doc</plan-field></plan-meta></main>';
    const { ok, report } = planr.planCheck(doc);
    expect(ok, report).toBe(true);
    expect(report).toContain('plan-field 1, plan-meta 1');
    expect(planr.planCheck('<plan-metadata></plan-metadata>').report)
      .toContain('unknown component <plan-metadata>');
  });

  it('is demonstrated in the sample plan and documented in SKILL.md', () => {
    const sample = skillFile('examples/sample-plan.html');
    expect(planr.findElementsDeep(sample, 'plan-meta', 0, sample.length).length).toBe(1);
    expect(planr.findElementsDeep(sample, 'plan-field', 0, sample.length).length).toBeGreaterThan(1);
    expect(skillFile('SKILL.md')).toContain('#### `<plan-meta>` / `<plan-field>`');
  });
});

describe('parseSchema', () => {
  const S = (o) => planr.parseSchema(o, 'probe.json');

  it('normalises a field table, and `list` becomes a repeatable string', () => {
    const s = S({ fields: { area: { type: 'list' }, owner: { type: 'string' } } });
    expect(s.fields.area).toMatchObject({ type: 'list', repeatable: true, origin: 'probe.json' });
    expect(s.fields.owner.repeatable).toBe(false);
  });

  it('refuses every malformed shape, naming the origin file', () => {
    expect(() => S({ feilds: {} })).toThrow(/probe\.json: unknown key 'feilds' — valid: fields, infer, defaults, rankings/);
    expect(() => S({ fields: { p: { type: 'enumm' } } })).toThrow(/type 'enumm' — valid: enum, string, list, path, date, number/);
    expect(() => S({ fields: { p: { type: 'enum' } } })).toThrow(/an enum declares a non-empty `values` array/);
    expect(() => S({ fields: { p: { type: 'enum', values: ['a', 'a'] } } })).toThrow(/enum values must be unique/);
    expect(() => S({ fields: { p: { type: 'string', values: ['a'] } } })).toThrow(/`values` applies only to type enum/);
    expect(() => S({ fields: { p: { type: 'number', min: 5, max: 1 } } })).toThrow(/min 5 is greater than max 1/);
    expect(() => S({ fields: { p: { type: 'string', min: 1 } } })).toThrow(/`min` applies only to type number/);
    expect(() => S({ fields: { p: { type: 'string', frobnicate: 1 } } })).toThrow(/unknown key 'frobnicate'/);
    expect(() => S({ fields: { p: { type: 'string', from: 'header:nope' } } })).toThrow(/`from` must be header:/);
    expect(() => S({ fields: { Priority: { type: 'string' } } })).toThrow(/must be lower-case letters, digits and hyphens/);
    expect(() => S({ fields: { p: { type: 'string' } }, infer: [{ match: '[', set: { p: 'x' } }] }))
      .toThrow(/infer\[0\]: `match` is not a valid regular expression/);
    expect(() => S({ fields: {}, rankings: { r: { order: 'priority' } } }))
      .toThrow(/ranking 'r': `order` must be an array/);
    expect(() => S('nope')).toThrow(/probe\.json: must be a JSON object/);
  });
});

describe('parseSchema — tones and hidden', () => {
  const S = (o) => planr.parseSchema(o, 'probe.json');
  const P = (extra) => ({ fields: { priority: { type: 'enum', values: ['p0', 'p1', 'p2'], ...extra } } });

  it('accepts a tone per declared value — a partial map included — and a hidden flag', () => {
    const s = S({ fields: {
      priority: { type: 'enum', values: ['p0', 'p1', 'p2'], tones: { p0: 'danger', p1: 'warn' } },
      area:     { type: 'list', hidden: true },
    } });
    expect(s.fields.priority.tones).toEqual({ p0: 'danger', p1: 'warn' });
    expect(s.fields.area.hidden).toBe(true);
    expect(() => planr.mergeSchemas(s)).not.toThrow();
  });

  it('refuses an unknown tone, a tone for an undeclared value, and tones off a single-valued enum', () => {
    expect(() => S(P({ tones: { p0: 'pink' } })))
      .toThrow(/probe\.json: field 'priority': tone 'pink' for 'p0' is not a tone — valid: danger, warn, info, ok, final, muted/);
    expect(() => S(P({ tones: { p9: 'danger' } })))
      .toThrow(/field 'priority': `tones` names 'p9', which is not a declared value — declared: p0, p1, p2/);
    expect(() => S({ fields: { owner: { type: 'string', tones: { a: 'ok' } } } }))
      .toThrow(/field 'owner': `tones` applies only to type enum/);
    expect(() => S(P({ tones: ['danger'] }))).toThrow(/field 'priority': `tones` must be an object of value → tone/);
    expect(() => S(P({ repeatable: true, tones: { p0: 'ok' } })))
      .toThrow(/field 'priority': `tones` needs a single-valued field — a repeatable one has no single tone/);
  });

  it('refuses a non-boolean hidden, and either key on a header-owned field', () => {
    expect(() => S(P({ hidden: 'yes' }))).toThrow(/field 'priority': `hidden` must be true or false/);
    expect(() => S({ fields: { status: {
      type: 'enum', values: ['draft'], from: 'header:status', tones: { draft: 'warn' } } } }))
      .toThrow(/field 'status': `tones` and `hidden` do not apply to a header field — the header renders it in its own chip/);
    expect(() => S({ fields: { title: { type: 'string', from: 'header:title', hidden: true } } }))
      .toThrow(/field 'title': `tones` and `hidden` do not apply to a header field/);
  });
});

describe('mergeSchemas', () => {
  const core = () => planr.parseSchema({
    fields: { type: { type: 'enum', values: ['doc', 'issue'] }, owner: { type: 'string' } },
    infer: [{ match: '/issues/', set: { type: 'issue' } }],
    defaults: { type: 'doc' },
  }, 'core.json');

  it('replaces a field outright, prepends consumer infer rules, and merges defaults', () => {
    const consumer = planr.parseSchema({
      fields: { type: { type: 'enum', values: ['doc', 'issue', 'tdd'] }, priority: { type: 'enum', values: ['p0', 'p1'] } },
      infer: [{ match: '/tdds/', set: { type: 'tdd' } }],
      defaults: { priority: 'p1' },
    }, 'consumer.json');
    const m = planr.mergeSchemas(core(), consumer);
    expect(m.fields.type.values).toEqual(['doc', 'issue', 'tdd']);   // replaced, not merged
    expect(m.fields.type.origin).toBe('consumer.json');
    expect(m.fields.owner.origin).toBe('core.json');                  // core survives
    expect(Object.keys(m.fields)).toEqual(['type', 'owner', 'priority']); // core order, consumer appended
    expect(m.infer.map(r => r.match)).toEqual(['/tdds/', '/issues/']); // consumer first
    expect(m.defaults).toEqual({ type: 'doc', priority: 'p1' });
  });

  it('validates cross-references only after merging, and names the file at fault', () => {
    // A consumer default naming a CORE field is legal — the per-file pass cannot know that.
    expect(() => planr.mergeSchemas(core(), planr.parseSchema({ defaults: { owner: 'hayden' } }, 'consumer.json'))).not.toThrow();
    expect(() => planr.mergeSchemas(core(), planr.parseSchema({ defaults: { nope: 'x' } }, 'consumer.json')))
      .toThrow(/consumer\.json: default for 'nope' names unknown field 'nope'/);
    expect(() => planr.mergeSchemas(core(), planr.parseSchema({ rankings: { r: { order: ['nope'] } } }, 'consumer.json')))
      .toThrow(/consumer\.json: ranking 'r' order names unknown field 'nope'/);
    expect(() => planr.mergeSchemas(core(), planr.parseSchema({ rankings: { r: { order: ['owner:sideways'] } } }, 'consumer.json')))
      .toThrow(/direction must be asc or desc/);
    expect(() => planr.mergeSchemas(core(), planr.parseSchema({ defaults: { type: 'nonsense' } }, 'consumer.json')))
      .toThrow(/consumer\.json: default for 'type': .*'nonsense' is not a declared value/);
  });
});

describe('validateField / fieldValue / fieldRank', () => {
  // Deferred: `planr` is only assigned in the top-level beforeAll, which runs
  // AFTER this describe body is collected — an immediate call here would see
  // `planr` still undefined.
  const schema = () => planr.parseSchema({
    fields: {
      priority: { type: 'enum', values: ['p0', 'p1', 'p2'] },
      points:   { type: 'number', min: 0, max: 21 },
      when:     { type: 'date' },
      area:     { type: 'list' },
      link:     { type: 'path', repeatable: true },
      note:     { type: 'string' },
    },
  }, 'probe.json');
  const bad = (k, v) => planr.validateField(schema(), k, v);

  it('accepts a well-formed value of every type', () => {
    for (const [k, v] of [['priority', 'p1'], ['points', '13'], ['when', '2026-09-23'],
                          ['area', 'crm, celery'], ['link', 'a.html,b.html'], ['note', 'anything']])
      expect(bad(k, v), `${k}=${v}`).toBeNull();
  });

  it('refuses an unknown field, an out-of-enum value, a bad number, date and path, and an empty value', () => {
    expect(bad('severity', 'high')).toMatch(/unknown field 'severity' — declared: priority, points, when, area, link, note/);
    expect(bad('priority', 'urgent')).toMatch(/'urgent' is not a declared value — valid: p0, p1, p2/);
    expect(bad('points', 'lots')).toMatch(/'lots' is not a number/);
    expect(bad('points', '99')).toMatch(/99 is above the declared maximum 21/);
    expect(bad('points', '-1')).toMatch(/-1 is below the declared minimum 0/);
    expect(bad('when', 'yesterday')).toMatch(/is not a YYYY-MM-DD date/);
    expect(bad('link', 'my file.html')).toMatch(/is not a usable path/);
    expect(bad('note', '   ')).toMatch(/empty value/);
    expect(bad('area', 'crm,,celery')).toMatch(/empty value/);   // an empty item is an empty value
  });

  it('normalises a repeatable field to an array and a number to a Number', () => {
    expect(planr.fieldValue(schema().fields.area, ' crm , celery ')).toEqual(['crm', 'celery']);
    expect(planr.fieldValue(schema().fields.points, ' 13 ')).toBe(13);
    expect(planr.fieldValue(schema().fields.note, ' hi ')).toBe('hi');
  });

  it('ranks by DECLARED enum order, numerically, and not at all for a repeatable field', () => {
    expect(planr.fieldRank(schema().fields.priority, 'p0')).toBe(0);
    expect(planr.fieldRank(schema().fields.priority, 'p2')).toBe(2);
    expect(planr.fieldRank(schema().fields.priority, 'nope')).toBeNull();
    expect(planr.fieldRank(schema().fields.points, '13')).toBe(13);
    expect(planr.fieldRank(schema().fields.when, '2026-09-23')).toBe('2026-09-23');
    expect(planr.fieldRank(schema().fields.note, 'Beta')).toBe('beta');
    expect(planr.fieldRank(schema().fields.area, 'crm, celery')).toBeNull();
    expect(planr.fieldRank(schema().fields.note, '')).toBeNull();
  });
});

describe('the shipped core schema', () => {
  const core = () => planr.parseSchema(JSON.parse(skillFile('planr-schema.json')), 'core');

  it('parses, and merges with nothing', () => {
    expect(() => planr.mergeSchemas(core(), null)).not.toThrow();
  });

  it('declares the header-backed fields and keeps status in step with HEADER_STATUS', () => {
    const s = core();
    expect(s.fields.title.from).toBe('header:title');
    expect(s.fields.status.from).toBe('header:status');
    expect(s.fields.date.from).toBe('header:date');
    // Drift here means a status `planr set` accepts is one the schema refuses.
    expect(s.fields.status.values).toEqual([...planr.HEADER_STATUS]);
  });

  it('infers a type from the path segments the corpus actually uses', () => {
    const hits = (p) => core().infer.filter(r => r.re.test(p)).map(r => r.set.type);
    expect(hits('.claude/plans/issues/foo.html')).toContain('issue');
    expect(hits('.claude/plans/features/x/tdds/m1.html')).toContain('tdd');
    expect(hits('.claude/plans/prd-thing.html')).toContain('prd');
    expect(hits('.claude/plans/notes/whatever.html')).toEqual([]);
  });
});

describe('resolveMeta', () => {
  // Deferred: `planr` is only assigned in the top-level beforeAll, which runs
  // AFTER this describe body is collected.
  const schema = () => planr.mergeSchemas(planr.parseSchema({
    fields: {
      title:  { type: 'string', from: 'header:title' },
      type:   { type: 'enum', values: ['doc', 'issue'] },
      status: { type: 'enum', values: ['draft', 'review'], from: 'header:status' },
      owner:  { type: 'string' },
      area:   { type: 'list' },
    },
    infer: [{ match: '/issues/', set: { type: 'issue' } }],
    defaults: { owner: 'unassigned' },
  }, 'probe.json'));
  const doc = (body) => [
    '<plan-header title="Quota cache" status="review"></plan-header>',
    '<main>',
    body,
    '</main>',
  ].join('\n');

  it('reads every source, and reports which one each value came from', () => {
    const html = doc('  <plan-meta>\n    <plan-field key="area">crm, celery</plan-field>\n  </plan-meta>');
    const rec = planr.resolveMeta(html, { schema: schema(), docPath: 'plans/issues/foo.html' });
    expect(rec.path).toBe('plans/issues/foo.html');
    expect(rec.fields.area).toMatchObject({ value: ['crm', 'celery'], source: 'meta', type: 'list', rank: null });
    expect(rec.fields.title).toMatchObject({ value: 'Quota cache', source: 'header' });
    expect(rec.fields.status).toMatchObject({ value: 'review', source: 'header', rank: 1 });
    expect(rec.fields.type).toMatchObject({ value: 'issue', source: 'path' });
    expect(rec.fields.owner).toMatchObject({ value: 'unassigned', source: 'default' });
  });

  it('applies the sources in C1 order — the block beats the header, the header beats the path', () => {
    const html = doc('  <plan-meta>\n    <plan-field key="status">draft</plan-field>\n' +
                     '    <plan-field key="type">doc</plan-field>\n  </plan-meta>');
    const rec = planr.resolveMeta(html, { schema: schema(), docPath: 'plans/issues/foo.html' });
    expect(rec.fields.status).toMatchObject({ value: 'draft', source: 'meta' });  // not 'review' from the header
    expect(rec.fields.type).toMatchObject({ value: 'doc', source: 'meta' });      // not 'issue' from the path
  });

  it('returns EVERY schema field, in schema-declaration order, with a null record for an unset one', () => {
    const rec = planr.resolveMeta(doc('  <p>No metadata at all.</p>'), { schema: schema(), docPath: null });
    expect(Object.keys(rec.fields)).toEqual(['title', 'type', 'status', 'owner', 'area']);
    expect(rec.fields.area).toEqual({ value: null, raw: null, source: null, type: 'list', rank: null });
    expect(rec.fields.title.source).toBe('header');   // a document with no block is still queryable
  });

  it('collects an unknown field and a duplicate key without throwing', () => {
    const html = doc('  <plan-meta>\n    <plan-field key="owner">hayden</plan-field>\n' +
                     '    <plan-field key="owner">someone</plan-field>\n' +
                     '    <plan-field key="severity">high</plan-field>\n' +
                     '    <plan-field key="type">nonsense</plan-field>\n  </plan-meta>');
    const rec = planr.resolveMeta(html, { schema: schema(), docPath: null });
    expect(rec.fields.owner).toMatchObject({ value: 'hayden', source: 'meta' });   // the first one wins
    expect(rec.unknown).toEqual([{ key: 'severity', value: 'high', line: 6 }]);
    expect(rec.problems.map(p => p.text)).toEqual([
      expect.stringMatching(/duplicate field 'owner'/),
      expect.stringMatching(/'nonsense' is not a declared value/),
    ]);
    expect(rec.fields.type.source).toBeNull();   // a refused value resolves to nothing, never to the bad text
  });

  it('collapses whitespace in a value and decodes entities in a key and a header fallback', () => {
    const html = [
      '<plan-header title="Scope &amp; limits"></plan-header>',
      '<main><plan-meta><plan-field key="area">crm,\n      celery</plan-field></plan-meta></main>',
    ].join('\n');
    const rec = planr.resolveMeta(html, { schema: schema(), docPath: null });
    expect(rec.fields.area.value).toEqual(['crm', 'celery']);
    expect(rec.fields.title.value).toBe('Scope & limits');
  });
});

describe('planMeta', () => {
  const schema = () => planr.mergeSchemas(planr.parseSchema({
    fields: { type: { type: 'enum', values: ['doc', 'issue'] }, owner: { type: 'string' }, area: { type: 'list' } },
    defaults: { type: 'doc' },
  }, 'probe.json'));
  const html = '<plan-header title="T"></plan-header>\n<main>\n  <plan-meta>\n' +
               '    <plan-field key="owner">hayden</plan-field>\n  </plan-meta>\n</main>';

  it('prints one aligned line per resolved field with its source, then the unset ones and the schema', () => {
    expect(planr.planMeta(html, { schema: schema(), docPath: 'a.html', schemaSources: ['core.json'] })).toBe([
      'type   doc     (default)',
      'owner  hayden  (meta)',
      '',
      'unset: area',
      '',
      'schema: core.json',
      '',
    ].join('\n'));
  });

  it('emits the resolveMeta record verbatim under --format json, plus the schema sources', () => {
    const out = JSON.parse(planr.planMeta(html, { schema: schema(), docPath: 'a.html', schemaSources: ['core.json'], format: 'json' }));
    expect(out).toMatchObject({ path: 'a.html', schema: ['core.json'], unknown: [], problems: [] });
    expect(out.fields.owner).toEqual({ value: 'hayden', raw: 'hayden', source: 'meta', type: 'string', rank: 'hayden' });
    expect(Object.keys(out.fields)).toEqual(['type', 'owner', 'area']);
  });

  it('lists unknown fields and problems, and refuses an unknown format', () => {
    const messy = html.replace('</plan-meta>', '  <plan-field key="nope">x</plan-field>\n  </plan-meta>');
    const out = planr.planMeta(messy, { schema: schema(), docPath: null, schemaSources: [] });
    expect(out).toContain('Unknown fields (not in the schema, so not queryable):');
    expect(out).toMatch(/nope = x/);
    expect(() => planr.planMeta(html, { schema: schema(), format: 'yaml' })).toThrow(/unknown --format 'yaml' — valid: text, json/);
  });

  it('says so when a document resolves no metadata at all', () => {
    const empty = planr.mergeSchemas(planr.parseSchema({ fields: { owner: { type: 'string' } } }, 'probe.json'));
    expect(planr.planMeta('<main></main>', { schema: empty })).toContain('(no metadata resolves for this document)');
  });
});

describe('planMetaSet', () => {
  const schema = () => planr.mergeSchemas(planr.parseSchema({
    fields: {
      type:     { type: 'enum', values: ['doc', 'issue'] },
      priority: { type: 'enum', values: ['p0', 'p1', 'p2'] },
      owner:    { type: 'string' },
      area:     { type: 'list' },
    },
  }, 'probe.json'));
  const BARE = ['<plan-header title="T"></plan-header>', '<main>', '',
                '  <plan-section id="a" title="A"><p>Body.</p></plan-section>', '', '</main>'].join('\n');
  const set = (html, sets, unsets = []) => planr.planMetaSet(html, { schema: schema(), sets, unsets });

  it('creates the block as the first element inside <main>, in schema-declaration order', () => {
    const { html, message } = set(BARE, ['owner=hayden', 'type=issue']);
    expect(message).toContain('created <plan-meta>');
    expect(html).toContain([
      '<main>',
      '  <plan-meta>',
      '    <plan-field key="type">issue</plan-field>',      // schema order, not argument order
      '    <plan-field key="owner">hayden</plan-field>',
      '  </plan-meta>',
    ].join('\n'));
    expect(planr.planCheck(html).ok).toBe(true);
  });

  it('updates a field in place and keeps the existing field order', () => {
    const once = set(BARE, ['owner=hayden', 'type=issue']).html;
    const { html, message } = planr.planMetaSet(once, { schema: schema(), sets: ['owner=someone', 'priority=p1'] });
    expect(message).toMatch(/set owner = "someone"/);
    expect(message).toMatch(/added priority = "p1"/);
    expect(message).not.toContain('created');
    expect([...html.matchAll(/key="([a-z-]+)"/g)].map(m => m[1])).toEqual(['type', 'owner', 'priority']);
    expect(planr.resolveMeta(html, { schema: schema() }).fields.owner.value).toBe('someone');
    expect(planr.planCheck(html).ok).toBe(true);
  });

  it('refuses an unknown field, a bad value, an empty value, and a key both set and unset', () => {
    expect(() => set(BARE, ['severity=high'])).toThrow(/unknown field 'severity'/);
    expect(() => set(BARE, ['priority=urgent'])).toThrow(/'urgent' is not a declared value/);
    expect(() => set(BARE, ['owner='])).toThrow(/--set owner= has no value — use `--unset owner`/);
    expect(() => set(BARE, ['nope'])).toThrow(/--set expects key=value/);
    expect(() => set(BARE, [])).toThrow(/expects --set <key>=<value> or --unset <key>/);
    const once = set(BARE, ['owner=hayden']).html;
    expect(() => planr.planMetaSet(once, { schema: schema(), sets: ['owner=x'], unsets: ['owner'] }))
      .toThrow(/'owner' is both --set and --unset/);
  });

  it('refuses to write ANY field when one of them is bad', () => {
    expect(() => set(BARE, ['owner=hayden', 'priority=urgent'])).toThrow(/'urgent' is not a declared value/);
    // the good one must not have been written on the way to refusing the bad one
    expect(set(BARE, ['owner=hayden']).html).not.toContain('urgent');
  });

  it('unsets a field, refuses one that is not there, and removes the block with the last field', () => {
    const two = set(BARE, ['owner=hayden', 'type=issue']).html;
    expect(() => planr.planMetaSet(two, { schema: schema(), unsets: ['priority'] }))
      .toThrow(/'priority' is not in this document's <plan-meta> — nothing to unset/);
    const one = planr.planMetaSet(two, { schema: schema(), unsets: ['owner'] }).html;
    expect(one).not.toContain('key="owner"');
    const gone = planr.planMetaSet(one, { schema: schema(), unsets: ['type'] });
    expect(gone.message).toContain('removed <plan-meta> — no fields left');
    expect(gone.html).not.toContain('plan-meta');
    expect(planr.planCheck(gone.html).ok).toBe(true);
  });

  it('refuses a document with no <main> rather than guessing a position', () => {
    expect(() => set('<plan-header title="T"></plan-header>', ['owner=hayden']))
      .toThrow(/no <main>/);
  });

  describe('field values are escaped on disk and decoded on read', () => {
    const SRC = 'From: a <b> & c';
    it('writes & < > as entities, so the value is never live markup', () => {
      const { html } = set(BARE, [`owner=${SRC}`]);
      expect(html).toContain('<plan-field key="owner">From: a &lt;b&gt; &amp; c</plan-field>');
      expect(html).not.toContain('<b>');
      expect(planr.planCheck(html, schema()).warnings).toEqual([]);
    });

    it('round-trips the exact original string through resolveMeta', () => {
      const { html } = set(BARE, [`owner=${SRC}`]);
      const rec = planr.resolveMeta(html, { schema: schema() });
      expect(rec.fields.owner.value).toBe(SRC);
      expect(rec.fields.owner.raw).toBe(SRC);
    });

    it('does not double-escape when a later --set rebuilds the block', () => {
      const first = set(BARE, [`owner=${SRC}`]).html;
      const { html } = set(first, ['type=issue']);
      expect(html).toContain('From: a &lt;b&gt; &amp; c</plan-field>');
      expect(planr.resolveMeta(html, { schema: schema() }).fields.owner.value).toBe(SRC);
    });

    it('keeps a literal entity-looking value literal', () => {
      const { html } = set(BARE, ['owner=a &amp; b']);
      expect(planr.resolveMeta(html, { schema: schema() }).fields.owner.value).toBe('a &amp; b');
    });

    it('lint warns on a raw `<` already on disk in a field value', () => {
      const doc = ['<plan-header title="T"></plan-header>', '<main>', '  <plan-meta>',
        '    <plan-field key="owner">a <b>x</b></plan-field>', '  </plan-meta>', '</main>'].join('\n');
      const { ok, warnings } = planr.planCheck(doc, schema());
      expect(ok).toBe(true);
      expect(warnings.map(w => w.text).join('\n')).toMatch(/<plan-field key="owner">.*raw `<`/);
    });
  });
});

describe('planMetaSet — header-owned fields (C9)', () => {
  const schema = () => planr.mergeSchemas(planr.parseSchema({
    fields: {
      title:  { type: 'string', from: 'header:title' },
      status: { type: 'enum', values: ['draft', 'review'], from: 'header:status' },
      date:   { type: 'date', from: 'header:date' },
      owner:  { type: 'string' },
    },
  }, 'probe.json'));
  const BARE = ['<plan-header title="T" status="draft"></plan-header>', '<main>', '',
                '  <plan-section id="a" title="A"></plan-section>', '', '</main>'].join('\n');

  it('refuses to --set one, naming the real writer, for every header-backed field', () => {
    for (const [key, attr] of [['title', 'title'], ['status', 'status'], ['date', 'date']])
      expect(() => planr.planMetaSet(BARE, { schema: schema(), sets: [`${key}=x`] }), key)
        .toThrow(`'${key}' is a header field — use \`planr set <file> header.${attr}=…\``);
  });

  it('refuses to --unset one that is not there, with the same message rather than "nothing to unset"', () => {
    expect(() => planr.planMetaSet(BARE, { schema: schema(), unsets: ['status'] }))
      .toThrow(/'status' is a header field/);
  });

  it('DOES --unset one that a hand edit put there — that is the lint\'s remedy', () => {
    const hand = BARE.replace('<main>', '<main>\n  <plan-meta>\n' +
      '    <plan-field key="status">review</plan-field>\n' +
      '    <plan-field key="owner">h</plan-field>\n  </plan-meta>');
    const { html, message } = planr.planMetaSet(hand, { schema: schema(), unsets: ['status'] });
    expect(message).toContain('unset status');
    expect(html).not.toContain('key="status"');
    expect(planr.planCheck(html, schema()).warnings).toEqual([]);
  });

  it('leaves an ordinary field writable', () => {
    expect(planr.planMetaSet(BARE, { schema: schema(), sets: ['owner=hayden'] }).message).toContain('added owner');
  });

  it('does not change resolveMeta — the C1 order stands', () => {
    const hand = BARE.replace('<main>', '<main><plan-meta><plan-field key="status">review</plan-field></plan-meta>');
    expect(planr.resolveMeta(hand, { schema: schema() }).fields.status)
      .toMatchObject({ value: 'review', source: 'meta' });
  });
});

describe('planCheck warnings — metadata', () => {
  const schema = () => planr.mergeSchemas(planr.parseSchema({
    fields: { type: { type: 'enum', values: ['doc', 'issue'] }, when: { type: 'date' }, owner: { type: 'string' } },
  }, 'probe.json'));
  const wrap = (body) => `<plan-header title="T"></plan-header>\n<main>\n${body}\n</main>`;
  const warn = (body) => planr.planCheck(wrap(body), schema()).warnings;

  it('is silent on a well-formed block', () => {
    expect(warn('  <plan-meta>\n    <plan-field key="type">issue</plan-field>\n  </plan-meta>')).toEqual([]);
    // A comment is not an element, so the block is still "first". Use a RULE-LINE
    // comment: a comment carrying text at the top of <main> is a scaffold banner,
    // which lintScaffoldBanner already warns about for its own reasons.
    expect(warn('  <!-- ═══════════════ -->\n  <plan-meta>\n    <plan-field key="type">doc</plan-field>\n  </plan-meta>')).toEqual([]);
  });

  it('warns on an unknown field, a bad value, a duplicate key and a keyless field — never failing the structure', () => {
    const { ok, warnings } = planr.planCheck(wrap([
      '  <plan-meta>',
      '    <plan-field key="type">issue</plan-field>',
      '    <plan-field key="type">doc</plan-field>',
      '    <plan-field key="severity">high</plan-field>',
      '    <plan-field key="when">yesterday</plan-field>',
      '    <plan-field>orphan</plan-field>',
      '  </plan-meta>',
    ].join('\n')), schema());
    expect(ok).toBe(true);
    expect(warnings.map(w => [w.line, w.text])).toEqual([
      [5, expect.stringMatching(/duplicate field 'type' — only the first is read/)],
      [6, expect.stringMatching(/unknown field 'severity'/)],
      [7, expect.stringMatching(/'yesterday' is not a YYYY-MM-DD date/)],
      [8, expect.stringMatching(/<plan-field> has no `key` attribute/)],
    ]);
  });

  it('warns when the block is misplaced, doubled, or a field sits outside one', () => {
    const misplaced = warn('  <plan-section id="a" title="A"></plan-section>\n' +
                           '  <plan-meta><plan-field key="type">doc</plan-field></plan-meta>');
    expect(misplaced).toHaveLength(1);
    expect(misplaced[0].text).toMatch(/is not the first element inside <main>/);

    const doubled = warn('  <plan-meta><plan-field key="type">doc</plan-field></plan-meta>\n' +
                         '  <plan-meta><plan-field key="owner">h</plan-field></plan-meta>');
    expect(doubled.map(w => w.text)).toEqual([expect.stringMatching(/a second <plan-meta> block/)]);

    const orphan = warn('  <plan-meta><plan-field key="type">doc</plan-field></plan-meta>\n' +
                        '  <plan-field key="owner">h</plan-field>');
    expect(orphan.map(w => w.text)).toEqual([expect.stringMatching(/outside a <plan-meta> block/)]);
  });

  it('checks only the schema-independent problems when no schema is passed', () => {
    const body = '  <plan-meta>\n    <plan-field key="severity">high</plan-field>\n' +
                 '    <plan-field key="severity">low</plan-field>\n  </plan-meta>';
    expect(planr.planCheck(wrap(body)).warnings.map(w => w.text))
      .toEqual([expect.stringMatching(/duplicate field 'severity'/)]);   // unknown-field needs a schema
  });

  it('gathers no metadata warnings on a document whose structure is broken', () => {
    expect(planr.planCheck(wrap('  <plan-meta><plan-field key="nope">x</plan-field>'), schema()))
      .toMatchObject({ ok: false, warnings: [] });
  });
});

describe('planCheck warnings — stamps', () => {
  const schema = () => planr.mergeSchemas(planr.parseSchema({
    fields: {
      priority: { type: 'enum', values: ['p0', 'p1', 'p2'], tones: { p0: 'danger', p1: 'warn' } },
      area:     { type: 'list', hidden: true },
      owner:    { type: 'string' },
    },
  }, 'probe.json'));
  // Line 4 is the first field.
  const wrap = (...fields) => ['<plan-header title="T"></plan-header>', '<main>', '  <plan-meta>',
    ...fields.map(f => `    ${f}`), '  </plan-meta>', '</main>'].join('\n');
  const warn = (...fields) => planr.planCheck(wrap(...fields), schema()).warnings.map(w => [w.line, w.text]);

  it('warns on a missing, a wrong, a stale and an unknown tone, naming the fix — and is silent when every stamp matches', () => {
    expect(warn('<plan-field key="priority" tone="danger">p0</plan-field>',
                '<plan-field key="area" hidden>crm</plan-field>',
                '<plan-field key="owner">h</plan-field>')).toEqual([]);
    expect(warn('<plan-field key="priority">p0</plan-field>')).toEqual([[4,
      '<plan-field key="priority">: carries no tone, but the schema gives \'p0\' the tone \'danger\' — ' +
      'run `planr meta <file> --stamp`']]);
    expect(warn('<plan-field key="priority" tone="warn">p0</plan-field>')[0][1])
      .toMatch(/stamped tone 'warn', but the schema gives 'p0' the tone 'danger'/);
    expect(warn('<plan-field key="priority" tone="danger">p2</plan-field>')[0][1])
      .toMatch(/stamped tone 'danger', but the schema gives 'p2' no tone/);
    expect(warn('<plan-field key="priority" tone="pink">p0</plan-field>')[0][1])
      .toMatch(/tone 'pink' is not a tone \(valid: danger, warn, info, ok, final, muted\)/);
  });

  it('warns when hidden disagrees, in either direction — never failing the structure, and never over a bad value', () => {
    expect(warn('<plan-field key="area">crm</plan-field>')[0][1])
      .toMatch(/<plan-field key="area">: is not stamped hidden, but the schema hides it/);
    expect(warn('<plan-field key="owner" hidden>h</plan-field>')[0][1])
      .toMatch(/<plan-field key="owner">: is stamped hidden, but the schema shows it/);
    // A bad value is reported as a value problem, and its stamp is not judged.
    const { ok, warnings } = planr.planCheck(wrap('<plan-field key="priority" tone="danger">p9</plan-field>'), schema());
    expect(ok).toBe(true);
    expect(warnings.map(w => w.text)).toEqual([expect.stringMatching(/'p9' is not a declared value/)]);
  });
});

it('warns when a header-owned field appears in the block, and says who owns it', () => {
  const withHeader = planr.mergeSchemas(planr.parseSchema({
    fields: { status: { type: 'enum', values: ['draft', 'review'], from: 'header:status' },
              owner:  { type: 'string' } },
  }, 'probe.json'));
  const html = '<plan-header title="T" status="draft"></plan-header>\n<main>\n' +
               '  <plan-meta>\n    <plan-field key="status">review</plan-field>\n' +
               '    <plan-field key="owner">h</plan-field>\n  </plan-meta>\n</main>';
  const { ok, warnings } = planr.planCheck(html, withHeader);
  expect(ok).toBe(true);
  expect(warnings).toEqual([{ line: 4,
    text: "'status' is a header field — use `planr set <file> header.status=…`; remove the field from <plan-meta>" }]);
  // the header-owned warning replaces the value check for that field — one warning, not two
  expect(warnings).toHaveLength(1);
});

describe('template metadata defaults', () => {
  const schema = () => planr.mergeSchemas(planr.parseSchema({
    fields: { type: { type: 'enum', values: ['doc', 'issue'] }, area: { type: 'list' }, owner: { type: 'string' } },
  }, 'probe.json'));
  const SHELL_M = '<title>{{title}}</title>\n<plan-header title="{{title}}"></plan-header>\n<main>\n{{body}}\n</main>';
  const BODY_M = [
    '<!-- A probe template. -->',
    '  <plan-meta>',
    '    <plan-field key="type">issue</plan-field>',
    '    <plan-field key="area">{{area:}}</plan-field>',
    '  </plan-meta>',
    '  <plan-section id="o" title="O"></plan-section>',
  ].join('\n');
  const base = () => ({ title: 'T', date: 'd', skillSubpath: 's', schema: schema() });

  it('writes the declared default and DROPS a field whose placeholder was left empty', () => {
    const html = planr.planNew(SHELL_M, BODY_M, base());
    expect(html).toContain('<plan-field key="type">issue</plan-field>');
    expect(html).not.toContain('key="area"');
    expect(planr.planCheck(html, schema()).warnings).toEqual([]);
  });

  it('fills a declared field from --set, exactly like any other template variable', () => {
    const html = planr.planNew(SHELL_M, BODY_M, { ...base(), sets: ['area=crm,celery'] });
    expect(html).toContain('<plan-field key="area">crm,celery</plan-field>');
    expect(planr.templateVars(SHELL_M + BODY_M).map(v => v.name)).toContain('area');
  });

  it('drops the whole block when every field was left empty', () => {
    const allEmpty = BODY_M.replace('<plan-field key="type">issue</plan-field>', '<plan-field key="type">{{type:}}</plan-field>');
    expect(planr.planNew(SHELL_M, allEmpty, base())).not.toContain('plan-meta');
  });

  it('refuses a scaffold whose metadata the schema does not accept', () => {
    expect(() => planr.planNew(SHELL_M, BODY_M, { ...base(), sets: ['area=crm'], schema:
      planr.mergeSchemas(planr.parseSchema({ fields: { area: { type: 'list' } } }, 'probe.json')) }))
      .toThrow(/unknown field 'type'/);
    const badValue = BODY_M.replace('issue', 'nonsense');
    expect(() => planr.planNew(SHELL_M, badValue, base())).toThrow(/'nonsense' is not a declared value/);
  });

  it('holds every SHIPPED template to the SHIPPED schema, and none of them declares a header field', () => {
    const core = planr.mergeSchemas(planr.parseSchema(JSON.parse(skillFile('planr-schema.json')), 'core'));
    const dir = join(SKILL_DIR, 'templates');
    const shell = readFileSync(join(dir, '_shell.html'), 'utf8');
    for (const n of readdirSync(dir).filter(f => f.endsWith('.html') && !f.startsWith('_')).map(f => f.replace(/\.html$/, ''))) {
      const body = readFileSync(join(dir, `${n}.html`), 'utf8');
      expect(planr.templateProblems(body, shell, core), n).toEqual([]);
      // C9: a template default may never name a field the header owns.
      const block = planr.readMetaBlock(body);
      for (const f of block ? block.fields : [])
        expect(planr.headerOwnedProblem(core, f.key), `${n}: ${f.key}`).toBeNull();
    }
  });

  it('refuses at scaffold time a template that declares a header field', () => {
    const withHeader = planr.mergeSchemas(planr.parseSchema({
      fields: { status: { type: 'enum', values: ['draft'], from: 'header:status' } },
    }, 'probe.json'));
    const body = '<!-- A probe template. -->\n  <plan-meta><plan-field key="status">draft</plan-field></plan-meta>\n' +
                 '  <plan-section id="o" title="O"></plan-section>';
    expect(() => planr.planNew(SHELL_M, body, { ...base(), schema: withHeader }))
      .toThrow(/a template may not declare a header field — 'status' is a header field/);
  });

  it('gives the issue and tdd templates a type, and leaves basic without a block', () => {
    const read1 = (n) => readFileSync(join(SKILL_DIR, 'templates', `${n}.html`), 'utf8');
    expect(read1('issue')).toContain('<plan-field key="type">issue</plan-field>');
    expect(read1('tdd')).toContain('<plan-field key="type">tdd</plan-field>');
    expect(read1('basic')).not.toContain('plan-meta');
  });
});

// ── corpus query fixtures (shared by every query/next block below) ──
// planr is assigned in the file-level beforeAll, so NOTHING here may run at
// collection time: a `const schema = planr.parseSchema(...)` in a describe body
// evaluates before that hook and throws "Cannot read properties of undefined".
let QS;   // the shared fixture schema
beforeAll(() => {
  QS = planr.mergeSchemas(planr.parseSchema({
    fields: {
      title:    { type: 'string', from: 'header:title' },
      status:   { type: 'enum', values: ['draft', 'review', 'implemented'], from: 'header:status' },
      date:     { type: 'date', from: 'header:date' },
      priority: { type: 'enum', values: ['p0', 'p1', 'p2', 'p3'] },
      impact:   { type: 'enum', values: ['low', 'medium', 'high'] },
      points:   { type: 'number', min: 0, max: 21 },
      area:     { type: 'list' },
      owner:    { type: 'string' },
    },
  }, 'probe.json'));
});

// A document carrying the given <plan-meta> pairs and header attributes.
const QDOC = (meta = {}, attrs = 'title="T" status="draft" date="2026-01-02"') => [
  `<plan-header ${attrs}></plan-header>`,
  '<main>',
  '  <plan-meta>',
  ...Object.entries(meta).map(([k, v]) => `    <plan-field key="${k}">${v}</plan-field>`),
  '  </plan-meta>',
  '  <plan-section id="s1" title="One"></plan-section>',
  '</main>',
].join('\n');

const QREC = (meta, path = 'a.html', attrs) =>
  planr.resolveMeta(QDOC(meta, attrs), { schema: QS, docPath: path });

describe('parseWhere', () => {
  const P = (o) => planr.parseWhere(QS, o);

  it('maps every CLI comparison onto the declared operator shape', () => {
    expect(P({ where: ['priority=p0'] })).toEqual({ priority: { in: ['p0'] } });
    expect(P({ where: ['priority=p0,p1'] })).toEqual({ priority: { in: ['p0', 'p1'] } });
    expect(P({ where: ['status!=implemented'] })).toEqual({ status: { ne: ['implemented'] } });
    expect(P({ where: ['impact>=medium'] })).toEqual({ impact: { ge: 'medium' } });
    expect(P({ where: ['impact<=medium'] })).toEqual({ impact: { le: 'medium' } });
    expect(P({ where: ['points>3'] })).toEqual({ points: { gt: '3' } });
    expect(P({ where: ['points<3'] })).toEqual({ points: { lt: '3' } });
    expect(P({ where: ['area~celery'] })).toEqual({ area: { contains: 'celery' } });
    expect(P({ has: ['owner'], missing: ['priority'] }))
      .toEqual({ owner: { set: true }, priority: { set: false } });
  });

  it('reads >= before >, and AND-s several flags on one field', () => {
    // `priority>=p1` must not parse as `priority` > `=p1`.
    expect(P({ where: ['priority>=p1'] })).toEqual({ priority: { ge: 'p1' } });
    expect(P({ where: ['points>=3', 'points<=9'] })).toEqual({ points: { ge: '3', le: '9' } });
  });

  it('refuses a malformed expression, an unknown field, and `path`', () => {
    expect(() => P({ where: ['priority'] })).toThrow(/has no comparison — write key=value/);
    expect(() => P({ where: ['=p0'] })).toThrow(/names no field/);
    expect(() => P({ where: ['priority='] })).toThrow(/has no value/);
    expect(() => P({ where: ['severity=high'] }))
      .toThrow(/unknown field 'severity' — declared: title, status, date, priority, impact, points, area, owner/);
    expect(() => P({ has: ['severity'] })).toThrow(/unknown field 'severity'/);
    expect(() => P({ where: ['path~issues'] })).toThrow(/narrow by path with the target glob instead/);
  });
});

describe('compileWhere', () => {
  const C = (o) => planr.compileWhere(QS, o, 'filter');

  it('pre-ranks every literal by the field’s declared order', () => {
    expect(C({ priority: { in: ['p0', 'p2'] } }))
      .toEqual([{ key: 'priority', op: 'in', items: ['p0', 'p2'], ranks: [0, 2] }]);
    expect(C({ impact: { ge: 'medium' } })).toEqual([{ key: 'impact', op: 'ge', rank: 1 }]);
    expect(C({ points: { lt: '13' } })).toEqual([{ key: 'points', op: 'lt', rank: 13 }]);
    expect(C({ owner: { set: true } })).toEqual([{ key: 'owner', op: 'set', want: true }]);
    expect(C({ area: { contains: 'CELERY' } })).toEqual([{ key: 'area', op: 'contains', text: 'celery' }]);
    expect(C({ status: { ne: ['implemented'] } }))
      .toEqual([{ key: 'status', op: 'ne', items: ['implemented'], ranks: [2] }]);
  });

  it('accepts `eq` from a schema and normalises it to `in`', () => {
    expect(C({ priority: { eq: 'p1' } })).toEqual([{ key: 'priority', op: 'in', items: ['p1'], ranks: [1] }]);
  });

  it('refuses an unknown operator, a bad literal, a non-boolean `set`, and an ordered repeatable', () => {
    expect(() => C({ priority: { gte: 'p1' } }))
      .toThrow(/filter on 'priority': unknown operator 'gte' — valid: eq, ne, ge, le, gt, lt, in, contains, set/);
    expect(() => C({ priority: { in: ['urgent'] } }))
      .toThrow(/filter on 'priority': .*'urgent' is not a declared value — valid: p0, p1, p2, p3/);
    expect(() => C({ points: { ge: 'lots' } })).toThrow(/filter on 'points': .*'lots' is not a number/);
    expect(() => C({ owner: { set: 'yes' } })).toThrow(/filter on 'owner': `set` takes true or false/);
    expect(() => C({ area: { ge: 'crm' } }))
      .toThrow(/filter on 'area': 'ge' needs an order, and a repeatable field has none — use =, != or ~/);
    expect(() => C({ nope: { in: ['x'] } })).toThrow(/filter names unknown field 'nope'/);
  });

  it('does NOT hold a `contains` literal to the field’s values', () => {
    // A substring is deliberately not a whole value.
    expect(() => C({ priority: { contains: 'p' } })).not.toThrow();
  });

  it('names the label it was given, so a ranking says so', () => {
    expect(() => planr.compileWhere(QS, { priority: { gte: 'p1' } }, "ranking 'default' where"))
      .toThrow(/ranking 'default' where on 'priority': unknown operator 'gte'/);
  });
});

describe('matchWhere', () => {
  let rec, bare;
  beforeAll(() => {
    rec = QREC({ priority: 'p1', impact: 'high', points: '8', area: 'server/project/crm, celery' });
    bare = QREC({});
  });
  const hit = (r, o) => planr.matchWhere(r, planr.compileWhere(QS, o, 'filter'));

  it('compares on rank, so a declared enum order decides >= and <=', () => {
    expect(hit(rec, { priority: { in: ['p0', 'p1'] } })).toBe(true);
    expect(hit(rec, { priority: { in: ['p0'] } })).toBe(false);
    expect(hit(rec, { priority: { le: 'p1' } })).toBe(true);     // index 1 <= index 1
    expect(hit(rec, { priority: { lt: 'p1' } })).toBe(false);
    expect(hit(rec, { impact: { ge: 'medium' } })).toBe(true);   // high is index 2
    expect(hit(rec, { impact: { gt: 'high' } })).toBe(false);
    expect(hit(rec, { points: { ge: '8' } })).toBe(true);
    expect(hit(rec, { points: { gt: '8' } })).toBe(false);
  });

  it('AND-s conditions, and ORs the values of one', () => {
    expect(hit(rec, { priority: { in: ['p1'] }, impact: { in: ['high'] } })).toBe(true);
    expect(hit(rec, { priority: { in: ['p1'] }, impact: { in: ['low'] } })).toBe(false);
    expect(hit(rec, { priority: { in: ['p0', 'p1', 'p2'] } })).toBe(true);
    expect(hit(rec, { points: { ge: '5', le: '9' } })).toBe(true);
    expect(hit(rec, { points: { ge: '5', le: '7' } })).toBe(false);
  });

  it('matches a repeatable field per ITEM, for =, != and ~', () => {
    expect(hit(rec, { area: { in: ['celery'] } })).toBe(true);
    expect(hit(rec, { area: { in: ['server/project/crm, celery'] } })).toBe(false);  // not the whole raw string
    expect(hit(rec, { area: { ne: ['celery'] } })).toBe(false);
    expect(hit(rec, { area: { contains: 'CELE' } })).toBe(true);
  });

  it('matches a substring case-insensitively over a scalar’s raw text', () => {
    expect(hit(rec, { title: { contains: 't' } })).toBe(true);
    expect(hit(rec, { title: { contains: 'zzz' } })).toBe(false);
  });

  it('never lets an unset field satisfy a comparison, but lets != and --missing through', () => {
    expect(hit(bare, { priority: { in: ['p0'] } })).toBe(false);
    expect(hit(bare, { priority: { le: 'p3' } })).toBe(false);
    expect(hit(bare, { priority: { contains: 'p' } })).toBe(false);
    expect(hit(bare, { priority: { ne: ['p0'] } })).toBe(true);     // no value is not p0
    expect(hit(bare, { priority: { set: false } })).toBe(true);
    expect(hit(bare, { priority: { set: true } })).toBe(false);
    expect(hit(rec, { priority: { set: true } })).toBe(true);
  });

  it('matches a header-resolved value exactly as it matches a block-resolved one', () => {
    expect(hit(rec, { status: { in: ['draft'] } })).toBe(true);     // from the header
    expect(hit(rec, { status: { ne: ['implemented'] } })).toBe(true);
    expect(hit(rec, { date: { ge: '2026-01-01' } })).toBe(true);    // ISO dates sort lexically
    expect(hit(rec, { date: { gt: '2026-01-02' } })).toBe(false);
  });
});

describe('parseSort / parseFields / parseLimit', () => {
  it('defaults every field to asc and reads an explicit direction', () => {
    expect(planr.parseSort(QS, 'priority,impact:desc,date:asc')).toEqual([
      { name: 'priority', dir: 'asc' }, { name: 'impact', dir: 'desc' }, { name: 'date', dir: 'asc' },
    ]);
    expect(planr.parseSort(QS, '')).toEqual([]);
  });

  it('refuses an unknown field, a bad direction, and a repeatable field', () => {
    expect(() => planr.parseSort(QS, 'nope')).toThrow(/--sort names unknown field 'nope' — declared: title, status/);
    expect(() => planr.parseSort(QS, 'priority:sideways')).toThrow(/--sort 'priority:sideways': direction must be asc or desc/);
    expect(() => planr.parseSort(QS, 'area'))
      .toThrow(/--sort names 'area', which is repeatable and so has no single position/);
    expect(() => planr.parseSort(QS, 'nope', "ranking 'r' order")).toThrow(/ranking 'r' order names unknown field 'nope'/);
  });

  it('validates a projection against the schema, plus the pseudo-column `path`', () => {
    expect(planr.parseFields(QS, 'path, priority ,area')).toEqual(['path', 'priority', 'area']);
    expect(() => planr.parseFields(QS, 'path,nope'))
      .toThrow(/--fields names unknown column 'nope' — valid: path, title, status, date, priority, impact, points, area, owner/);
    expect(() => planr.parseFields(QS, ' , ')).toThrow(/--fields is empty/);
  });

  it('takes a positive whole number as a limit and nothing else', () => {
    expect(planr.parseLimit(null)).toBeNull();
    expect(planr.parseLimit('3')).toBe(3);
    for (const bad of ['0', '-1', '2.5', 'many', ''])
      expect(() => planr.parseLimit(bad), bad).toThrow(/--limit '.*' must be a positive whole number/);
  });
});

describe('queryDocs', () => {
  const DOCS = () => [
    { path: 'a/p0.html', html: QDOC({ priority: 'p0', impact: 'low' }) },
    { path: 'a/p1-a.html', html: QDOC({ priority: 'p1', impact: 'high' }) },
    { path: 'a/p1-b.html', html: QDOC({ priority: 'p1', impact: 'low' }) },
    { path: 'a/none.html', html: QDOC({}) },
    { path: 'a/mockup.html', html: '<html><body><h1>mock</h1></body></html>' },
    { path: 'a/broken.html', html: QDOC({ priority: 'p2' }).replace('</plan-section>', '') },
    { path: 'a/gone.html', error: 'unreadable — ENOENT' },
  ];

  it('reports the three unusable kinds instead of dropping them', () => {
    const q = planr.queryDocs(DOCS(), { schema: QS });
    expect(q.scanned).toBe(7);
    expect(q.matched).toBe(4);
    expect(q.skipped).toEqual([
      { path: 'a/mockup.html', reason: 'not a plan document — no <plan-*> markup' },
      { path: 'a/broken.html', reason: 'structure does not balance — run `planr check` on it' },
      { path: 'a/gone.html', reason: 'unreadable — ENOENT' },
    ]);
  });

  it('keeps a document whose only problem is nesting — its metadata still resolves', () => {
    const html = QDOC({ priority: 'p0' }).replace('</plan-section>',
      '<p><code><plan-callout type="info">x</plan-callout></code></p></plan-section>');
    expect(planr.planCheck(html).ok).toBe(false);
    const q = planr.queryDocs([{ path: 'a/nested.html', html }], { schema: QS });
    expect(q.skipped).toEqual([]);
    expect(q.matched).toBe(1);
  });

  it('sorts on rank, puts nulls last in BOTH directions, and is stable on a tie', () => {
    const order = (spec) => planr.queryDocs(DOCS(), { schema: QS, order: planr.parseSort(QS, spec) })
      .results.map(r => r.path);
    expect(order('priority')).toEqual(['a/p0.html', 'a/p1-a.html', 'a/p1-b.html', 'a/none.html']);
    expect(order('priority:desc')).toEqual(['a/p1-a.html', 'a/p1-b.html', 'a/p0.html', 'a/none.html']);
    // p1-a before p1-b in both: ties keep the input (path-sorted) order.
    expect(order('impact:desc')).toEqual(['a/p1-a.html', 'a/p0.html', 'a/p1-b.html', 'a/none.html']);
  });

  it('filters before sorting, and counts matches BEFORE the limit', () => {
    const q = planr.queryDocs(DOCS(), {
      schema: QS,
      where: planr.compileWhere(QS, { priority: { set: true } }, 'filter'),
      order: planr.parseSort(QS, 'priority'),
      limit: 2,
    });
    expect(q.matched).toBe(3);
    expect(q.results.map(r => r.path)).toEqual(['a/p0.html', 'a/p1-a.html']);
  });

  it('returns the resolveMeta record itself, unmodified', () => {
    const q = planr.queryDocs([{ path: 'a/p0.html', html: QDOC({ priority: 'p0' }) }], { schema: QS });
    expect(q.results[0].path).toBe('a/p0.html');
    expect(q.results[0].fields.priority).toEqual({ value: 'p0', raw: 'p0', source: 'meta', type: 'enum', rank: 0 });
    expect(Object.keys(q.results[0])).toEqual(['path', 'fields', 'unknown', 'problems']);
  });
});

describe('defaultFields', () => {
  it('is path plus every field some matched document resolves, in schema order', () => {
    const q = planr.queryDocs([{ path: 'a.html', html: QDOC({ priority: 'p0', area: 'crm' }) }], { schema: QS });
    // title/status/date come from the header; points and owner resolve nowhere.
    expect(planr.defaultFields(QS, q.results)).toEqual(['path', 'title', 'status', 'date', 'priority', 'area']);
  });
  it('is path alone when nothing matched', () => {
    expect(planr.defaultFields(QS, [])).toEqual(['path']);
  });
});

describe('applyRanking', () => {
  let ranked;
  beforeAll(() => {
    ranked = planr.mergeSchemas(planr.parseSchema({
      fields: {
        status:   { type: 'enum', values: ['draft', 'review', 'implemented'] },
        priority: { type: 'enum', values: ['p0', 'p1', 'p2'] },
        impact:   { type: 'enum', values: ['low', 'medium', 'high'] },
      },
      rankings: {
        default: { where: { status: { ne: 'implemented' }, priority: { set: true } },
                   order: ['priority', 'impact:desc'] },
        triage:  { where: { priority: { set: false } }, order: [] },
      },
    }, 'probe.json'));
  });

  it('supplies the preset when no flag contradicts it', () => {
    expect(planr.applyRanking(ranked, 'default', {})).toEqual({
      where: { status: { ne: 'implemented' }, priority: { set: true } },
      sort: 'priority,impact:desc',
    });
  });

  it('lets an explicit flag replace the preset per FIELD, leaving the rest standing', () => {
    const r = planr.applyRanking(ranked, 'default', { where: { priority: { in: ['p0'] } } });
    expect(r.where).toEqual({ status: { ne: 'implemented' }, priority: { in: ['p0'] } });  // not merged with `set`
    expect(r.sort).toBe('priority,impact:desc');                                            // order untouched
  });

  it('lets --sort replace the preset order outright', () => {
    expect(planr.applyRanking(ranked, 'default', { sort: 'impact' }).sort).toBe('impact');
    expect(planr.applyRanking(ranked, 'triage', {}).sort).toBe('');
  });

  it('is a pass-through with no ranking named', () => {
    expect(planr.applyRanking(ranked, null, { where: { priority: { in: ['p0'] } }, sort: 'priority' }))
      .toEqual({ where: { priority: { in: ['p0'] } }, sort: 'priority' });
  });

  it('refuses an unknown ranking, listing the declared ones', () => {
    expect(() => planr.applyRanking(ranked, 'nope', {}))
      .toThrow(/unknown ranking 'nope' — declared: default, triage/);
  });
});

describe('a ranking is validated by the code that runs it', () => {
  const core = () => planr.parseSchema({
    fields: {
      status:   { type: 'enum', values: ['draft', 'implemented'] },
      priority: { type: 'enum', values: ['p0', 'p1'] },
      area:     { type: 'list' },
    },
  }, 'core.json');
  const merge = (rankings) => planr.mergeSchemas(core(), planr.parseSchema({ rankings }, 'consumer.json'));

  it('accepts every operator the query implements', () => {
    expect(() => merge({ r: {
      where: { status: { ne: 'implemented' }, priority: { set: true, ge: 'p0' }, area: { contains: 'crm' } },
      order: ['priority', 'status:desc'],
    } })).not.toThrow();
  });

  it('refuses an operator the query does not implement, naming the file and the ranking', () => {
    expect(() => merge({ r: { where: { priority: { gte: 'p0' } } } }))
      .toThrow(/consumer\.json: ranking 'r' where on 'priority': unknown operator 'gte' — valid: eq, ne, ge, le, gt, lt, in, contains, set/);
  });

  it('refuses a literal the field cannot hold, and an ordered repeatable', () => {
    expect(() => merge({ r: { where: { priority: { eq: 'urgent' } } } }))
      .toThrow(/consumer\.json: ranking 'r' where on 'priority': .*'urgent' is not a declared value/);
    expect(() => merge({ r: { where: { area: { ge: 'crm' } } } }))
      .toThrow(/consumer\.json: ranking 'r' where on 'area': 'ge' needs an order/);
  });

  it('still refuses an unknown field and a bad direction in `order`', () => {
    expect(() => merge({ r: { order: ['nope'] } }))
      .toThrow(/consumer\.json: ranking 'r' order names unknown field 'nope'/);
    expect(() => merge({ r: { order: ['priority:sideways'] } }))
      .toThrow(/direction must be asc or desc/);
    expect(() => merge({ r: { order: ['area'] } }))
      .toThrow(/consumer\.json: ranking 'r' order names 'area', which is repeatable/);
    expect(() => merge({ r: { where: { nope: { set: true } } } }))
      .toThrow(/consumer\.json: ranking 'r' where names unknown field 'nope'/);
  });
});

describe('planQuery', () => {
  const DOCS = () => [
    { path: 'a/p0.html', html: QDOC({ priority: 'p0', area: 'crm, celery' }, 'title="Zero" status="draft"') },
    { path: 'a/p1.html', html: QDOC({ priority: 'p1' }, 'title="One" status="review"') },
    { path: 'a/none.html', html: QDOC({}, 'title="None" status="draft"') },
    { path: 'a/mockup.html', html: '<html><body>mock</body></html>' },
  ];
  const Q = (opts) => planr.planQuery(DOCS(), { schema: QS, target: 'a', ...opts });

  it('prints an aligned table, a dash for an unset value, and a trailing count', () => {
    expect(Q({ fields: 'path,priority,area' }).report).toBe([
      'path         priority  area',
      'a/p0.html    p0        crm, celery',
      'a/p1.html    p1        -',
      'a/none.html  -         -',
      '',
      '3 of 4 document(s) match',
      '',
    ].join('\n'));
  });

  it('says so when nothing matches, and still reports the scan', () => {
    const r = Q({ where: ['priority=p3'] });
    expect(r.report).toBe('no documents match\n\n0 of 4 document(s) match\n');
    expect(r.matched).toBe(0);
  });

  it('notes the limit and the ranking in the trailing line', () => {
    expect(Q({ fields: 'path', sort: 'priority', limit: '1' }).report)
      .toContain('3 of 4 document(s) match, showing 1');
  });

  it('carries the skip list on the returned object, never in the report', () => {
    const r = Q({ fields: 'path' });
    expect(r.report).not.toContain('mockup');
    expect(r.skipped).toEqual([{ path: 'a/mockup.html', reason: 'not a plan document — no <plan-*> markup' }]);
    expect(r.scanned).toBe(4);
  });

  it('emits paths alone, newline-terminated, and nothing at all when empty', () => {
    expect(Q({ format: 'paths', sort: 'priority' }).report).toBe('a/p0.html\na/p1.html\na/none.html\n');
    expect(Q({ format: 'paths', where: ['priority=p3'] }).report).toBe('');
  });

  it('emits a header row and tab-separated values, with an EMPTY cell for unset', () => {
    expect(Q({ format: 'tsv', fields: 'path,priority' }).report)
      .toBe('path\tpriority\na/p0.html\tp0\na/p1.html\tp1\na/none.html\t\n');
  });

  it('emits the orchestrator payload under --format json', () => {
    const out = JSON.parse(Q({
      format: 'json', fields: 'path,priority', where: ['priority=p0,p1'], sort: 'priority',
      limit: '1', schemaSources: ['C:\\x\\core.json'],
    }).report);
    expect(out).toMatchObject({
      target: 'a', rank: null, scanned: 4, matched: 2, returned: 1,
      fields: ['path', 'priority'], schema: ['C:/x/core.json'],
    });
    expect(out.results[0].path).toBe('a/p0.html');
    expect(out.results[0].fields.priority).toEqual({ value: 'p0', raw: 'p0', source: 'meta', type: 'enum', rank: 0 });
    expect(out.skipped).toEqual([{ path: 'a/mockup.html', reason: 'not a plan document — no <plan-*> markup' }]);
  });

  it('projects the default columns when --fields is absent', () => {
    const out = JSON.parse(Q({ format: 'json' }).report);
    expect(out.fields).toEqual(['path', 'title', 'status', 'priority', 'area']);
  });

  it('gives every result the WHOLE record — every declared field, whatever --fields says', () => {
    // `fields` is the column list; `results[].fields` is the record, and it is
    // the same shape `meta --format json` and `next --format json` emit. A key
    // set that varied with the projection, or with what the corpus happened to
    // resolve, would read as `undefined` — indistinguishable from "no value" —
    // in a consumer walking a partly-backfilled corpus.
    const declared = Object.keys(QS.fields);
    for (const opts of [{}, { fields: 'path' }, { fields: 'path,priority' }, { where: ['priority=p0'] }]) {
      const out = JSON.parse(Q({ format: 'json', ...opts }).report);
      for (const r of out.results) expect(Object.keys(r.fields), JSON.stringify(opts)).toEqual(declared);
    }
    // ...including the fields NO matched document resolves, as an explicit null.
    const one = JSON.parse(Q({ format: 'json', fields: 'path' }).report).results[0];
    expect(one.fields.owner).toEqual({ value: null, raw: null, source: null, type: 'string', rank: null });
    expect(one.fields.points).toEqual({ value: null, raw: null, source: null, type: 'number', rank: null });
  });

  it('applies a ranking, and lets an explicit flag override it per field', () => {
    const rankedSchema = planr.mergeSchemas(planr.parseSchema({
      fields: {
        title:    { type: 'string', from: 'header:title' },
        status:   { type: 'enum', values: ['draft', 'review', 'implemented'], from: 'header:status' },
        priority: { type: 'enum', values: ['p0', 'p1', 'p2', 'p3'] },
      },
      rankings: { queue: { where: { priority: { set: true } }, order: ['priority:desc'] } },
    }, 'probe.json'));
    const R = (opts) => planr.planQuery(DOCS(), { schema: rankedSchema, format: 'paths', rank: 'queue', ...opts });
    expect(R({}).report).toBe('a/p1.html\na/p0.html\n');                       // preset filter + preset order
    expect(R({ where: ['priority=p0'] }).report).toBe('a/p0.html\n');          // flag replaces the preset's field
    expect(R({ sort: 'priority' }).report).toBe('a/p0.html\na/p1.html\n');     // --sort replaces the order
    expect(() => planr.planQuery(DOCS(), { schema: rankedSchema, rank: 'nope' }))
      .toThrow(/unknown ranking 'nope' — declared: queue/);
  });

  it('blames the origin a bad condition actually came from, not whichever ran last', () => {
    const bad = planr.mergeSchemas(planr.parseSchema({
      fields: {
        status:   { type: 'enum', values: ['draft', 'implemented'], from: 'header:status' },
        priority: { type: 'enum', values: ['p0', 'p1'] },
        area:     { type: 'list' },
      },
      rankings: { queue: { where: { status: { ne: 'implemented' } }, order: [] } },
    }, 'probe.json'));
    // The flag is at fault, even with a ranking in play.
    expect(() => planr.planQuery(DOCS(), { schema: bad, rank: 'queue', where: ['priority=urgent'] }))
      .toThrow(/^filter on 'priority': /);
    expect(() => planr.planQuery(DOCS(), { schema: bad, rank: 'queue', where: ['area>=x'] }))
      .toThrow(/^filter on 'area': 'ge' needs an order/);
    // And with no ranking at all, the label is still the flag.
    expect(() => planr.planQuery(DOCS(), { schema: bad, where: ['priority=urgent'] }))
      .toThrow(/^filter on 'priority': /);
    // The ranking is at fault only for a condition the flags never named. A
    // ranking this broken is refused at schema load; reaching it here takes a
    // schema built in memory, which is exactly what a consumer test does.
    const rotten = planr.parseSchema({
      fields: { priority: { type: 'enum', values: ['p0', 'p1'] } },
    }, 'probe.json');
    rotten.rankings = { queue: { where: { priority: { ge: 'urgent' } }, order: [], origin: 'probe.json' } };
    expect(() => planr.planQuery(DOCS(), { schema: rotten, rank: 'queue' }))
      .toThrow(/^ranking 'queue' where on 'priority': /);
    // ...and the flag overriding that field takes the blame back.
    expect(() => planr.planQuery(DOCS(), { schema: rotten, rank: 'queue', where: ['priority=nonsense'] }))
      .toThrow(/^filter on 'priority': /);
  });

  it('refuses an unknown format, --fields beside --format paths, and a bad limit', () => {
    expect(() => Q({ format: 'yaml' })).toThrow(/unknown --format 'yaml' — valid: table, json, tsv, paths/);
    expect(() => Q({ format: 'paths', fields: 'path' }))
      .toThrow(/--format paths prints paths only — drop --fields, or pick table, tsv or json/);
    expect(() => Q({ limit: 'many' })).toThrow(/--limit 'many' must be a positive whole number/);
  });
});

describe('skipReport', () => {
  it('is empty for a clean scan, and lists each file with its reason otherwise', () => {
    expect(planr.skipReport([])).toBe('');
    expect(planr.skipReport([{ path: 'a.html', reason: 'unreadable — EACCES' }]))
      .toBe('1 file(s) skipped — scanned, not queryable:\n  a.html: unreadable — EACCES');
  });
});

// A document with real nesting and statuses, so `next`'s outline has something
// to say: every section at every depth, and the unfinished subset.
const NDOC = (meta = {}) => [
  '<plan-header title="Quota cache" status="draft" date="2026-01-02"></plan-header>',
  '<main>',
  '  <plan-meta>',
  ...Object.entries(meta).map(([k, v]) => `    <plan-field key="${k}">${v}</plan-field>`),
  '  </plan-meta>',
  '  <plan-section id="overview" title="Overview"></plan-section>',
  '  <plan-section id="steps" title="Steps">',
  '    <plan-section id="step-1" title="First" status="done"></plan-section>',
  '    <plan-section id="step-2" title="Second" status="todo"></plan-section>',
  '  </plan-section>',
  '  <plan-section id="wrap" title="Wrap" status="in-progress"></plan-section>',
  '</main>',
].join('\n');

describe('docOutline', () => {
  it('lists every section at every depth by its dot-path address', () => {
    const o = planr.docOutline(NDOC());
    expect(o.sections).toEqual([
      { addr: 'overview', num: '1', title: 'Overview', status: null },
      { addr: 'steps', num: '2', title: 'Steps', status: null },
      { addr: 'steps.step-1', num: '2.1', title: 'First', status: 'done' },
      { addr: 'steps.step-2', num: '2.2', title: 'Second', status: 'todo' },
      { addr: 'wrap', num: '3', title: 'Wrap', status: 'in-progress' },
    ]);
  });

  it('takes the open subset by the `tasks` rule, and names the first as the start', () => {
    const o = planr.docOutline(NDOC());
    expect(o.open.map(s => s.addr)).toEqual(['steps.step-2', 'wrap']);   // `done` is not open
    expect(o.next).toBe('steps.step-2');
  });

  it('reports no start when nothing carries an unfinished status', () => {
    const o = planr.docOutline('<main><plan-section id="a" title="A"></plan-section></main>');
    expect(o.open).toEqual([]);
    expect(o.next).toBeNull();
  });
});

describe('planNext', () => {
  let NS;
  beforeAll(() => {
    NS = planr.mergeSchemas(planr.parseSchema({
      fields: {
        title:    { type: 'string', from: 'header:title' },
        status:   { type: 'enum', values: ['draft', 'review', 'implemented'], from: 'header:status' },
        priority: { type: 'enum', values: ['p0', 'p1', 'p2'] },
      },
      rankings: {
        default: { where: { status: { ne: 'implemented' } }, order: ['priority'] },
        empty:   { where: { priority: { in: ['p2'] } }, order: [] },
      },
    }, 'probe.json'));
  });
  const DOCS = () => [
    { path: 'a/p1.html', html: NDOC({ priority: 'p1' }) },
    { path: 'a/p0.html', html: NDOC({ priority: 'p0' }) },
    { path: 'a/mockup.html', html: '<html><body>mock</body></html>' },
  ];
  const N = (opts) => planr.planNext(DOCS(), { schema: NS, target: 'a', ...opts });

  it('prints the top document, its resolved metadata and where to start', () => {
    expect(N({}).report).toBe([
      'a/p0.html',
      'Quota cache',
      '',
      '  status    draft  (header)',
      '  priority  p0     (meta)',
      '',
      "  ranking 'default' — 1 of 2 matching, 3 scanned",
      '',
      'open sections:',
      '  steps.step-2  [todo       ]  Second',
      '  wrap          [in-progress]  Wrap',
      '',
      'start at: steps.step-2',
      '',
    ].join('\n'));
  });

  it('hands an agent the whole address space plus the open subset under --format json', () => {
    const out = JSON.parse(N({ format: 'json', schemaSources: ['C:\\x\\core.json'] }).report);
    expect(out).toMatchObject({ target: 'a', rank: 'default', scanned: 3, matched: 2, schema: ['C:/x/core.json'] });
    expect(out.document.path).toBe('a/p0.html');
    expect(out.document.title).toBe('Quota cache');
    expect(out.document.fields.priority)
      .toEqual({ value: 'p0', raw: 'p0', source: 'meta', type: 'enum', rank: 0 });
    expect(out.document.sections.map(s => s.addr))
      .toEqual(['overview', 'steps', 'steps.step-1', 'steps.step-2', 'wrap']);
    expect(out.document.open.map(s => s.addr)).toEqual(['steps.step-2', 'wrap']);
    expect(out.document.next_section).toBe('steps.step-2');
    expect(out.skipped).toEqual([{ path: 'a/mockup.html', reason: 'not a plan document — no <plan-*> markup' }]);
  });

  it('treats an empty queue as an answer, not a failure', () => {
    expect(N({ rank: 'empty' }).report).toBe("no document matches ranking 'empty' — 3 scanned\n");
    expect(JSON.parse(N({ rank: 'empty', format: 'json' }).report).document).toBeNull();
  });

  it('refuses an unknown ranking, and says what `default` means when it is missing', () => {
    expect(() => N({ rank: 'nope' })).toThrow(/unknown ranking 'nope' — declared: default, empty/);
    const bare = planr.mergeSchemas(planr.parseSchema({ fields: { owner: { type: 'string' } } }, 'probe.json'));
    expect(() => planr.planNext([], { schema: bare }))
      .toThrow(/unknown ranking 'default' — declared: \(none\)[\s\S]*declare one named 'default', or pass --rank/);
  });

  it('refuses a format it does not have', () => {
    expect(() => N({ format: 'tsv' })).toThrow(/unknown --format 'tsv' — valid: text, json/);
  });
});

describe('tones — one colour vocabulary', () => {
  const css = () => skillFile('plan-styles.css');
  // A `key: 'value'` object literal in plan-runtime.js, found by `re`.
  const runtimeMap = (re) => {
    const block = re.exec(skillFile('plan-runtime.js'));
    expect(block, `${re} not found in plan-runtime.js`).toBeTruthy();
    return Object.fromEntries([...block[1].matchAll(/([\w-]+):\s*'([^']*)'/g)].map(m => [m[1], m[2]]));
  };

  it('every tone has a dot rule and a badge rule, and no rule names a tone outside the set', () => {
    const dots = [...css().matchAll(/^\.dot\.tone-([\w-]+)\s*\{/gm)].map(m => m[1]);
    const badges = [...css().matchAll(/^plan-badge\.tone-([\w-]+)\s*\{/gm)].map(m => m[1]);
    expect([...dots].sort()).toEqual([...planr.TONES].sort());
    expect([...badges].sort()).toEqual([...planr.TONES].sort());
  });

  it('every badge type maps to a tone, and PlanBadge colours from the same map', () => {
    expect(Object.keys(planr.BADGE_TONES)).toEqual(planr.BADGE_TYPES);
    for (const t of Object.values(planr.BADGE_TONES)) expect(planr.TONES).toContain(t);
    expect(runtimeMap(/class PlanBadge[\s\S]*?const tones = \{([\s\S]*?)\};/)).toEqual(planr.BADGE_TONES);
  });

  it('keeps every existing badge colour meaning, and styles badges per tone, never per type', () => {
    expect(planr.BADGE_TONES).toEqual({
      decided: 'ok', open: 'warn', deferred: 'muted', high: 'ok', medium: 'warn', low: 'danger',
    });
    expect(css()).not.toMatch(/plan-badge\[type=/);
  });

  it('every header status maps to a tone, and PlanHeader colours its dot from the same map', () => {
    expect(Object.keys(planr.HEADER_STATUS_TONES)).toEqual(planr.HEADER_STATUS);
    for (const t of Object.values(planr.HEADER_STATUS_TONES)) expect(planr.TONES).toContain(t);
    expect(runtimeMap(/const STATUS_TONES = \{([\s\S]*?)\};/)).toEqual(planr.HEADER_STATUS_TONES);
    // The colours the per-status dot rules drew, kept.
    expect(planr.HEADER_STATUS_TONES).toEqual({
      draft: 'warn', review: 'info', approved: 'ok', implemented: 'final', rejected: 'danger',
    });
    expect(css()).not.toMatch(/^\.dot\.(draft|review|approved|implemented|rejected)\b/m);
  });
});

describe('stamps — the writer carries tone and hidden onto the page', () => {
  const schema = () => planr.mergeSchemas(planr.parseSchema({
    fields: {
      type:     { type: 'enum', values: ['doc', 'issue'] },
      priority: { type: 'enum', values: ['p0', 'p1', 'p2'], tones: { p0: 'danger', p1: 'warn' } },
      area:     { type: 'list', hidden: true },
      owner:    { type: 'string' },
    },
  }, 'probe.json'));
  const BARE = ['<plan-header title="T"></plan-header>', '<main>', '',
                '  <plan-section id="a" title="A"><p>Body.</p></plan-section>', '', '</main>'].join('\n');
  const DOC = (fields) => ['<plan-header title="T"></plan-header>', '<main>', '  <plan-meta>',
    ...fields.map(f => `    ${f}`), '  </plan-meta>', '</main>'].join('\n');

  it('fieldStamp is the one rule: a tone for a toned value, hidden for an opted-out field, null for an unknown one', () => {
    const s = schema();
    expect(planr.fieldStamp(s, 'priority', 'p0')).toEqual({ tone: 'danger', hidden: false });
    expect(planr.fieldStamp(s, 'priority', ' p1 ')).toEqual({ tone: 'warn', hidden: false });
    expect(planr.fieldStamp(s, 'priority', 'p2')).toEqual({ tone: null, hidden: false });
    expect(planr.fieldStamp(s, 'area', 'crm, celery')).toEqual({ tone: null, hidden: true });
    expect(planr.fieldStamp(s, 'severity', 'x')).toBeNull();
    expect(planr.stampAttrs({ tone: 'warn', hidden: true })).toBe(' tone="warn" hidden');
    expect(planr.stampAttrs({ tone: null, hidden: false })).toBe('');
    expect(planr.stampAttrs(null)).toBe('');
  });

  it('meta --set stamps every field it writes, and restamps the rest of the block', () => {
    const { html } = planr.planMetaSet(BARE, { schema: schema(), sets: ['priority=p0', 'area=crm,celery', 'owner=h'] });
    expect(html).toContain('<plan-field key="priority" tone="danger">p0</plan-field>');
    expect(html).toContain('<plan-field key="area" hidden>crm,celery</plan-field>');
    expect(html).toContain('<plan-field key="owner">h</plan-field>');
    // A hand edit left a stale tone on priority; the next --set of ANOTHER field corrects it.
    const again = planr.planMetaSet(html.replace('>p0<', '>p2<'), { schema: schema(), sets: ['owner=j'] }).html;
    expect(again).toContain('<plan-field key="priority">p2</plan-field>');
  });

  it('planMetaStamp rewrites drifting stamps only — values byte-for-byte — and names what it changed', () => {
    const before = DOC([
      '<plan-field key="priority">p1</plan-field>',
      '<plan-field key="area" tone="ok">crm, celery &amp; co</plan-field>',
      '<plan-field key="owner">h</plan-field>',
      '<plan-field key="severity" tone="warn">high</plan-field>',
    ]);
    const { html, message } = planr.planMetaStamp(before, { schema: schema() });
    expect(html).toBe(DOC([
      '<plan-field key="priority" tone="warn">p1</plan-field>',
      '<plan-field key="area" hidden>crm, celery &amp; co</plan-field>',
      '<plan-field key="owner">h</plan-field>',
      '<plan-field key="severity" tone="warn">high</plan-field>',   // unknown: left exactly as written
    ]));
    expect(message).toBe('stamped priority\nstamped area');
  });

  it('planMetaStamp returns the document unchanged when it is in line, or has no block', () => {
    const inLine = DOC(['<plan-field key="priority" tone="danger">p0</plan-field>']);
    expect(planr.planMetaStamp(inLine, { schema: schema() }))
      .toEqual({ html: inLine, message: 'every field already matches the schema — nothing to stamp' });
    expect(planr.planMetaStamp(BARE, { schema: schema() }))
      .toEqual({ html: BARE, message: 'no <plan-meta> block — nothing to stamp' });
  });

  it('planMetaStamp judges a tag by stampDrift: a clean tag in another shape is untouched, and extra attributes survive', () => {
    const before = DOC([
      '<plan-field tone="danger" key="priority">p0</plan-field>',   // reordered, already in line
      '<plan-field key="area" class="x">crm</plan-field>',          // drifts: needs hidden
    ]);
    const { html, message } = planr.planMetaStamp(before, { schema: schema() });
    expect(html).toBe(DOC([
      '<plan-field tone="danger" key="priority">p0</plan-field>',
      '<plan-field key="area" class="x" hidden>crm</plan-field>',
    ]));
    expect(message).toBe('stamped area');
  });

  it('planMetaStamp refuses --set or --unset beside it', () => {
    expect(() => planr.planMetaStamp(BARE, { schema: schema(), sets: ['owner=h'] }))
      .toThrow(/--stamp rewrites stamps only, and --set\/--unset already stamp every field they write — use one or the other/);
    expect(() => planr.planMetaStamp(BARE, { schema: schema(), unsets: ['owner'] })).toThrow(/--stamp rewrites stamps only/);
  });

  it("new stamps a template's declared fields", () => {
    const shell = '<title>{{title}}</title>\n<plan-header title="{{title}}"></plan-header>\n<main>\n{{body}}\n</main>';
    const body = '  <plan-meta>\n    <plan-field key="priority">p0</plan-field>\n' +
                 '    <plan-field key="area">{{area:}}</plan-field>\n  </plan-meta>';
    const html = planr.planNew(shell, body, {
      title: 'T', date: '2026-01-01', skillSubpath: 's', sets: ['area=crm'], schema: schema(),
    });
    expect(html).toContain('<plan-field key="priority" tone="danger">p0</plan-field>');
    expect(html).toContain('<plan-field key="area" hidden>crm</plan-field>');
  });
});

describe('free-text header chips are deprecated', () => {
  it('check warns on a header carrying chips, pointing at a metadata field', () => {
    const html = '<plan-header title="T" status="draft"\n  chips="Bug | Production">\n</plan-header>\n<main></main>';
    const { ok, warnings } = planr.planCheck(html);
    expect(ok).toBe(true);
    expect(warnings).toEqual([{ line: 1, text:
      '<plan-header chips="Bug | Production"> — free-text chips are deprecated; declare each recurring chip as a ' +
      'metadata field in .claude/planr-schema.json and write it with `planr meta <file> --set <field>=<value>`' }]);
    // Every 1.3.0 scaffold carries an empty attribute: that is not a chip.
    expect(planr.planCheck('<plan-header title="T" chips=""></plan-header>\n<main></main>').warnings).toEqual([]);
  });

  it('set still writes chips, and notes the deprecation only when it writes some', () => {
    const { html, message } = planr.planSet(DOC, 'header.chips=A | B');
    expect(planr.getAttr(planr.findElement(html, 'plan-header').attrsRaw, 'chips')).toBe('A | B');
    expect(message).toBe('set header.chips = "A | B"\n' +
      'note: header chips are deprecated — declare a metadata field in the schema and write it with `planr meta <file> --set`');
    expect(planr.planSet(DOC, 'header.chips=').message).toBe('set header.chips = ""');
  });

  it('new steers a bare chips key to metadata, not to the deprecated attribute', () => {
    expect(() => planr.planNew(SHELL, BODY, { title: 'T', date: '2026-01-01', skillSubpath: 's', sets: ['chips=A'] }))
      .toThrow(/--set key 'chips' matches no \{\{placeholder\}\} — header chips are deprecated; declare a metadata field and use `planr meta --set`/);
  });

  it('no shipped template emits or suggests chips', () => {
    for (const t of ['_shell.html', 'issue.html', 'tdd.html', 'basic.html'])
      expect(skillFile(`templates/${t}`), t).not.toMatch(/chips/);
  });
});
