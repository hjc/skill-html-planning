import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, posix, win32 } from 'node:path';
import { PLANR_URL, SKILL_DIR } from './helpers.js';

// The planr side of the inline loader, in-process: the hint `new` bakes
// (skillHrefFor), finding a document's loader (findLoader), rewriting it in
// place (planLoader, `planr loader`) and the `check` warning (lintLoader). The
// loader's own behaviour in a page is tests/shell-loader.test.js.

let planr;
beforeAll(async () => { const m = await import(PLANR_URL); planr = m.default ?? m; });

// The loader every plan carried before data-planr-loader="2" (abridged; only
// its shape matters here: no attributes, names plan-runtime.js).
const V1_LOADER = [
  '<script>',
  '    (function() {',
  "      var segs = location.pathname.split('/');",
  "      var root = segs.slice(0, segs.indexOf('.claude') + 1).join('/');",
  "      var skillBase = root + '/skills/html-planning';",
  "      var script = document.createElement('script');",
  "      script.src = skillBase + '/plan-runtime.js';",
  '    })();',
  '  </script>',
].join('\n');
const shippedShell = () => readFileSync(join(SKILL_DIR, 'templates', '_shell.html'), 'utf8');
const legacyDoc = (eol = '\n') => [
  '<!DOCTYPE html>', '<html lang="en">', '<head>', '  <title>T</title>',
  '  <!-- ── Inline loader: resolves .claude/ from any plan depth ── -->',
  `  ${V1_LOADER}`, '</head>', '<body>',
  '<plan-header title="T" status="draft"></plan-header>', '<main>',
  '<plan-section id="a" title="A"></plan-section>', '</main>', '</body>', '</html>', '',
].join('\n').replace(/\n/g, eol);

describe('skillHrefFor — the relative path new bakes into the loader', () => {
  it('climbs from the plan to the skill, in URL form, on either platform', () => {
    expect(planr.skillHrefFor('/r/docs/plans/x/map.html', '/r/.claude/skills/html-planning', posix))
      .toBe('../../../.claude/skills/html-planning');
    expect(planr.skillHrefFor('C:\\r\\.plans\\y\\p.html', 'C:\\r\\.claude\\skills\\html-planning', win32))
      .toBe('../../.claude/skills/html-planning');
    expect(planr.skillHrefFor('/r/.claude/plans/a.html', '/r/.claude/skills/html-planning', posix))
      .toBe('../skills/html-planning');
    expect(planr.skillHrefFor('/r/.claude/skills/html-planning/p.html', '/r/.claude/skills/html-planning', posix))
      .toBe('.');
  });
  it('percent-encodes each segment, so the value is safe in a URL and an attribute', () => {
    expect(planr.skillHrefFor('/r/p.html', '/r/My Repo #1/"q"&/skill', posix))
      .toBe('My%20Repo%20%231/%22q%22%26/skill');
  });
  it('is empty when no relative path exists (another drive)', () => {
    expect(planr.skillHrefFor('D:\\docs\\p.html', 'C:\\r\\.claude\\skills\\x', win32)).toBe('');
  });
});

describe('findLoader', () => {
  it('reads a version-2 loader and its hint', () => {
    const html = planr.render(shippedShell(), { skillSubpath: 'skills/x', skillHref: '../.claude/skills/x' });
    const l = planr.findLoader(html);
    expect(l.version).toBe(2);
    expect(l.href).toBe('../.claude/skills/x');
    expect(html.slice(l.start, l.end)).toMatch(/^<script data-planr-loader="2"[\s\S]*<\/script>$/);
  });
  it('reads a loader with no data-planr-loader as version 1', () => {
    const l = planr.findLoader(legacyDoc());
    expect(l).toMatchObject({ version: 1, href: '' });
    expect(legacyDoc().slice(l.start, l.end)).toBe(V1_LOADER);
  });
  it('ignores a script with a src, and anything after <body>', () => {
    expect(planr.findLoader('<head><script src="plan-runtime.js"></script></head><body></body>')).toBeNull();
    expect(planr.findLoader('<head></head><body><script>"plan-runtime.js"</script></body>')).toBeNull();
  });
});

