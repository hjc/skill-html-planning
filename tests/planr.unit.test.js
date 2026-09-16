import { describe, it, expect, beforeAll } from 'vitest';
import { PLANR_URL } from './helpers.js';

// planr.js is CommonJS; dynamic import gives interop. Fall back to `.default`
// (module.exports object) if named exports aren't hoisted by the CJS lexer.
let planr;
beforeAll(async () => { const m = await import(PLANR_URL); planr = m.default ?? m; });

describe('render()', () => {
  it('substitutes known vars, leaves unknown intact, treats $ literally', () => {
    expect(planr.render('a {{x}} b', { x: 'Z' })).toBe('a Z b');
    expect(planr.render('{{missing}}', {})).toBe('{{missing}}');
    expect(planr.render('{{v}}', { v: '$& $1 ok' })).toBe('$& $1 ok');  // no regex reinterpretation
  });
  it('honors a declared default, and lets a value override it', () => {
    expect(planr.render('{{lang:en}}', {})).toBe('en');
    expect(planr.render('{{lang:en}}', { lang: 'fr' })).toBe('fr');
    expect(planr.render('x="{{sub:}}"', {})).toBe('x=""');        // empty default
    expect(planr.render('{{status:draft}}', { status: '' })).toBe('');  // explicit empty wins
  });
});

describe('templateVars()', () => {
  it('reports each placeholder once, with its default, sorted', () => {
    const tpl = '<html lang="{{lang:en}}"><title>{{title}}</title><p>{{title}} {{sub:}}</p>';
    expect(planr.templateVars(tpl)).toEqual([
      { name: 'lang', def: 'en' },
      { name: 'sub', def: '' },
      { name: 'title', def: undefined },   // no default declared
    ]);
  });
});

describe('resolveSkillSubpath(invoked)', () => {
  it('derives the subpath from a .claude path — any depth, any name', () => {
    expect(planr.resolveSkillSubpath('/u/.claude/skills/html-planning/planr.js')).toBe('skills/html-planning');
    expect(planr.resolveSkillSubpath('C:\\a\\.claude\\skills\\my-skill\\planr.js')).toBe('skills/my-skill');
    expect(planr.resolveSkillSubpath('/x/.claude/skills/a/b/planr.js')).toBe('skills/a/b');
  });
  it('falls back to skills/<dir> outside any .claude tree', () => {
    expect(planr.resolveSkillSubpath('/repo/skills/html-planning/planr.js')).toBe('skills/html-planning');
    expect(planr.resolveSkillSubpath('/tmp/foo/planr.js')).toBe('skills/foo');
  });
});

describe('attribute scanner / mutator', () => {
  const raw = ' id="foo" num="3" add title="Hi There"';
  it('reads valued and boolean attributes', () => {
    expect(planr.getAttr(raw, 'id')).toBe('foo');
    expect(planr.getAttr(raw, 'title')).toBe('Hi There');
    expect(planr.getAttr(raw, 'add')).toBe(true);          // boolean attr
    expect(planr.getAttr(raw, 'missing')).toBeUndefined();
  });
  it('setAttrRaw edits in place, appends when absent, promotes a boolean', () => {
    expect(planr.setAttrRaw('id="a" status="todo"', 'status', 'done')).toBe('id="a" status="done"');
    expect(planr.setAttrRaw('id="a"', 'num', '2')).toBe('id="a" num="2"');
    expect(planr.setAttrRaw('id="a" add', 'add', '1')).toBe('id="a" add="1"');
  });
});

describe('tag scanner (nesting + comment-awareness)', () => {
  it('findElement returns the OUTERMOST match, depth-counting nested twins', () => {
    const html = '<plan-section id="a"><plan-section id="b"></plan-section></plan-section>';
    expect(planr.getAttr(planr.findElement(html, 'plan-section').attrsRaw, 'id')).toBe('a');
  });
  it('findElements lists only outermost siblings, excluding nested descendants', () => {
    //                        ┌─ 'c' is nested inside 'a' ─┐
    const html = '<plan-section id="a"><plan-section id="c"></plan-section></plan-section><plan-section id="b"></plan-section>';
    const ids = planr.findElements(html, 'plan-section').map(e => planr.getAttr(e.attrsRaw, 'id'));
    expect(ids).toEqual(['a', 'b']);   // 'c' must be absent — cursor skips past a.outerEnd
  });
  it('ignores plan tags written inside HTML comments', () => {
    const html = '<!-- <plan-section id="ghost"></plan-section> --><plan-section id="real"></plan-section>';
    expect(planr.getAttr(planr.findElement(html, 'plan-section').attrsRaw, 'id')).toBe('real');
  });
});

