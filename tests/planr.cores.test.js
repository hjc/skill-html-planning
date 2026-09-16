import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
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
    // The live failure: a ticket claim sets status + chips together, the chips
    // were dropped, and the command still exited 0 printing a success line.
    const { html, message } = planr.planSet(DOC, ['header.status=review', 'header.chips=A | B | C']);
    const hdr = planr.findElement(html, 'plan-header').attrsRaw;
    expect(planr.getAttr(hdr, 'status')).toBe('review');
    expect(planr.getAttr(hdr, 'chips')).toBe('A | B | C');
    expect(message).toBe('set header.status = "review"\nset header.chips = "A | B | C"');
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
  it('every HEADER_STATUS value has a .dot rule, and every .dot rule is in the enum', () => {
    // The pair that drifted in BOTH directions: `review` was styled but
    // undocumented, `rejected` documented but unstyled (no dot colour). The
    // enum and the stylesheet are the two halves; assert they agree.
    const css = readFileSync(join(SKILL_DIR, 'plan-styles.css'), 'utf8');
    const styled = [...css.matchAll(/^\.dot\.([\w-]+)\s*\{/gm)].map(m => m[1]);
    expect([...styled].sort()).toEqual([...planr.HEADER_STATUS].sort());
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
    const byNth = planr.planInsert(RICH, 'map', '<tr><td>new</td></tr>', { where: 'end', into: 'tr:1' });
    expect(byNth.message).toContain('→ tr:1 of 2');
    const byId = planr.planInsert(RICH, 'map', '<tbody></tbody>', { where: 'end', into: '#tickets' });
    expect(byId.message).toContain('→ #tickets');
  });
  it('rejects an unusable --into selector', () => {
    expect(() => planr.planInsert(RICH, 'map', '<li>x</li>', { into: 'ol' })).toThrow(/no <ol> in this section/);
    expect(() => planr.planInsert(RICH, 'map', '<li>x</li>', { into: 'tr:9' })).toThrow(/only 2 <tr>/);
    expect(() => planr.planInsert(RICH, 'map', '<li>x</li>', { into: '#nope' })).toThrow(/no element with id 'nope'/);
    expect(() => planr.planInsert(RICH, 'map', '<li>x</li>', { into: 'plan-table' })).toThrow(/address a <plan-table> with the dot-path/);
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