describe("planLoader — rewriting a document's loader in place", () => {
  const vars = { skillSubpath: 'skills/html-planning', skillHref: '../../.claude/skills/html-planning' };
  it('upgrades a version-1 loader and leaves every other byte alone', () => {
    const before = legacyDoc();
    const { html, message } = planr.planLoader(before, shippedShell(), vars);
    const at = before.indexOf(V1_LOADER);
    expect(html.slice(0, at)).toBe(before.slice(0, at));
    expect(html.endsWith(before.slice(at + V1_LOADER.length))).toBe(true);
    expect(planr.findLoader(html)).toMatchObject({ version: 2, href: vars.skillHref });
    expect(message).toBe("loader upgraded from v1 to v2 (data-skill-href '../../.claude/skills/html-planning')");
  });
  it('writes exactly the loader a fresh `new` would write', () => {
    const fresh = planr.render(shippedShell(), vars);
    const l = planr.findLoader(fresh);
    expect(planr.planLoader(legacyDoc(), shippedShell(), vars).html).toContain(fresh.slice(l.start, l.end));
  });
  it('keeps a CRLF document CRLF throughout', () => {
    const { html } = planr.planLoader(legacyDoc('\r\n'), shippedShell(), vars);
    expect(html.replace(/\r\n/g, '')).not.toContain('\n');
  });
  it('is a no-op on a current loader, and a refresh on a stale hint', () => {
    const once = planr.planLoader(legacyDoc(), shippedShell(), vars).html;
    expect(planr.planLoader(once, shippedShell(), vars)).toEqual({ html: once, message: 'loader already current' });
    const moved = planr.planLoader(once, shippedShell(), { ...vars, skillHref: '../.claude/skills/html-planning' });
    expect(moved.message).toBe(
      "loader refreshed (data-skill-href '../../.claude/skills/html-planning' → '../.claude/skills/html-planning')");
  });
  it('refuses a document with no loader', () => {
    expect(() => planr.planLoader('<plan-header title="T"></plan-header>', shippedShell(), vars))
      .toThrow(/no inline loader/);
  });
});

describe('lintLoader — check reports a loader that cannot find the skill', () => {
  const v2 = (href) => planr.render(shippedShell(), { skillSubpath: 'skills/html-planning', skillHref: href });
  const css = '/r/.claude/skills/html-planning/plan-styles.css';
  const readDoc = (p) => (p === css ? 'css' : null);
  it('warns on a version-1 loader outside .claude, on its line, and names the fix', () => {
    const w = planr.lintLoader(legacyDoc(), { docAbs: '/r/docs/plans/p.html', readDoc });
    expect(w).toHaveLength(1);
    expect(w[0].line).toBe(6);
    expect(w[0].text).toMatch(/only from inside a \.claude directory.*`planr loader <file>`/);
  });
  it('is silent on a version-1 loader inside .claude: those plans still render', () => {
    expect(planr.lintLoader(legacyDoc(), { docAbs: 'C:\\r\\.claude\\plans\\p.html', readDoc })).toEqual([]);
  });
  it('warns on a hint that does not reach plan-styles.css', () => {
    const w = planr.lintLoader(v2('../.claude/skills/html-planning'), { docAbs: '/r/docs/plans/p.html', readDoc });
    expect(w).toHaveLength(1);
    expect(w[0].text).toContain(
      "data-skill-href '../.claude/skills/html-planning' does not reach /r/docs/.claude/skills/html-planning/plan-styles.css");
  });
  it('is silent on a hint that reaches it, decoding an encoded one', () => {
    expect(planr.lintLoader(v2('../../.claude/skills/html-planning'), { docAbs: '/r/docs/plans/p.html', readDoc })).toEqual([]);
    const spaced = (p) => (p === '/my r/.claude/skills/html-planning/plan-styles.css' ? 'css' : null);
    expect(planr.lintLoader(v2('../.claude/skills/html-planning'), { docAbs: '/my r/docs/p.html', readDoc: spaced })).toEqual([]);
  });
  it('needs the document path: templates and other path-less callers get nothing', () => {
    expect(planr.lintLoader(legacyDoc(), {})).toEqual([]);
    expect(planr.planCheck(legacyDoc()).warnings.filter((w) => /loader/.test(w.text))).toEqual([]);
  });
});