describe('addressing', () => {
  const doc = '<plan-section id="steps"><plan-section id="s1"></plan-section><plan-section id="s2"></plan-section></plan-section>';
  it('childSections returns immediate children in document order', () => {
    const steps = planr.findSectionById(doc, 'steps');
    const kids = planr.childSections(doc, steps.innerStart, steps.innerEnd);
    expect(kids.map(k => planr.getAttr(k.attrsRaw, 'id'))).toEqual(['s1', 's2']);
  });
  it('resolveNode walks a dot-path by id and by 1-based ordinal', () => {
    expect(planr.getAttr(planr.resolveNode(doc, ['steps', 's2']).attrsRaw, 'id')).toBe('s2');
    expect(planr.getAttr(planr.resolveNode(doc, ['steps', '1']).attrsRaw, 'id')).toBe('s1');
  });
});

describe('walkTags (linear scan backing `check`)', () => {
  const collect = (html, keep = () => true) => {
    const out = [];
    planr.walkTags(html, keep, t => out.push(`${t.kind}:${t.name}`));
    return out;
  };
  it('reports opens, closes and self-closing tags in document order', () => {
    expect(collect('<plan-nav/><plan-section id="a"></plan-section>'))
      .toEqual(['self:plan-nav', 'open:plan-section', 'close:plan-section']);
  });
  it('sees the unbalanced tags findClose gives up on', () => {
    // findElement returns null here; `check` still has to name the problem.
    expect(planr.findElement('<plan-callout>oops', 'plan-callout')).toBeNull();
    expect(collect('<plan-callout>oops')).toEqual(['open:plan-callout']);
    expect(collect('</plan-table>')).toEqual(['close:plan-table']);
  });
  it('skips comments, and steps over a quoted attribute containing markup', () => {
    expect(collect('<!-- <plan-section id="x"></plan-section> -->')).toEqual([]);
    expect(collect('<plan-card title="a <plan-badge> in prose"></plan-card>'))
      .toEqual(['open:plan-card', 'close:plan-card']);
  });
  it('ignores doctypes and a bare < in prose', () => {
    expect(collect('<!DOCTYPE html>\n<p>a < b</p>', n => n === 'p')).toEqual(['open:p', 'close:p']);
  });
});

describe('hunk fitting', () => {
  it('trimEdgeBlank drops blank edge lines without touching the first indent', () => {
    expect(planr.trimEdgeBlank('\n   \n    <li>a</li>\n\n  ')).toBe('    <li>a</li>');
  });
  it('childIndent copies what existing children use, else one level in', () => {
    const doc = '  <plan-section id="s">\n      <p>deep</p>\n  </plan-section>';
    expect(planr.childIndent(doc, planr.findSectionById(doc, 's'))).toBe('      ');   // matches the sibling
    const empty = '  <plan-section id="s"></plan-section>';
    expect(planr.childIndent(empty, planr.findSectionById(empty, 's'))).toBe('    '); // own line + 2
  });
  it('fitBlock indents only a hunk that carries no indentation of its own', () => {
    expect(planr.fitBlock('<li>a</li>\n<li>b</li>', '  ')).toBe('  <li>a</li>\n  <li>b</li>');
    expect(planr.fitBlock('    <li>a</li>', '  ')).toBe('    <li>a</li>');   // author's own wins
    expect(() => planr.fitBlock('  \n \n', '  ')).toThrow(planr.PlanError);
  });
});

