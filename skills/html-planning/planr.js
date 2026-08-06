#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   planr — generate and manipulate plan files
   Generates a plan from a template, and reads/mutates an existing plan by
   ADDRESS so an edit costs tokens proportional to the change, not the whole
   document.

   Usage:
     node planr.js new         <file> [--title T] [--template <name>] [--set k=v ...]
     node planr.js templates    (list available templates)
     node planr.js list        <file>
     node planr.js tasks       <file> [--all | --status <s>]
     node planr.js read        <file> <address> [--body]
     node planr.js set         <file> <path>=<value>
     node planr.js set-body    <file> <address> [--file <f>] [--append]
     node planr.js add-section <file> --id <id> [--num N] [--title T] [--status S]
                               [--parent <addr>] [--after <addr> | --before <addr>] [--body-file <f>]
     node planr.js rm-section  <file> <address>
     node planr.js move-section <file> <address> (--after <addr> | --before <addr>)

   Addressing (dot-paths, any depth):
     header                     → the <plan-header>
     <sectionId>                → a top-level <plan-section id="…">
     <sectionId>.<child>[.…]    → a descendant, each segment an id or a 1-based
                                  ordinal among its siblings
   EVERY address argument uses this one grammar — the positional <address>,
   --parent, and --after/--before alike. In `set`, the LAST path segment is the
   attribute instead (e.g. steps.3.status=done).

   Templates live in ./templates/ — `_shell.html` is the shared document +
   runtime loader (with a `{{body}}` slot); every other `<name>.html` is a body
   selectable via `--template <name>`. Values are filled with a zero-dep
   `{{var}}` substitution: {{title}}, {{date}}, {{skillSubpath}}, plus any
   `--set key=value`. Zero dependencies throughout — the <plan-*> scanner and
   the templater keep the tool install-free.
   ═══════════════════════════════════════════════════════════ */

'use strict';
const fs = require('fs');
const path = require('path');

/* ── tiny IO + error helpers ──────────────────────────── */
// A user-facing, expected failure. Shells map it to die(); tests assert it.
// Anything that is NOT a PlanError is a bug and propagates as a raw stack.
class PlanError extends Error {}
function die(msg) {
  process.stderr.write(`planr: ${msg}\n`);
  process.exit(1);
}
function read(file) {
  try { return fs.readFileSync(file, 'utf8'); }
  catch (e) { throw new PlanError(`cannot read '${file}': ${e.message}`); }
}
function write(file, html) {
  try { fs.writeFileSync(file, html, 'utf8'); }
  catch (e) { throw new PlanError(`cannot write '${file}': ${e.message}`); }
}
// A flag's string value, or null when the flag is absent or was passed with no
// value (parseFlags stores that as `true`). Repeats: the last one wins.
function flagValue(flags, key) {
  const v = key ? flags[key] : undefined;
  if (v == null || v === true) return null;
  return String(Array.isArray(v) ? v[v.length - 1] : v);
}
function readStdin() {
  if (process.stdin.isTTY) throw new PlanError('no --file given and no stdin piped; use --file <f> or pipe content on stdin');
  try { return fs.readFileSync(0, 'utf8'); }
  catch (e) { throw new PlanError(`cannot read stdin: ${e.message}`); }
}

/* ── templating (generate) ────────────────────────────────
   Zero-dep {{var}} substitution — a function replacer, so `$` in values is
   never reinterpreted. Unknown placeholders are left intact. */
function render(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}
// The skill's install subpath under .claude, from how planr was invoked:
// argv[1] preserves the symlinked .claude/skills/<name> path that __dirname
// would resolve through. Baked into the generated plan's loader.
function resolveSkillSubpath(invoked = process.argv[1] || __filename) {
  invoked = invoked.replace(/\\/g, '/');
  const segs = invoked.split('/');
  const idx = segs.indexOf('.claude');
  if (idx !== -1) return segs.slice(idx + 1, segs.length - 1).join('/');
  return 'skills/' + path.basename(path.dirname(invoked));
}
const TEMPLATE_DIR = path.join(__dirname, 'templates');

