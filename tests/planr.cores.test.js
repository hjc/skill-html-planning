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
  it('fills a BARE key that names a real placeholder', () => {
    expect(planr.planNew(SHELL, BODY, { ...base, sets: ['title=Override'] })).toContain('<title>Override</title>');
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
  it('rejects a bare child id as a ref — every address is a full dot-path', () => {
    expect(() => planr.planAddSection(DOC, { id: 'a2', parent: 'a', after: 'a1' }, null))
      .toThrow(/section 'a1' not found/);
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
  it('describes one template: its guidance and what it scaffolds', () => {
    const out = planr.planTemplateReport(entries, 'zeta');
    expect(out).toContain('# zeta');
    expect(out).toContain('· One bullet.');
    expect(out).toContain('Scaffolds 1 section:');
    expect(out).toContain('1. overview');
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

describe('resolveNode error path (now throwing, not exiting)', () => {
  it('throws PlanError on an unknown address', () => {
    expect(() => planr.planRead(DOC, 'nope', {})).toThrow(planr.PlanError);
  });
});