describe('container + heading scoping', () => {
  const doc = [
    '<plan-section id="p">',
    '  <h3>Own</h3>',
    '  <plan-callout><ul><li>buried but mine</li></ul></plan-callout>',
    '  <plan-section id="k"><h3>Kid</h3><ul><li>kid</li></ul></plan-section>',
    '</plan-section>',
  ].join('\n');
  const node = () => planr.findSectionById(doc, 'p');
  it('ownElements reaches nested containers but stops at a child section', () => {
    const uls = planr.ownElements(doc, node(), 'ul');
    expect(uls).toHaveLength(1);
    expect(planr.textOf(doc, uls[0])).toBe('buried but mine');
  });
  it('ownHeadings likewise excludes a child section\'s headings', () => {
    expect(planr.ownHeadings(doc, node()).map(h => planr.textOf(doc, h))).toEqual(['Own']);
  });
  it('resolveContainer names which match it took when several exist', () => {
    const two = '<plan-section id="s"><ul id="first"><li>1</li></ul><ul><li>2</li></ul></plan-section>';
    const n = planr.findSectionById(two, 's');
    expect(planr.resolveContainer(two, n, 'ul').label).toBe('ul:2 of 2');       // last wins, and says so
    expect(planr.textOf(two, planr.resolveContainer(two, n, 'ul:1').el)).toBe('1');
    expect(planr.textOf(two, planr.resolveContainer(two, n, '#first').el)).toBe('1');
  });
});

describe('builders', () => {
  it('buildSection emits attributes in canonical order and seeds a body', () => {
    const b = planr.buildSection({ id: 'x', num: '2', title: 'T', status: 'todo' }, '  ', null);
    expect(b).toContain('<plan-section id="x" num="2" title="T" status="todo">');
    expect(b).toContain('<p></p>');
  });
  it('sectionIds returns only TOP-LEVEL ids in order — nested ids are excluded', () => {
    //                        ┌─ 'a1' is nested inside 'a' ─┐
    const html = '<plan-section id="a"><plan-section id="a1"></plan-section></plan-section><plan-section id="b"></plan-section>';
    // Shallow BY DESIGN: assertIntact() must flag only accidental top-level
    // collapse, never an intentionally-removed nested child (deep would false-positive).
    expect(planr.sectionIds(html)).toEqual(['a', 'b']);   // 'a1' absent
  });
});

describe('bare-id addressing', () => {
  const NESTED = [
    '<plan-header title="T"></plan-header>',
    '<plan-section id="steps">',
    '  <plan-section id="s1">',
    '    <plan-subsection id="deep"></plan-subsection>',
    '  </plan-section>',
    '</plan-section>',
  ].join('\n');
  const idOf = el => planr.getAttr(el.attrsRaw, 'id');
  it('resolves a bare id at any depth, under either section tag', () => {
    expect(idOf(planr.resolveNode(NESTED, ['s1']))).toBe('s1');
    expect(planr.resolveNode(NESTED, ['deep']).tag).toBe('plan-subsection');
  });
  it('walks on from a bare first segment exactly as from a top-level one', () => {
    expect(idOf(planr.resolveNode(NESTED, ['s1', 'deep']))).toBe('deep');
    expect(idOf(planr.resolveNode(NESTED, ['s1', '1']))).toBe('deep');
  });
  it('refuses an id two sections carry, naming each full path', () => {
    const dup = '<plan-section id="a"><plan-section id="x"></plan-section></plan-section>' +
                '<plan-section id="b"><plan-section id="x"></plan-section></plan-section>';
    expect(() => planr.resolveNode(dup, ['x']))
      .toThrow(/section id 'x' is used 2 times — address one by its full path: a\.x \(line 1\), b\.x \(line 1\)/);
  });
  it('canonicalAddress names the full path however the node was addressed', () => {
    expect(planr.canonicalAddress(NESTED, planr.resolveNode(NESTED, ['deep']))).toBe('steps.s1.deep');
    expect(planr.canonicalAddress(NESTED, planr.resolveNode(NESTED, ['header']))).toBe('header');
  });
});