function cmdNew(outPath, flags) {
  if (!outPath) throw new PlanError('new requires an output path, e.g. `new plan.html --template tdd`');
  const template = flagValue(flags, 'template') || 'basic';
  if (template.startsWith('_')) throw new PlanError(`'${template}' is not a selectable template`);
  const bodyPath = path.join(TEMPLATE_DIR, `${template}.html`);
  if (!fs.existsSync(bodyPath)) throw new PlanError(`unknown template '${template}' — run \`planr templates\` to list`);
  const composed = read(path.join(TEMPLATE_DIR, '_shell.html')).split('{{body}}').join(read(bodyPath));
  const vars = {
    title: flagValue(flags, 'title') || 'Untitled Plan',
    date: new Date().toISOString().slice(0, 10),
    skillSubpath: resolveSkillSubpath(),
  };
  for (const pair of (flags.set == null ? [] : [].concat(flags.set))) {
    const eq = String(pair).indexOf('=');
    if (eq === -1) throw new PlanError(`--set expects key=value, got "${pair}"`);
    vars[String(pair).slice(0, eq)] = String(pair).slice(eq + 1);
  }
  const parent = path.dirname(outPath);
  if (parent && !fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
  write(outPath, render(composed, vars));
  process.stdout.write(`Created ${outPath} (template: ${template})\n`);
}

/* ── line helpers ─────────────────────────────────────── */
function lineStart(s, idx) {
  return s.lastIndexOf('\n', idx - 1) + 1; // 0 when no preceding newline
}
function lineEndAfterNewline(s, idx) {
  const nl = s.indexOf('\n', idx);
  return nl === -1 ? s.length : nl + 1;
}

/* ── comment awareness ────────────────────────────────────
   The scanner matches literal <plan-*> tag names, so a raw plan tag written
   inside an HTML comment (an illustrative example, a commented-out section)
   would otherwise be found as a real element. We compute comment ranges once
   per source string and skip any tag match that falls inside one. */
function findCommentRanges(html) {
  const ranges = [];
  let i = 0;
  while (true) {
    const open = html.indexOf('<!--', i);
    if (open === -1) break;
    const close = html.indexOf('-->', open + 4);
    const end = close === -1 ? html.length : close + 3; // unterminated → to EOF
    ranges.push([open, end]);
    i = end;
  }
  return ranges;
}
let _lastHtml = null, _lastRanges = null;
function commentRanges(html) {
  if (html !== _lastHtml) { _lastHtml = html; _lastRanges = findCommentRanges(html); }
  return _lastRanges;
}
function inRanges(idx, ranges) {
  for (const [s, e] of ranges) {
    if (idx < s) break;    // ranges ascending — no later range can contain idx
    if (idx < e) return true;
  }
  return false;
}

/* ── tag scanner ──────────────────────────────────────────
   readOpenTag: given the index of a '<' beginning `<name …>`, walk to the
   closing '>' while skipping quoted attribute values (so a '>' inside an
   attribute doesn't end the tag early). Returns the tag name, the raw
   attribute span [attrStart, attrEnd), and the index just past '>'. */
function readOpenTag(html, ltIndex) {
  let i = ltIndex + 1;
  let name = '';
  while (i < html.length && /[A-Za-z0-9-]/.test(html[i])) { name += html[i]; i++; }
  const attrStart = i;
  let quote = null;
  while (i < html.length) {
    const c = html[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      const selfClose = html[i - 1] === '/';
      return { name, attrStart, attrEnd: selfClose ? i - 1 : i, openEnd: i + 1, selfClose };
    }
    i++;
  }
  return null; // unterminated tag
}

// Is the char after `<tag` a real tag boundary (space, '>', '/') and not the
// continuation of a longer tag name?
function isBoundary(ch) { return ch === undefined || /[\s>/]/.test(ch); }

// Find the matching `</tag>` for an open tag, depth-counting nested same-name
// elements. Returns {start, end} of the close tag, or null.
function findClose(html, tag, from) {
  const comments = commentRanges(html);
  const openTok = '<' + tag;
  const closeTok = '</' + tag + '>';
  // Next occurrence of `tok` at/after `i` that is NOT inside a comment.
  const nextTok = (tok, i) => {
    let idx = html.indexOf(tok, i);
    while (idx !== -1 && inRanges(idx, comments)) idx = html.indexOf(tok, idx + tok.length);
    return idx;
  };
  let depth = 1;
  let i = from;
  while (i < html.length) {
    const nextOpen = nextTok(openTok, i);
    const nextClose = nextTok(closeTok, i);
    if (nextClose === -1) return null;
    if (nextOpen !== -1 && nextOpen < nextClose && isBoundary(html[nextOpen + openTok.length])) {
      const open = readOpenTag(html, nextOpen);
      if (open && !open.selfClose) depth++;
      i = open ? open.openEnd : nextOpen + openTok.length;
    } else {
      depth--;
      if (depth === 0) return { start: nextClose, end: nextClose + closeTok.length };
      i = nextClose + closeTok.length;
    }
  }
  return null;
}

// Locate the first <tag> element at/after `from` and before `limit`.
function findElement(html, tag, from = 0, limit = null) {
  const cap = limit == null ? html.length : limit;
  const comments = commentRanges(html);
  let searchFrom = from;
  const tok = '<' + tag;
  while (true) {
    const idx = html.indexOf(tok, searchFrom);
    if (idx === -1 || idx >= cap) return null;
    if (inRanges(idx, comments) || !isBoundary(html[idx + tok.length])) { searchFrom = idx + tok.length; continue; }
    const open = readOpenTag(html, idx);
    if (!open) return null;
    if (open.selfClose) {
      return element(html, tag, idx, open.openEnd, open.openEnd, open.openEnd, open);
    }
    const close = findClose(html, tag, open.openEnd);
    if (!close) return null;
    return element(html, tag, idx, open.openEnd, close.start, close.end, open);
  }
}
function element(html, tag, outerStart, innerStart, innerEnd, outerEnd, open) {
  return {
    tag, outerStart, innerStart, innerEnd, outerEnd,
    attrStart: open.attrStart, attrEnd: open.attrEnd,
    attrsRaw: html.slice(open.attrStart, open.attrEnd),
  };
}

// All <tag> elements within [from, limit).
function findElements(html, tag, from = 0, limit = null) {
  const cap = limit == null ? html.length : limit;
  const out = [];
  let cursor = from;
  while (cursor < cap) {
    const el = findElement(html, tag, cursor, cap);
    if (!el) break;
    out.push(el);
    cursor = el.outerEnd;
  }
  return out;
}

/* ── attribute scanner / mutator ──────────────────────────
   scanAttrs walks a raw attribute span into {name, value, positions},
   quote-aware, handling boolean attributes (no value). All positions are
   relative to `raw`. */
function scanAttrs(raw) {
  const attrs = [];
  const n = raw.length;
  let i = 0;
  while (i < n) {
    while (i < n && /[\s/]/.test(raw[i])) i++;
    if (i >= n) break;
    const nameStart = i;
    while (i < n && /[\w-]/.test(raw[i])) i++;
    if (i === nameStart) { i++; continue; } // stray char
    const name = raw.slice(nameStart, i);
    const nameEnd = i;
    let j = i;
    while (j < n && /\s/.test(raw[j])) j++;
    if (raw[j] === '=') {
      j++;
      while (j < n && /\s/.test(raw[j])) j++;
      const q = raw[j];
      if (q === '"' || q === "'") {
        const valueStart = j + 1;
        let k = valueStart;
        while (k < n && raw[k] !== q) k++;
        attrs.push({ name, nameStart, nameEnd, hasValue: true, valueStart, valueEnd: k, value: raw.slice(valueStart, k), end: k + 1 });
        i = k + 1;
      } else {
        const valueStart = j;
        let k = j;
        while (k < n && !/\s/.test(raw[k])) k++;
        attrs.push({ name, nameStart, nameEnd, hasValue: true, valueStart, valueEnd: k, value: raw.slice(valueStart, k), end: k });
        i = k;
      }
    } else {
      attrs.push({ name, nameStart, nameEnd, hasValue: false, end: nameEnd });
      i = nameEnd;
    }
  }
  return attrs;
}
function getAttr(attrsRaw, name) {
  const a = scanAttrs(attrsRaw).find(a => a.name === name);
  return a ? (a.hasValue ? a.value : true) : undefined;
}
// Return a new attribute span with `name` set to `value`, preserving the
// existing formatting of all other attributes.
function setAttrRaw(raw, name, value) {
  if (value.indexOf('"') !== -1) throw new PlanError(`value for '${name}' may not contain a double-quote`);
  const found = scanAttrs(raw).find(a => a.name === name);
  if (found && found.hasValue) {
    return raw.slice(0, found.valueStart) + value + raw.slice(found.valueEnd);
  }
  if (found) { // boolean attr → give it a value
    return raw.slice(0, found.nameStart) + `${name}="${value}"` + raw.slice(found.end);
  }
  const trimmed = raw.replace(/\s+$/, '');
  return `${trimmed} ${name}="${value}"${raw.slice(trimmed.length)}`;
}

/* ── addressing ───────────────────────────────────────── */
function findSectionById(html, id) {
  return findElements(html, 'plan-section').find(s => getAttr(s.attrsRaw, 'id') === id) || null;
}
// Immediate child sections (either tag) of `node`, by ordinal or id. findElements
// returns the outermost matches in the range; the containment filter drops any
// grandchild that slipped in via the second tag's scan.
function childSections(html, from, to) {
  const all = [
    ...findElements(html, 'plan-section', from, to),
    ...findElements(html, 'plan-subsection', from, to),
  ].sort((a, b) => a.outerStart - b.outerStart);
  return all.filter(x => !all.some(y => y !== x && y.innerStart <= x.outerStart && x.outerEnd <= y.innerEnd));
}
function findChildSection(html, node, selector) {
  const kids = childSections(html, node.innerStart, node.innerEnd);
  if (/^\d+$/.test(selector)) return kids[parseInt(selector, 10) - 1] || null;
  return kids.find(k => getAttr(k.attrsRaw, 'id') === selector) || null;
}
/* ── section walk, numbering, display ─────────────────── */
// Attribute values live in the file HTML-escaped (that is what the browser
// decodes on render), so terminal output must decode them or a title reads
// `Scope &amp; Prerequisites`.
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(s) {
  return String(s).replace(/&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g, (m, k) => {
    if (k[0] !== '#') return NAMED_ENTITIES[k.toLowerCase()] ?? m;
    const code = k[1] === 'x' || k[1] === 'X' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  });
}

// Mirrors `_sectionNumber` in plan-runtime.js — the rendered number is derived
// from document position, NOT stored. A `num` attribute overrides this level; a
// DOTTED override is the complete number, so ancestors do not re-prefix it
// (else "5" + "5.1" would render "5.5.1"). Keep the two in step.
function sectionNumber(override, parentNum, ordinal) {
  const own = override != null && override !== true ? String(override) : String(ordinal);
  if (override != null && own.includes('.')) return own;
  return parentNum ? `${parentNum}.${own}` : own;
}

// Every section-like element in document order. `visit` receives the element
// plus its dot-address, derived number, and depth. One walk backs list, tasks,
// and the id scan, so those can never disagree about the tree.
function walkSections(html, visit) {
  const rec = (from, to, addrPrefix, parentNum, depth) => {
    childSections(html, from, to).forEach((el, i) => {
      const id = getAttr(el.attrsRaw, 'id');
      const addr = addrPrefix ? `${addrPrefix}.${id || i + 1}` : String(id || i + 1);
      const num = sectionNumber(getAttr(el.attrsRaw, 'num'), parentNum, i + 1);
      visit({ el, id, addr, num, depth });
      rec(el.innerStart, el.innerEnd, addr, num, depth + 1);
    });
  };
  rec(0, html.length, '', '', 0);
}

function resolveNode(html, segs) {
  if (segs[0] === 'header') {
    if (segs.length > 1) throw new PlanError('the header has no children');
    const el = findElement(html, 'plan-header');
    if (!el) throw new PlanError('no <plan-header> found');
    return el;
  }
  // Walk the dot-path to any depth: each segment selects a child of the previous.
  let node = findSectionById(html, segs[0]);
  if (!node) throw new PlanError(`section '${segs[0]}' not found`);
  for (let i = 1; i < segs.length; i++) {
    const child = findChildSection(html, node, segs[i]);
    if (!child) throw new PlanError(`'${segs[i]}' not found in '${segs.slice(0, i).join('.')}'`);
    node = child;
  }
  return node;
}

/* ── validation + structural safety ───────────────────────
   `set` guards against typo'd attribute names and non-canonical status values
   (both otherwise fail silently — a junk attribute, or a task that vanishes
   from `tasks`). Body-injecting commands re-verify the plan still parses after
   the splice, so an unbalanced/unescaped <plan-*> tag in content can't silently
   collapse the document (it would derail findClose's depth count). */
const NODE_ATTRS = {
  'plan-header': ['title', 'subtitle', 'status', 'date', 'chips'],
  'plan-section': ['id', 'num', 'title', 'status'],
  'plan-subsection': ['id', 'num', 'title', 'status'],
};
const SECTION_STATUS = ['todo', 'in-progress', 'done', 'blocked'];

// Top-level ids only, and SHALLOW BY DESIGN: this backs assertIntact, which
// must flag an accidental document collapse but NOT a nested child that a
// `set-body` replacement legitimately removed (deep would false-positive).
function sectionIds(html) {
  return findElements(html, 'plan-section').map(s => getAttr(s.attrsRaw, 'id')).filter(Boolean);
}
// Every id at every depth — for uniqueness checks. Ids must be unique
// document-wide: they are address segments and browser anchor targets.
function allSectionIds(html) {
  const ids = [];
  walkSections(html, ({ id }) => { if (id) ids.push(id); });
  return ids;
}
function assertIntact(before, after, action) {
  const present = new Set(sectionIds(after));
  const lost = sectionIds(before).filter(id => !present.has(id));
  if (lost.length) {
    throw new PlanError(`${action} would break the plan — section(s) no longer resolve: ${lost.join(', ')}. ` +
        `Likely an unbalanced or unescaped <plan-*> tag in the content (escape < > & in code). ` +
        `Aborted; no changes written.`);
  }
}

/* ── block builders / splicers (structural ops) ───────── */
function sectionIndent(html) {
  const comments = commentRanges(html);
  let idx = html.indexOf('<plan-section');
  while (idx !== -1 && inRanges(idx, comments)) idx = html.indexOf('<plan-section', idx + 1);
  if (idx === -1) return '';
  return html.slice(lineStart(html, idx), idx);
}
function buildSection(fields, indent, body) {
  const attrs = [
    fields.id != null ? `id="${fields.id}"` : null,
    fields.num != null && fields.num !== true ? `num="${fields.num}"` : null,
    fields.title != null && fields.title !== true ? `title="${fields.title}"` : null,
    fields.status != null && fields.status !== true ? `status="${fields.status}"` : null,
  ].filter(Boolean).join(' ');
  // A provided body is spliced verbatim (it owns its own whitespace); otherwise
  // seed an empty paragraph to fill in later via `set-body`.
  const inner = body != null ? body : `\n${indent}  <p></p>\n${indent}`;
  return `${indent}<plan-section ${attrs}>${inner}</plan-section>`;
}
function elementIndent(html, el) {
  return html.slice(lineStart(html, el.outerStart), el.outerStart);
}
// Insert a block as the last child inside a parent (before its closing tag line).
function insertInside(html, parent, block) {
  const pos = lineStart(html, parent.innerEnd);
  return html.slice(0, pos) + block + '\n\n' + html.slice(pos);
}
function insertBlock(html, ref, block, position) {
  if (position === 'before') {
    const pos = lineStart(html, ref.outerStart);
    return html.slice(0, pos) + block + '\n\n' + html.slice(pos);
  }
  const pos = lineEndAfterNewline(html, ref.outerEnd); // just past ref's closing line
  const tail = html.slice(pos);
  const lead = tail.startsWith('\n') ? '' : '\n';
  return html.slice(0, pos) + '\n' + block + '\n' + lead + tail;
}
function appendSection(html, block) {
  const mainClose = html.indexOf('</main>');
  if (mainClose !== -1) {
    const pos = lineStart(html, mainClose);
    return html.slice(0, pos) + block + '\n\n' + html.slice(pos);
  }
  const secs = findElements(html, 'plan-section');
  if (secs.length) return insertBlock(html, secs[secs.length - 1], block, 'after');
  return html.replace(/\s*$/, '') + '\n' + block + '\n';
}
// Remove a whole-line block, collapsing a double blank line at the seam.
function removeBlock(html, outerStart, outerEnd) {
  const from = lineStart(html, outerStart);
  let to = lineEndAfterNewline(html, outerEnd);
  const before = html.slice(0, from);
  let after = html.slice(to);
  const beforeBlank = /(^|\n)[ \t\r]*\n$/.test(before);
  const afterBlank = /^[ \t\r]*\n/.exec(after);
  if (beforeBlank && afterBlank) after = after.slice(afterBlank[0].length);
  return before + after;
}

/* ── pure cores (strings in → strings / structured result out) ──
   Each core is pure: it takes plan text (and args) and RETURNS a value —
   a string for read-only commands, or { html, message } for mutators —
   throwing PlanError on bad input. Cores never touch fs or process; the
   cmd* shells below own all IO. This makes command logic (and its error
   paths) directly unit-testable in-process. */

// Pure: html -> the `list` report text (trailing newline included).
function planList(html) {
  const out = [];
  const header = findElement(html, 'plan-header');
  if (header) {
    const title = getAttr(header.attrsRaw, 'title') || '(untitled)';
    const status = getAttr(header.attrsRaw, 'status');
    out.push(`# ${decodeEntities(title)}${status ? `  [${status}]` : ''}`);
  }
  walkSections(html, ({ el, id, num, depth }) => {
    const title = getAttr(el.attrsRaw, 'title');
    const status = getAttr(el.attrsRaw, 'status');
    out.push(`${'    '.repeat(depth)}${num}. ${id || '(no id)'}` +
             `${title ? ' — ' + decodeEntities(title) : ''}${status ? `  [${status}]` : ''}`);
  });
  return out.join('\n') + '\n';
}

// Pure: (html, flags) -> the `tasks` report text.
function planTasks(html, flags) {
  const want = flags.status && flags.status !== true ? String(flags.status).split(',') : null;
  const include = (st) => {
    if (!st) return false;
    if (want) return want.includes(st);
    return flags.all || st !== 'done';
  };
  const rows = [];
  walkSections(html, ({ el, addr }) => {
    const status = getAttr(el.attrsRaw, 'status');
    if (include(status)) rows.push({ addr, status, title: decodeEntities(getAttr(el.attrsRaw, 'title') || '') });
  });
  if (!rows.length) return 'no open tasks\n';
  const aw = Math.max(...rows.map(r => r.addr.length));
  const sw = Math.max(...rows.map(r => r.status.length));
  return rows.map(r => `${r.addr.padEnd(aw)}  [${r.status.padEnd(sw)}]  ${r.title}`).join('\n') + '\n';
}

// Pure: (html, address, flags) -> element outerHTML (+\n) or inner body.
// Throws via resolveNode on an unknown address.
function planRead(html, address, flags) {
  if (!address) throw new PlanError('read requires an address, e.g. `read plan.html steps`');
  const el = resolveNode(html, address.split('.'));
  return (flags && flags.body)
    ? html.slice(el.innerStart, el.innerEnd)
    : html.slice(el.outerStart, el.outerEnd) + '\n';
}

// Pure: dir entries -> sorted selectable template names.
function planTemplates(files) {
  return files.filter(f => f.endsWith('.html') && !f.startsWith('_'))
              .map(f => f.replace(/\.html$/, '')).sort();
}

// Pure: (html, "path=value") -> { html, message }; throws PlanError on bad input.
function planSet(html, spec) {
  if (!spec || spec.indexOf('=') === -1)
    throw new PlanError('set expects <path>=<value>, e.g. `set plan.html steps.status=done`');
  const eq = spec.indexOf('=');
  const pathPart = spec.slice(0, eq), value = spec.slice(eq + 1);
  const segs = pathPart.split('.');
  if (segs.length < 2) throw new PlanError('path must be <node>.<attr>, e.g. steps.status or steps.3.status');
  const attr = segs.pop();
  const node = resolveNode(html, segs);
  const allowed = NODE_ATTRS[node.tag];
  if (allowed && !allowed.includes(attr))
    throw new PlanError(`unknown attribute '${attr}' for <${node.tag}> — valid: ${allowed.join(', ')}`);
  if (attr === 'status' && (node.tag === 'plan-section' || node.tag === 'plan-subsection') &&
      !SECTION_STATUS.includes(value))
    throw new PlanError(`invalid status '${value}' — valid: ${SECTION_STATUS.join(', ')}`);
  const newRaw = setAttrRaw(node.attrsRaw, attr, value);
  return {
    html: html.slice(0, node.attrStart) + newRaw + html.slice(node.attrEnd),
    message: `set ${pathPart} = "${value}"`,
  };
}

// Pure: (html, address, body, {append}) -> { html, message }.
// Throws via resolveNode (bad address) or assertIntact (splice would break the plan).
function planSetBody(html, address, body, { append = false } = {}) {
  if (!address) throw new PlanError('set-body requires an address, e.g. `set-body plan.html caching`');
  const el = resolveNode(html, address.split('.'));
  const out = append
    ? html.slice(0, el.innerEnd) + body + html.slice(el.innerEnd)
    : html.slice(0, el.innerStart) + body + html.slice(el.innerEnd);
  assertIntact(html, out, 'set-body');
  return { html: out, message: `set body of ${address}${append ? ' (appended)' : ''} — ${body.length} chars` };
}

// Pure: (html, flags, body) -> { html, message }; throws on dup / missing id / bad ref.
// Body is passed in (the shell reads --body-file); the core never touches fs.
function planAddSection(html, flags, body /* string | null */) {
  if (!flags.id) throw new PlanError('add-section requires --id');
  if (flags.after && flags.before) throw new PlanError('use only one of --after / --before');
  if (allSectionIds(html).includes(flags.id)) throw new PlanError(`section '${flags.id}' already exists`);

  const position = flags.after ? 'after' : flags.before ? 'before' : null;
  const refAddr = flagValue(flags, position);
  const parentAddr = flagValue(flags, 'parent');
  let out, where;

  if (refAddr) {
    // The ref is a full address, so it fixes BOTH the position and the nesting
    // depth — --parent is redundant here, and contradicting it is an error
    // rather than a silently ignored flag.
    const ref = resolveNode(html, refAddr.split('.'));
    if (ref.tag === 'plan-header') throw new PlanError('cannot place a section relative to the header');
    const refParent = refAddr.split('.').slice(0, -1).join('.');
    if (parentAddr && parentAddr !== refParent)
      throw new PlanError(`--parent '${parentAddr}' contradicts --${position} '${refAddr}' ` +
        `(which sits in '${refParent || 'the top level'}') — the ref alone determines placement`);
    // Match the ref's own indentation: the new section is its sibling.
    out = insertBlock(html, ref, buildSection(flags, elementIndent(html, ref), body), position);
    where = ` ${position} '${refAddr}'`;
  } else if (parentAddr) {
    const parent = resolveNode(html, parentAddr.split('.'));
    out = insertInside(html, parent, buildSection(flags, elementIndent(html, parent) + '  ', body));
    where = ` under '${parentAddr}'`;
  } else {
    out = appendSection(html, buildSection(flags, sectionIndent(html), body));
    where = '';
  }
  assertIntact(html, out, 'add-section');
  return { html: out, message: `added section '${flags.id}'${where}` };
}

// Pure: (html, address) -> { html, message }; throws on unknown address or the header.
function planRmSection(html, address) {
  if (!address) throw new PlanError('rm-section requires a section address');
  const el = resolveNode(html, address.split('.'));
  if (el.tag === 'plan-header') throw new PlanError('cannot remove the header');
  return { html: removeBlock(html, el.outerStart, el.outerEnd), message: `removed '${address}'` };
}

// Pure: (html, address, flags) -> { html, message }; throws on missing/self ref or the header.
function planMoveSection(html, address, flags) {
  if (!address) throw new PlanError('move-section requires a section address');
  const position = flags.after ? 'after' : flags.before ? 'before' : null;
  if (!position) throw new PlanError('move-section requires --after <ref> or --before <ref>');
  if (flags.after && flags.before) throw new PlanError('use only one of --after / --before');
  const refAddr = flagValue(flags, position);
  if (!refAddr) throw new PlanError(`--${position} requires a section address`);
  if (address === refAddr) throw new PlanError('cannot move a section relative to itself');
  const el = resolveNode(html, address.split('.'));
  if (el.tag === 'plan-header') throw new PlanError('cannot move the header');
  const from = lineStart(html, el.outerStart);
  const to = lineEndAfterNewline(html, el.outerEnd);
  const block = html.slice(from, to).replace(/\n$/, '');
  let out = removeBlock(html, el.outerStart, el.outerEnd);
  const ref = resolveNode(out, String(refAddr).split('.'));   // resolve in the post-removal html
  return { html: insertBlock(out, ref, block, position), message: `moved '${address}' ${position} '${refAddr}'` };
}

/* ── commands (thin IO shells) ─────────────────────────
   Each shell: read the file, run the pure core, write / print. Validation and
   error text live in the cores (they throw PlanError); main() is the sole site
   that maps a PlanError to die(). */

// Read-only shell: read, run core, print.
function cmdList(file)               { process.stdout.write(planList(read(file))); }
function cmdTasks(file, flags)       { process.stdout.write(planTasks(read(file), flags)); }
function cmdRead(file, addr, flags)  { process.stdout.write(planRead(read(file), addr, flags)); }
function cmdTemplates() {
  let files;
  try { files = fs.readdirSync(TEMPLATE_DIR); }
  catch (e) { throw new PlanError(`cannot read templates dir: ${e.message}`); }
  process.stdout.write(planTemplates(files).join('\n') + '\n');
}

// Mutating shell: read, run core, write, print message.
function cmdSet(file, spec) {
  const { html, message } = planSet(read(file), spec);
  write(file, html); process.stdout.write(message + '\n');
}
function cmdSetBody(file, address, flags) {
  const src = flagValue(flags, 'file');
  const body = src ? read(src) : readStdin();
  const { html, message } = planSetBody(read(file), address, body, { append: !!flags.append });
  write(file, html); process.stdout.write(message + '\n');
}
function cmdAddSection(file, flags) {
  const src = flagValue(flags, 'body-file');
  const { html, message } = planAddSection(read(file), flags, src ? read(src) : null);
  write(file, html); process.stdout.write(message + '\n');
}
function cmdRmSection(file, address) {
  const { html, message } = planRmSection(read(file), address);
  write(file, html); process.stdout.write(message + '\n');
}
function cmdMoveSection(file, address, flags) {
  const { html, message } = planMoveSection(read(file), address, flags);
  write(file, html); process.stdout.write(message + '\n');
}

/* ── flag parsing + dispatch ──────────────────────────── */
function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = key in flags ? [].concat(flags[key], next) : next; // repeats accumulate
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

const USAGE = `planr — generate and manipulate plan files
Usage: node planr.js <command> [args]   (no args or --help prints this)

  new          <file> [--title T] [--template <name>] [--set k=v ...]
  templates    (list available templates)
  list         <file>
  tasks        <file> [--all | --status <s>]
  read         <file> <address> [--body]
  set          <file> <path>=<value>
  set-body     <file> <address> [--file <f>] [--append]   (body from --file or stdin)
  add-section  <file> --id <id> [--num N] [--title T] [--status S]
                      [--parent <addr>] [--after <addr> | --before <addr>] [--body-file <f>]
  rm-section   <file> <address>
  move-section <file> <address> (--after <addr> | --before <addr>)

address: header | <sectionId> | <sectionId>.<child> … (dot-path, any depth; a
         child is an id or a 1-based ordinal). Every address argument — the
         positional one, --parent, --after, --before — uses this grammar.
         --after/--before name a SIBLING, which also fixes the nesting depth,
         so --parent is only needed to append as the last child.
round-trip: read --body <addr> | edit | set-body <addr>  (byte-exact hunk edit)`;

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') { process.stdout.write(USAGE + '\n'); return; }
  const { flags, positional } = parseFlags(rest);
  const file = positional[0];
  // Validate the command first (so an unknown command reports as such), then
  // enforce the <file> arg only for commands that take one.
  const NEEDS_FILE = ['new', 'list', 'tasks', 'read', 'set', 'set-body', 'add-section', 'rm-section', 'move-section'];
  try {
    if (cmd !== 'templates' && !NEEDS_FILE.includes(cmd)) throw new PlanError(`unknown command '${cmd}'\n\n${USAGE}`);
    if (NEEDS_FILE.includes(cmd) && !file) throw new PlanError(`'${cmd}' requires a <file> argument`);
    switch (cmd) {
      case 'new':          return cmdNew(file, flags);
      case 'templates':    return cmdTemplates();
      case 'list':         return cmdList(file);
      case 'tasks':        return cmdTasks(file, flags);
      case 'read':         return cmdRead(file, positional[1], flags);
      case 'set':          return cmdSet(file, positional[1]);
      case 'set-body':     return cmdSetBody(file, positional[1], flags);
      case 'add-section':  return cmdAddSection(file, flags);
      case 'rm-section':   return cmdRmSection(file, positional[1]);
      case 'move-section': return cmdMoveSection(file, positional[1], flags);
      case 'help':         return process.stdout.write(USAGE + '\n');
      default:             throw new PlanError(`unknown command '${cmd}'\n\n${USAGE}`);
    }
  } catch (e) {
    if (e instanceof PlanError) die(e.message);   // the ONLY die() call site
    throw e;                                       // real bug → raw stack
  }
}
if (require.main === module) main();   // run the CLI only when invoked directly

module.exports = {
  render, resolveSkillSubpath, scanAttrs, getAttr, setAttrRaw, flagValue,
  findElement, findElements, findSectionById, childSections, resolveNode,
  buildSection, sectionIds, allSectionIds, walkSections, sectionNumber, decodeEntities,
  PlanError,
  planTemplates, planList, planTasks, planRead,
  planSet, planSetBody, planAddSection, planRmSection, planMoveSection,
};
