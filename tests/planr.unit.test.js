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