describe('dot-path addressing (regression guard for the bare-id fallback)', () => {
  const NESTED = '<plan-section id="steps"><plan-section id="s1"><plan-subsection id="deep"></plan-subsection></plan-section></plan-section>';
  it('keeps resolving every full dot-path, and reports a miss as before', () => {
    expect(planr.getAttr(planr.resolveNode(NESTED, ['steps', 's1', 'deep']).attrsRaw, 'id')).toBe('deep');
    expect(() => planr.resolveNode(NESTED, ['nope'])).toThrow(/section 'nope' not found/);
  });
});

describe('walkNodes (text and tags, backing read --text and text runs)', () => {
  const collect = (html, from = 0, to = html.length) => {
    const out = [];
    planr.walkNodes(html, from, to, t => {
      out.push(t.kind === 'text' ? `text:${html.slice(t.start, t.end)}` : `${t.kind}:${t.name}`);
    });
    return out;
  };
  it('reports text chunks between tags, in document order, with tag names lower-cased', () => {
    expect(collect('<p>a <B>b</B></p><br/>')).toEqual(['open:p', 'text:a ', 'open:b', 'text:b', 'close:b', 'close:p', 'self:br']);
  });
  it('skips a comment whole, and reads a bare < in prose as text', () => {
    expect(collect('x<!-- <p>no</p> -->y')).toEqual(['text:x', 'text:y']);
    expect(collect('a < b')).toEqual(['text:a < b']);
  });
  it('carries an open tag\'s raw attributes', () => {
    const toks = [];
    planr.walkNodes('<td class="x">1</td>', 0, 20, t => { toks.push(t); });
    expect(toks[0].attrsRaw).toBe(' class="x"');
  });
  it('resumes from the offset a visitor returns, and stays inside [from, to)', () => {
    const html = '<div><em>skip</em>kept</div>';
    const out = [];
    planr.walkNodes(html, 0, html.length, t => {
      out.push(t.kind === 'text' ? html.slice(t.start, t.end) : t.name);
      if (t.kind === 'open' && t.name === 'em') return html.indexOf('</em>') + 5;
    });
    expect(out).toEqual(['div', 'em', 'kept', 'div']);
    expect(collect('<p>abc</p>', 3, 6)).toEqual(['text:abc']);
  });
});

describe('text-addressed matching', () => {
  it('matchSelection accepts --nth or --all, never both, never a non-number', () => {
    expect(planr.matchSelection({})).toEqual({ nth: null, all: false });
    expect(planr.matchSelection({ nth: '2' })).toEqual({ nth: 2, all: false });
    expect(planr.matchSelection({ all: true })).toEqual({ nth: null, all: true });
    expect(() => planr.matchSelection({ nth: '0' })).toThrow(/--nth expects a 1-based number, got "0"/);
    expect(() => planr.matchSelection({ nth: true })).toThrow(/--nth expects a 1-based number/);
    expect(() => planr.matchSelection({ nth: '1', all: true })).toThrow(/use only one of --nth \/ --all/);
  });
  it('matchNeedle decodes entities and collapses whitespace in --match', () => {
    expect(planr.matchNeedle({ match: '  Queue &amp;\n  Retry ' }, 'strike')).toEqual({ raw: '  Queue &amp;\n  Retry ', needle: 'queue & retry' });
    expect(() => planr.matchNeedle({}, 'strike')).toThrow(/strike requires --match <text>/);
    expect(() => planr.matchNeedle({ match: '   ' }, 'strike')).toThrow(/--match needs visible text/);
  });
  it('pickMatches misses, lists numbered candidates, and honours --nth and --all', () => {
    const opts = { raw: 'q', noun: 'item', where: "'s'", describe: h => h };
    expect(() => planr.pickMatches([], { ...opts, sel: { nth: null, all: false } })).toThrow(/^no item matching "q" in 's'$/);
    expect(() => planr.pickMatches(['a', 'b'], { ...opts, sel: { nth: null, all: false } }))
      .toThrow(/"q" matches 2 items in 's' — narrow it, pick one with --nth <n>, or pass --all:\n {2}1\. a\n {2}2\. b/);
    expect(planr.pickMatches(['a', 'b'], { ...opts, sel: { nth: 2, all: false } })).toEqual(['b']);
    expect(planr.pickMatches(['a', 'b'], { ...opts, sel: { nth: null, all: true } })).toEqual(['a', 'b']);
    expect(() => planr.pickMatches(['a'], { ...opts, sel: { nth: 3, all: false } })).toThrow(/--nth 3: "q" matches 1 item in 's'/);
  });
  it('findItems keeps the innermost matching item and skips a nested section\'s', () => {
    const html = '<plan-section id="s"><ul><li>outer<ul><li>inner hit</li></ul></li></ul>' +
                 '<plan-section id="k"><ul><li>hit in kid</li></ul></plan-section></plan-section>';
    const node = planr.findSectionById(html, 's');
    expect(planr.findItems(html, node, node, 'hit').map(el => planr.textOf(html, el))).toEqual(['inner hit']);
    expect(planr.findItems(html, node, node, 'outer').map(el => planr.textOf(html, el))).toEqual(['outer inner hit']);
  });
  it('removeItem takes a lone item\'s whole line, and only the element when it shares one', () => {
    const lone = '<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>';
    expect(planr.removeItem(lone, planr.findElements(lone, 'li')[0])).toBe('<ul>\n  <li>b</li>\n</ul>');
    const shared = '<ul><li>a</li><li>b</li></ul>';
    expect(planr.removeItem(shared, planr.findElements(shared, 'li')[1])).toBe('<ul><li>a</li></ul>');
  });
});

