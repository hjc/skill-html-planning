import { describe, it, expect, beforeAll } from 'vitest';
import { PLANR_URL } from './helpers.js';

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

describe('planList', () => {
  it('formats header + numbered top level + indented child', () => {
    const out = planr.planList(DOC);
    expect(out).toMatch(/^# T {2}\[draft\]/);
    expect(out).toMatch(/\n1\. a .* Alpha/);
    expect(out).toMatch(/\n {4}a1 .*\[todo\]/);   // depth-1, 4-space indent
  });
});

describe('planTasks', () => {
  it('lists open tasks and honors --status / --all', () => {
    expect(planr.planTasks(DOC, {})).toMatch(/a\.a1\s+\[todo\]/);
    expect(planr.planTasks(DOC, { status: 'done' })).toBe('no open tasks\n');
    expect(planr.planTasks(DOC, { all: true })).toContain('a.a1');
  });
});

describe('planSet', () => {
  it('returns mutated html + message on success', () => {
    const { html, message } = planr.planSet(DOC, 'a.a1.status=done');
    expect(html).toContain('id="a1" status="done"');
    expect(message).toBe('set a.a1.status = "done"');
  });
  it('throws PlanError on bad spec / attr / status', () => {
    expect(() => planr.planSet(DOC, 'a.a1.status')).toThrow(planr.PlanError);
    expect(() => planr.planSet(DOC, 'a.color=red')).toThrow(/unknown attribute 'color'/);
    expect(() => planr.planSet(DOC, 'a.a1.status=nope')).toThrow(/invalid status 'nope'/);
  });
});

describe('planAddSection', () => {
  it('places a top-level section --after AND --before a ref', () => {
    const after = planr.planAddSection(DOC, { id: 'x', after: 'a' }, null);
    expect(planr.sectionIds(after.html)).toEqual(['a', 'x', 'b', 'c']);
    expect(after.message).toBe("added section 'x'");

    const before = planr.planAddSection(DOC, { id: 'x', before: 'a' }, null);
    expect(planr.sectionIds(before.html)).toEqual(['x', 'a', 'b', 'c']);
  });
  it('places a child --after AND --before a sibling under --parent', () => {
    const after = planr.planAddSection(DOC, { id: 'a2', parent: 'a', after: 'a1' }, null).html;
    expect(childIds(after, 'a')).toEqual(['a1', 'a2']);

    const before = planr.planAddSection(DOC, { id: 'a0', parent: 'a', before: 'a1' }, null).html;
    expect(childIds(before, 'a')).toEqual(['a0', 'a1']);
  });
  it('rejects --after together with --before', () => {
    expect(() => planr.planAddSection(DOC, { id: 'x', after: 'a', before: 'b' }, null))
      .toThrow(/only one of --after/);
  });
  it('throws on a duplicate id and on a missing --id', () => {
    expect(() => planr.planAddSection(DOC, { id: 'a' }, null)).toThrow(/already exists/);
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

describe('resolveNode error path (now throwing, not exiting)', () => {
  it('throws PlanError on an unknown address', () => {
    expect(() => planr.planRead(DOC, 'nope', {})).toThrow(planr.PlanError);
  });
});