describe('findTextRuns', () => {
  const runsIn = (html, needle) => {
    const node = planr.findSectionById(html, 's');
    return planr.findTextRuns(html, node, node, needle).map(r => ({ text: html.slice(r.start, r.end), crosses: r.crosses }));
  };
  it('matches decoded, whitespace-collapsed text and returns the source range', () => {
    const html = '<plan-section id="s"><p>Tom &amp; Jerry\n   ran</p></plan-section>';
    expect(runsIn(html, 'tom & jerry ran')).toEqual([{ text: 'Tom &amp; Jerry\n   ran', crosses: false }]);
  });
  it('flags a run whose ends sit in different elements', () => {
    const html = '<plan-section id="s"><p>go to <code>ops</code> now</p></plan-section>';
    expect(runsIn(html, 'to ops')).toEqual([{ text: 'to <code>ops', crosses: true }]);
    expect(runsIn(html, 'ops')).toEqual([{ text: 'ops', crosses: false }]);
  });
  it('finds every non-overlapping occurrence, skipping comments and nested sections', () => {
    const html = '<plan-section id="s"><p>aa aa</p><!-- aa --><plan-section id="k"><p>aa</p></plan-section></plan-section>';
    expect(runsIn(html, 'aa')).toHaveLength(2);
  });
});

describe('visibleUnits (the one tag-to-text rule)', () => {
  const text = (html, skip) => planr.visibleText(html, 0, html.length, skip);
  it('adds nothing for an inline tag and one space for a block boundary', () => {
    expect(text('<li>Alerts to <code>ops</code>.</li><li>next</li>')).toBe('Alerts to ops. next ');
    expect(text('<p>a</p>\n\n  <p>b</p>')).toBe('a b ');
  });
  it('decodes entities and collapses whitespace runs', () => {
    expect(text('<p>Tom &amp;\n    Jerry &mdash; &#8594;</p>')).toBe('Tom & Jerry — → ');
  });
  it('keeps every unit\'s source span, and counts element boundaries in seg', () => {
    const html = '<p>a&amp;<b>b</b></p>';
    const units = planr.visibleUnits(html, 0, html.length);
    expect(units.map(u => html.slice(u.start, u.end))).toEqual(['a', '&amp;', 'b', '</p>']);
    expect(units[1].seg).not.toBe(units[2].seg);
  });
  it('reads a skipped range as a block and never enters it', () => {
    const html = '<div>x<plan-section id="k">hidden</plan-section>y</div>';
    const k = planr.findSectionById(html, 'k');
    expect(text(html, [[k.outerStart, k.outerEnd]])).toBe('x y ');
  });
});
