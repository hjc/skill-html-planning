#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   planr — generate and manipulate plan files
   Generates a plan from a template, and reads/mutates an existing plan by
   ADDRESS so an edit costs tokens proportional to the change, not the whole
   document.

   Usage:
     node planr.js new         <file> [--title T] [--template <name>] [--set k=v ...]
     node planr.js templates  [<name>]   (list templates; with a name, print its guidance)
     node planr.js list        <file> [--no-outline]
     node planr.js check       <file>
     node planr.js tasks       <file> [--all | --status <s>]
     node planr.js read        <file> <address> [--body]
     node planr.js set         <file> <path>=<value> [<path>=<value> ...]
     node planr.js set-body    <file> <address> [--file <f>] [--append]
     node planr.js prepend     <file> <address> [--file <f>] [--into <sel>]
     node planr.js append      <file> <address> [--file <f>] [--into <sel>]
     node planr.js insert      <file> <address> (--before-heading T | --after-heading T) [--file <f>]
     node planr.js badge       <file> --match <text> --set <type> [--in <addr>] [--nth N] [--all] [--text T]
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
   --parent, --after/--before, --in, and `new --set`'s dotted keys alike. In
   `set` (and `new --set`), the LAST path segment is the attribute instead
   (e.g. steps.3.status=done, header.status=review).

   Sub-section targeting (`--into <sel>`) is the ONE non-address selector, and
   it only ever names a plain HTML container inside an already-addressed
   section: `<tag>` (the LAST such element), `<tag>:<n>` (1-based), or `#<id>`.

   Templates live in ./templates/ — `_shell.html` is the shared document +
   runtime loader (with a `{{body}}` slot); every other `<name>.html` is a body
   selectable via `--template <name>`. Values fill via `{{var}}` substitution:
   {{title}}, {{date}}, {{skillSubpath}}, plus any BARE `--set key=value`.
   Writing a template: references/template-authoring.md.
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
   Zero-dep {{var}} substitution — a function replacer, so `$` in a value is
   never reinterpreted. `{{name:default}}` declares a default, which is how a
   template (not this file) decides what `--set` can fill. A placeholder with
   neither default nor value is left intact, so a missing required var is
   visible rather than silently empty.
   Authoring guide: references/template-authoring.md. */
const PLACEHOLDER = /\{\{(\w+)(?::([^}]*))?\}\}/g;
function render(tpl, vars) {
  return tpl.replace(PLACEHOLDER, (m, k, def) =>
    (k in vars ? vars[k] : (def !== undefined ? def : m)));
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
// Every {{placeholder}} the template offers, as {name, def}, sorted. `def` is
// undefined for a placeholder that declares none. First declaration wins, so a
// var used twice (title, in <title> and the header) reports one entry.
function templateVars(tpl) {
  const seen = new Map();
  for (const m of tpl.matchAll(PLACEHOLDER))
    if (!seen.has(m[1])) seen.set(m[1], { name: m[1], def: m[2] });
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/* ── template documentation ───────────────────────────────
   A template's leading HTML comment is its documentation, surfaced by
   `templates`. Only a comment before the first element counts; rule lines are
   dropped and the block de-indented. The convention, and why that comment must
   hold no literal <plan-*> tag: references/template-authoring.md. */
const RULE_LINE = /^[ \t]*[═─=-]{3,}[ \t]*$/;
function templateDoc(tpl) {
  const m = /^\s*<!--([\s\S]*?)-->/.exec(tpl);
  if (!m) return null;
  const lines = m[1].split('\n').filter(l => !RULE_LINE.test(l));
  // De-indent by the shallowest indentation any content line uses, so the
  // comment's internal structure (bullets, code samples) survives intact.
  const indents = lines.filter(l => l.trim()).map(l => /^[ \t]*/.exec(l)[0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  const text = lines.map(l => l.slice(cut)).join('\n').replace(/^\s*\n+/, '').replace(/\s+$/, '');
  return text || null;
}
// The leading comment is guidance for whoever is filling the template in, and
// `planr templates <name>` is where they read it. Stripped from what `new`
// writes, so a scaffolded document does not open with instructions to itself.
function stripTemplateDoc(tpl) {
  // Same leading-comment match templateDoc uses, so the two never disagree
  // about which comment is the guidance.
  const stripped = tpl.replace(/^\s*<!--[\s\S]*?-->/, '');
  return stripped === tpl ? tpl : stripped.replace(/^(?:[ \t]*\r?\n)+/, '');
}
// One-line gist for the `templates` table: the doc's first sentence, or its
// first paragraph when it has no sentence break.
function templateSummary(tpl) {
  const doc = templateDoc(tpl);
  if (!doc) return '';
  const para = doc.split(/\n[ \t]*\n/)[0].replace(/\s+/g, ' ').trim();
  const sentence = /^(.*?[.!?])(\s|$)/.exec(para);
  return sentence ? sentence[1] : para;
}

/* ── line helpers ─────────────────────────────────────── */
function lineStart(s, idx) {
  return s.lastIndexOf('\n', idx - 1) + 1; // 0 when no preceding newline
}
function lineEndAfterNewline(s, idx) {
  const nl = s.indexOf('\n', idx);
  return nl === -1 ? s.length : nl + 1;
}
// Offsets of every '\n' in the source (see sourceIndex — built once per string).
function lineOffsets(s) {
  const c = sourceIndex(s);
  let arr = c.lines;
  if (!arr) {
    arr = [];
    for (let i = s.indexOf('\n'); i !== -1; i = s.indexOf('\n', i + 1)) arr.push(i);
    c.lines = arr;
  }
  return arr;
}
// 1-based line number of an offset — for `check`'s problem report, which is
// read next to the file in an editor. Counted off the cached newline offsets:
// `check` asks once per section plus once per problem, and counting from the
// start of the string each time made that O(document) per call.
function lineOf(s, idx) {
  return firstAt(lineOffsets(s), idx) + 1;
}
// The leading whitespace of the line `idx` sits on.
function indentAt(s, idx) {
  const ls = lineStart(s, idx);
  return (/^[ \t]*/.exec(s.slice(ls, idx)) || [''])[0];
}
// The indentation a new child of `el` should take: whatever its existing
// children already use, so an inserted hunk lines up with its siblings rather
// than with a guess. Falls back to one level in from the element's own line.
function childIndent(s, el) {
  for (const line of s.slice(el.innerStart, el.innerEnd).split('\n')) {
    if (!line.trim()) continue;
    const m = /^[ \t]+/.exec(line);
    if (m) return m[0];
  }
  return indentAt(s, el.outerStart) + '  ';
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
/* Every scan in this file is a repeated indexOf over ONE immutable source
   string, so each derived index (comment ranges, tag-token offsets, newline
   offsets) is built lazily and keyed on string identity. One slot, as before:
   nothing interleaves two sources within a single operation. */
let _src = { html: null, comments: null, tokens: null, lines: null };
function sourceIndex(html) {
  if (_src.html !== html) _src = { html, comments: null, tokens: new Map(), lines: null };
  return _src;
}
function commentRanges(html) {
  const c = sourceIndex(html);
  return c.comments || (c.comments = findCommentRanges(html));
}
// Offsets of every occurrence of `tok` — always a `<name` or `</name>` token,
// which cannot overlap itself, so stepping by tok.length matches what a
// repeated indexOf would have found. Replaces that indexOf, which scanned to
// the END of the document even when the caller only cared about a range, so
// every range-limited lookup cost O(document) instead of O(range).
function tokenOffsets(html, tok) {
  const c = sourceIndex(html);
  let arr = c.tokens.get(tok);
  if (!arr) {
    arr = [];
    for (let i = html.indexOf(tok); i !== -1; i = html.indexOf(tok, i + tok.length)) arr.push(i);
    c.tokens.set(tok, arr);
  }
  return arr;
}
// Index of the first offset >= idx, by binary search (offsets are ascending).
function firstAt(offsets, idx) {
  let lo = 0, hi = offsets.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] < idx) lo = mid + 1; else hi = mid;
  }
  return lo;
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
// [A-Za-z0-9-] by char code: the name scan runs on every tag in the document,
// where a regex literal per character was the bulk of the cost.
function isNameCode(c) {
  return (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 45;
}
function tagNameEnd(html, nameStart) {
  let i = nameStart;
  while (i < html.length && isNameCode(html.charCodeAt(i))) i++;
  return i;
}
function readOpenTag(html, ltIndex) {
  return readAttrSpan(html, ltIndex, tagNameEnd(html, ltIndex + 1));
}
// The tail of an open tag, given the index just past its name. Split out
// because walkTags has already scanned that name and would otherwise pay for it
// a second time in here.
function readAttrSpan(html, ltIndex, attrStart) {
  const name = html.slice(ltIndex + 1, attrStart);
  let i = attrStart;
  let quote = 0;
  while (i < html.length) {
    const c = html.charCodeAt(i);
    if (quote) {
      if (c === quote) quote = 0;
    } else if (c === 34 || c === 39) {          // " '
      quote = c;
    } else if (c === 62) {                      // >
      const selfClose = html.charCodeAt(i - 1) === 47;   // /
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
  const openOffsets = tokenOffsets(html, openTok);
  const closeOffsets = tokenOffsets(html, closeTok);
  // Next occurrence of the token at/after `i` that is NOT inside a comment.
  const nextTok = (offsets, i) => {
    for (let k = firstAt(offsets, i); k < offsets.length; k++)
      if (!inRanges(offsets[k], comments)) return offsets[k];
    return -1;
  };
  let depth = 1;
  let i = from;
  while (i < html.length) {
    const nextOpen = nextTok(openOffsets, i);
    const nextClose = nextTok(closeOffsets, i);
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
  const tok = '<' + tag;
  const offsets = tokenOffsets(html, tok);
  for (let k = firstAt(offsets, from); k < offsets.length; k++) {
    const idx = offsets[k];
    if (idx >= cap) return null;
    if (inRanges(idx, comments) || !isBoundary(html[idx + tok.length])) continue;
    const open = readOpenTag(html, idx);
    if (!open) return null;
    if (open.selfClose) {
      return element(html, tag, idx, open.openEnd, open.openEnd, open.openEnd, open);
    }
    const close = findClose(html, tag, open.openEnd);
    if (!close) return null;
    return element(html, tag, idx, open.openEnd, close.start, close.end, open);
  }
  return null;   // no occurrence left in range
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

/* ── linear tag walk (backs `check`) ──────────────────────
   findElement/findElements answer "where is element X"; `check` needs the
   opposite — every tag token in document order, including the unbalanced ones
   that make findClose return null. Walks once, comment-aware, stepping over
   each open tag's attribute span so a '>' or a '<' inside a quoted value is
   never mistaken for a tag boundary. `keep(name)` filters what is reported. */
function walkTags(html, keep, visit) {
  const comments = commentRanges(html);
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;
    if (inRanges(lt, comments)) { i = lt + 1; continue; }
    const isClose = html.charCodeAt(lt + 1) === 47;   // /
    const nameStart = lt + (isClose ? 2 : 1);
    const j = tagNameEnd(html, nameStart);
    const name = html.slice(nameStart, j);
    if (!name) { i = lt + 1; continue; }          // <!DOCTYPE, a bare '<' in prose, …
    if (isClose) {
      const gt = html.indexOf('>', j);
      if (keep(name)) visit({ name, kind: 'close', index: lt });
      i = gt === -1 ? html.length : gt + 1;
    } else {
      const open = readAttrSpan(html, lt, j);      // name already scanned
      if (!open) { i = lt + 1; continue; }         // unterminated tag — nothing to balance
      if (keep(name)) visit({ name, kind: open.selfClose ? 'self' : 'open', index: lt });
      i = open.openEnd;
    }
  }
}

/* ── attribute scanner / mutator ──────────────────────────
   scanAttrs walks a raw attribute span into {name, value, positions},
   quote-aware, handling boolean attributes (no value). All positions are
   relative to `raw`. */
// Sticky char-class RUNS rather than one regex test per character: scanAttrs
// sits under every getAttr, which the section walks call several times per
// element. Shared lastIndex is safe — nothing here reenters mid-scan.
const RUN_SEP = /[\s/]*/y;        // separators between attributes
const RUN_NAME = /[\w-]*/y;       // an attribute name
const RUN_WS = /\s*/y;            // whitespace around '='
const RUN_UNQUOTED = /[^\s]*/y;   // an unquoted attribute value
function runEnd(re, raw, i) { re.lastIndex = i; re.exec(raw); return re.lastIndex; }
function scanAttrs(raw) {
  const attrs = [];
  const n = raw.length;
  let i = 0;
  while (i < n) {
    i = runEnd(RUN_SEP, raw, i);
    if (i >= n) break;
    const nameStart = i;
    i = runEnd(RUN_NAME, raw, i);
    if (i === nameStart) { i++; continue; } // stray char
    const name = raw.slice(nameStart, i);
    const nameEnd = i;
    let j = runEnd(RUN_WS, raw, i);
    if (raw[j] === '=') {
      j = runEnd(RUN_WS, raw, j + 1);
      const q = raw[j];
      if (q === '"' || q === "'") {
        const valueStart = j + 1;
        const closing = raw.indexOf(q, valueStart);
        const k = closing === -1 ? n : closing;
        attrs.push({ name, nameStart, nameEnd, hasValue: true, valueStart, valueEnd: k, value: raw.slice(valueStart, k), end: k + 1 });
        i = k + 1;
      } else {
        const valueStart = j;
        const k = runEnd(RUN_UNQUOTED, raw, j);
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
// Elements of `tag` that belong to THIS section — i.e. inside its body but not
// inside one of its nested sections. Without the filter, "the last <ul> in
// `decisions`" would happily return a list buried in a child section.
function ownElements(html, node, tag) {
  return ownIn(html, childSections(html, node.innerStart, node.innerEnd), node, tag);
}
// The same with the node's child sections already in hand — ownHeadings asks
// for six tags against one node, and would otherwise re-derive them per tag.
function ownIn(html, kids, node, tag) {
  return findElementsDeep(html, tag, node.innerStart, node.innerEnd)
    .filter(el => !kids.some(k => k.outerStart <= el.outerStart && el.outerEnd <= k.outerEnd));
}
// findElements returns only the OUTERMOST matches in a range; a container may
// sit at any depth (a <ul> inside a <plan-callout>), so recurse into each match
// to collect nested ones too, still in document order.
function findElementsDeep(html, tag, from, to) {
  const out = [];
  for (const el of findElements(html, tag, from, to)) {
    out.push(el);
    out.push(...findElementsDeep(html, tag, el.innerStart, el.innerEnd));
  }
  return out;
}
const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
// Authored headings owned by `node`, in document order. The runtime generates a
// section's own heading at render time, so every heading in the FILE is content.
function ownHeadings(html, node) {
  const kids = childSections(html, node.innerStart, node.innerEnd);
  return HEADING_TAGS.flatMap(t => ownIn(html, kids, node, t).map(el => ({ ...el, level: t })))
                     .sort((a, b) => a.outerStart - b.outerStart);
}
// Visible text of an element's inner HTML: tags dropped, entities decoded,
// whitespace collapsed. Used to match headings and table rows by what a reader
// sees, not by the markup that produces it.
function textOf(html, el) {
  return decodeEntities(html.slice(el.innerStart, el.innerEnd).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}
/* `--into <sel>` — the one non-address selector, scoped to an already-resolved
   section and limited to plain HTML containers: `<tag>` (the LAST one, which is
   what "append to the running list" means), `<tag>:<n>` (1-based), or `#<id>`. */
function resolveContainer(html, node, sel) {
  const byId = /^#(.+)$/.exec(sel);
  if (byId) {
    const el = findElementById(html, byId[1], node.innerStart, node.innerEnd);
    if (!el) throw new PlanError(`--into '${sel}': no element with id '${byId[1]}' in this section`);
    return { el, label: sel };
  }
  const m = /^([A-Za-z][A-Za-z0-9-]*)(?::(\d+))?$/.exec(sel);
  if (!m) throw new PlanError(`--into '${sel}': expected <tag>, <tag>:<n>, or #<id>`);
  const [, tag, nth] = m;
  if (tag.startsWith('plan-'))
    throw new PlanError(`--into '${sel}': address a <${tag}> with the dot-path instead — --into is for plain HTML containers`);
  const all = ownElements(html, node, tag);
  if (!all.length) throw new PlanError(`--into '${sel}': no <${tag}> in this section`);
  if (nth) {
    const el = all[parseInt(nth, 10) - 1];
    if (!el) throw new PlanError(`--into '${sel}': only ${all.length} <${tag}> in this section`);
    return { el, label: `${tag}:${nth} of ${all.length}` };
  }
  return { el: all[all.length - 1], label: all.length > 1 ? `${tag}:${all.length} of ${all.length}` : tag };
}
// The element carrying id="<id>" within a range, whatever its tag.
function findElementById(html, id, from, to) {
  const re = new RegExp(`\\sid\\s*=\\s*["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'g');
  const comments = commentRanges(html);
  re.lastIndex = from;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m.index >= to) break;
    if (inRanges(m.index, comments)) continue;
    const lt = html.lastIndexOf('<', m.index);
    if (lt === -1) continue;
    let j = lt + 1, tag = '';
    while (j < html.length && /[A-Za-z0-9-]/.test(html[j])) { tag += html[j]; j++; }
    if (!tag) continue;
    const el = findElement(html, tag, lt, to);
    if (el && el.outerStart === lt) return el;
  }
  return null;
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
// The header's own status enum. Distinct from SECTION_STATUS — a plan moves
// draft → review → approved → implemented (or rejected), while a section is a
// unit of work. Every value here has a `.dot.<value>` rule in plan-styles.css;
// keep the two sets in step or a status renders with an uncolored dot.
const HEADER_STATUS = ['draft', 'review', 'approved', 'implemented', 'rejected'];
function statusEnum(tag) { return tag === 'plan-header' ? HEADER_STATUS : SECTION_STATUS; }
// Badge types with a `plan-badge[type="…"]` rule in plan-styles.css. An unknown
// type renders unstyled, so `badge` refuses to write one.
const BADGE_TYPES = ['decided', 'open', 'deferred', 'high', 'medium', 'low'];
// Every component the runtime registers (the `components` map at the bottom of
// plan-runtime.js). `check` flags a <plan-*> tag outside this set: a typo'd
// component is inert, unstyled markup that otherwise fails silently.
const PLAN_TAGS = [
  'plan-header', 'plan-nav', 'plan-section', 'plan-subsection', 'plan-tabs', 'plan-tab',
  'plan-cards', 'plan-card', 'plan-callout', 'plan-formula', 'plan-principles', 'plan-principle',
  'plan-timeline', 'plan-phase', 'plan-badge', 'plan-table', 'plan-file', 'plan-diff', 'plan-diagram',
];
// Plain HTML containers `check` balance-checks alongside the plan tags. Limited
// to tags whose end tag is never optional in HTML — adding <p>/<li> here would
// false-positive on legal markup.
const BALANCED_HTML_TAGS = ['table', 'thead', 'tbody', 'tfoot', 'tr'];

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
  // `before` first, then `after` twice: the caller was just scanning `before`,
  // so this order costs the per-source index one rebuild instead of three.
  const was = sectionIds(before);
  const present = new Set(sectionIds(after));
  const lost = was.filter(id => !present.has(id));
  if (lost.length) {
    throw new PlanError(`${action} would break the plan — section(s) no longer resolve: ${lost.join(', ')}. ` +
        `Likely an unbalanced or unescaped <plan-*> tag in the content (escape < > & in code). ` +
        `Aborted; no changes written.`);
  }
  // Surviving section ids are not proof the markup is sound: an unclosed
  // <plan-callout> inside a hunk swallows its siblings while every id still
  // resolves. Run the full structure check too — but fail only on a break this
  // write INTRODUCED, so a plan that arrived already unbalanced stays editable.
  const now = planCheck(after);
  if (!now.ok && planCheck(before).ok)
    throw new PlanError(`${action} would break the plan — aborted; no changes written.\n${now.report}`);
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

/* ── hunk splicing (section-relative writes) ──────────────
   set-body owns a whole body; these place a hunk at one point inside one.
   Unlike set-body — whose contract is byte-verbatim so `read --body | set-body`
   round-trips — a hunk arrives with no idea where it will land, so it is fitted
   to the seam: blank edge lines dropped, and the anchor's indentation applied
   when (and only when) the hunk carries none of its own. */
function trimEdgeBlank(s) {
  return String(s).replace(/^(?:[ \t]*\r?\n)+/, '').replace(/\s+$/, '');
}
function fitBlock(body, indent) {
  const block = trimEdgeBlank(body);
  if (!block) throw new PlanError('nothing to insert — the content is empty');
  if (!indent || /^[ \t]/.test(block)) return block;
  return block.split('\n').map(l => (l.trim() ? indent + l : l)).join('\n');
}
// Splice `block` immediately before `idx`, on its own line when `idx` begins a
// line's content (the common case: an indented element), otherwise inline.
function spliceBefore(html, idx, block) {
  const ls = lineStart(html, idx);
  if (/^[ \t]*$/.test(html.slice(ls, idx)))
    return html.slice(0, ls) + block + '\n' + html.slice(ls);
  return html.slice(0, idx) + '\n' + block + breakAfter(html, idx) + html.slice(idx);
}
// Splice `block` immediately after `idx`, on its own line when nothing but
// whitespace follows `idx` on that line.
function spliceAfter(html, idx, block) {
  const nl = html.indexOf('\n', idx);
  const rest = nl === -1 ? html.slice(idx) : html.slice(idx, nl);
  if (/^[ \t\r]*$/.test(rest)) {
    const pos = lineEndAfterNewline(html, idx);
    return html.slice(0, pos) + block + '\n' + html.slice(pos);
  }
  return html.slice(0, idx) + '\n' + block + breakAfter(html, idx) + html.slice(idx);
}
// A newline to close the block's line, unless whatever follows already starts
// one — so a hunk never ends up sharing a line with the markup it displaced.
function breakAfter(html, idx) { return html[idx] === '\n' ? '' : '\n'; }

/* ── pure cores (strings in → strings / structured result out) ──
   Each core is pure: it takes plan text (and args) and RETURNS a value —
   a string for read-only commands, or { html, message } for mutators —
   throwing PlanError on bad input. Cores never touch fs or process; the
   cmd* shells below own all IO. This makes command logic (and its error
   paths) directly unit-testable in-process. */

/* Pure: (shell template, body template, opts) -> the generated plan html.
   `--set k=v` has ONE meaning per key shape, and neither shape can be dropped
   in silence:
     · a DOTTED key is a node address applied after rendering, through planSet —
       so `--set header.status=review` is the same grammar, and gets the same
       validation, as `set header.status=review` on the finished file;
     · a BARE key fills a {{placeholder}}, and must name one that this template
       actually offers, or it throws (it used to be written into the var map and
       never read). */
function planNew(shellTpl, bodyTpl, { title, date, skillSubpath, sets = [] } = {}) {
  const composed = shellTpl.split('{{body}}').join(stripTemplateDoc(bodyTpl));
  const vars = { title: title || 'Untitled Plan', date, skillSubpath };
  const nodeSets = [];
  for (const pair of sets) {
    const eq = String(pair).indexOf('=');
    if (eq === -1) throw new PlanError(`--set expects key=value, got "${pair}"`);
    const key = String(pair).slice(0, eq).trim(), value = String(pair).slice(eq + 1);
    if (!key) throw new PlanError(`--set expects key=value, got "${pair}"`);
    if (key.includes('.')) { nodeSets.push(`${key}=${value}`); continue; }
    const offered = templateVars(composed).filter(v => v.name !== 'body');
    if (!offered.some(v => v.name === key)) {
      const hint = NODE_ATTRS['plan-header'].includes(key)
        ? ` — or address the node directly: --set header.${key}=…`
        : '';
      throw new PlanError(`--set key '${key}' matches no {{placeholder}}${hint}\n` +
        `this template offers: ${offered.map(v => [v.name, varDefault(v)].filter(Boolean).join(' ')).join(', ')}`);
    }
    vars[key] = value;
  }
  let html = render(composed, vars);
  if (nodeSets.length) html = planSet(html, nodeSets).html;
  // A bare fill is substitution, not planSet, so the rendered header needs the
  // same status check `set` applies — else `--set status=aproved` writes a typo.
  const header = findElement(html, 'plan-header');
  const status = header && getAttr(header.attrsRaw, 'status');
  if (status && status !== true && !HEADER_STATUS.includes(status))
    throw new PlanError(`invalid status '${status}' for <plan-header> — valid: ${HEADER_STATUS.join(', ')}`);
  return html;
}
// "(default: draft)", or null when the variable declares none. One spelling for
// both the `--set` error and the `templates <name>` listing.
function varDefault(v) {
  return v.def === undefined ? null : `(default: ${v.def === '' ? 'empty' : v.def})`;
}

/* Pure: (html, flags) -> the `list` report text (trailing newline included).
   The outline — each section's own authored headings — is ON by default,
   because stopping at the section boundary hides where a large plan's real
   structure lives, and finding an edit anchor then means `grep -n '<h3>'`.
   Measured across a corpus of 87 real plans it costs a median ~250 bytes and a
   worst case ~2.9KB, against documents of 25–106KB. `--no-outline` is the
   escape hatch for the pathological document. */
function planList(html, flags = {}) {
  const outline = !flags['no-outline'];
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
    if (outline) {
      for (const h of ownHeadings(html, el))
        out.push(`${'    '.repeat(depth + 1)}${h.level}  ${textOf(html, h)}`);
    }
  });
  return out.join('\n') + '\n';
}

/* Pure: html -> { ok, report }. The authoritative structure check — per-tag
   balance, unregistered components, duplicate section ids — walking the same
   scanner the rest of the tool addresses with. Replaces `grep -c '<plan-table>'`,
   which counts literal strings and so miscounts a commented example, balanced,
   in the way that never reads as a failure. */
function planCheck(html) {
  const watched = new Set(BALANCED_HTML_TAGS);
  const problems = [];
  const counts = {};
  const stack = [];
  walkTags(html, (n) => { const t = n.toLowerCase(); return t.startsWith('plan-') || watched.has(t); }, ({ name, kind, index }) => {
    const tag = name.toLowerCase();
    if (kind !== 'close') {
      counts[tag] = (counts[tag] || 0) + 1;
      if (tag.startsWith('plan-') && !PLAN_TAGS.includes(tag))
        problems.push({ line: lineOf(html, index), text: `unknown component <${tag}> — no such component is registered, so it renders as inert markup` });
    }
    if (kind === 'self') return;
    if (kind === 'open') { stack.push({ tag, index }); return; }
    // The nearest matching open tag, scanned from the top of the stack down.
    let keep = -1;
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { keep = i; break; }
    if (keep === -1) {
      problems.push({ line: lineOf(html, index), text: `stray </${tag}> — no open <${tag}> to close` });
      return;
    }
    for (let i = stack.length - 1; i > keep; i--)
      problems.push({ line: lineOf(html, stack[i].index), text: `<${stack[i].tag}> is never closed — </${tag}> closes an outer element first` });
    stack.length = keep;
  });
  for (const open of stack)
    problems.push({ line: lineOf(html, open.index), text: `<${open.tag}> is never closed` });

  // Ids are address segments and browser anchor targets, so a duplicate makes
  // one of the two unreachable — a silent failure `list` alone won't surface.
  const seen = new Map();
  let total = 0, nested = 0, anon = 0;
  walkSections(html, ({ el, id, depth }) => {
    total++;
    if (depth > 0) nested++;
    if (!id) { anon++; return; }
    if (seen.has(id)) problems.push({ line: lineOf(html, el.outerStart), text: `duplicate section id '${id}' — first used on line ${seen.get(id)}` });
    else seen.set(id, lineOf(html, el.outerStart));
  });

  const tagLine = Object.keys(counts).sort().map(t => `${t} ${counts[t]}`).join(', ') || '(none)';
  const sectionLine = `sections: ${total} (${nested} nested)` +
    (anon ? `, ${anon} without an id (not addressable)` : '') +
    (total ? ', ids unique' : '');
  if (problems.length) {
    problems.sort((a, b) => a.line - b.line);
    return {
      ok: false,
      report: [
        `structure check FAILED — ${problems.length} problem(s)`,
        ...problems.map(p => `  line ${p.line}: ${p.text}`),
        `An unescaped '<' in code content is the usual cause — escape < > & inside`,
        `<plan-file>, <plan-diff>, <pre><code> and inline <code>.`,
      ].join('\n'),
    };
  }
  return {
    ok: true,
    report: ['structure OK — every <plan-*> and table tag is balanced', sectionLine, `tags: ${tagLine}`].join('\n'),
  };
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

/* Pure: ([{name, body}], name?) -> the `templates` report text.
   Without a name, a table of every template and its one-line gist; with one,
   that template's full leading comment — the guidance its author wrote for
   whoever fills the scaffold in. */
function planTemplateReport(entries, name = null, shellTpl = '') {
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  if (!sorted.length) throw new PlanError('no templates found');
  if (name) {
    const hit = sorted.find(t => t.name === name);
    if (!hit) throw new PlanError(`unknown template '${name}' — have: ${sorted.map(t => t.name).join(', ')}`);
    const doc = templateDoc(hit.body);
    const sections = [];
    walkSections(hit.body, ({ id, num, depth }) => sections.push(`${'  '.repeat(depth)}${num}. ${id || '(no id)'}`));
    // Shell AND body: `lang` and the header attributes live in the shell, so
    // scanning the body alone under-reports what `--set` accepts.
    const vars = templateVars(shellTpl + hit.body).filter(v => v.name !== 'body');
    const w = vars.length ? Math.max(...vars.map(v => v.name.length)) : 0;
    return [
      `# ${hit.name}    (planr new <file> --template ${hit.name})`,
      '',
      doc || '(this template has no leading comment — add one to document it)',
      '',
      `Scaffolds ${sections.length} section${sections.length === 1 ? '' : 's'}:`,
      ...sections.map(s => '  ' + s),
      '',
      `Variables (planr new <file> --set <name>=<value>):`,
      ...vars.map(v => `  ${v.name.padEnd(w)}  ${varDefault(v) || '(no default — always filled)'}`),
    ].join('\n') + '\n';
  }
  const w = Math.max(...sorted.map(t => t.name.length));
  return sorted.map(t => `${t.name.padEnd(w)}  ${templateSummary(t.body) || '(no description)'}`).join('\n') +
    `\n\nRun \`planr templates <name>\` for a template's full guidance.\n`;
}

// Pure: (html, "path=value" | ["path=value", …]) -> { html, message }; throws
// PlanError on bad input. EVERY assignment is applied, each to the html the
// previous one produced, so two writes to one node both land.
function planSet(html, specs) {
  const list = (Array.isArray(specs) ? specs : [specs]).filter(s => s != null && s !== '');
  if (!list.length) throw new PlanError('set expects <path>=<value>, e.g. `set plan.html steps.status=done`');
  let out = html;
  const messages = [];
  for (const spec of list) {
    const eq = String(spec).indexOf('=');
    if (eq === -1)
      throw new PlanError(`set expects <path>=<value>, got "${spec}" — e.g. \`set plan.html steps.status=done\``);
    const pathPart = String(spec).slice(0, eq), value = String(spec).slice(eq + 1);
    const segs = pathPart.split('.');
    if (segs.length < 2) throw new PlanError('path must be <node>.<attr>, e.g. steps.status or steps.3.status');
    const attr = segs.pop();
    const node = resolveNode(out, segs);
    const allowed = NODE_ATTRS[node.tag];
    if (allowed && !allowed.includes(attr))
      throw new PlanError(`unknown attribute '${attr}' for <${node.tag}> — valid: ${allowed.join(', ')}`);
    // Per-tag enum: the header's set differs from a section's.
    if (attr === 'status' && NODE_ATTRS[node.tag]) {
      const valid = statusEnum(node.tag);
      if (!valid.includes(value))
        throw new PlanError(`invalid status '${value}' for <${node.tag}> — valid: ${valid.join(', ')}`);
    }
    const newRaw = setAttrRaw(node.attrsRaw, attr, value);
    out = out.slice(0, node.attrStart) + newRaw + out.slice(node.attrEnd);
    messages.push(`set ${pathPart} = "${value}"`);
  }
  return { html: out, message: messages.join('\n') };
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

/* Pure: (html, address, body, opts) -> { html, message }.
   The section-relative write: where set-body replaces a whole body, this places
   a hunk at one point in it — either end, an `--into` container inside it, or
   beside an authored heading. Re-verifies structure afterwards like set-body. */
function planInsert(html, address, body, opts = {}) {
  const { where = 'end', into = null, beforeHeading = null, afterHeading = null, anchored = false } = opts;
  if (!address) throw new PlanError('an address is required, e.g. `append plan.html decisions --into ul`');
  if (beforeHeading && afterHeading) throw new PlanError('use only one of --before-heading / --after-heading');
  if (anchored && !beforeHeading && !afterHeading)
    throw new PlanError('insert requires --before-heading <text> or --after-heading <text> — ' +
      'use `prepend` / `append` for the start or end of a body');
  const node = resolveNode(html, address.split('.'));
  if (node.tag === 'plan-header')
    throw new PlanError('the header holds no body — set its attributes with `set header.<attr>=<value>`');

  let target = node, scope = '';
  if (into) {
    const c = resolveContainer(html, node, into);
    target = c.el;
    scope = ` → ${c.label}`;
  }

  let out, at;
  const headingText = beforeHeading || afterHeading;
  if (headingText) {
    const headings = ownHeadings(html, target);
    const needle = String(headingText).toLowerCase();
    const hits = headings.filter(h => textOf(html, h).toLowerCase().includes(needle));
    if (!hits.length)
      throw new PlanError(`no heading matching "${headingText}" in '${address}'` +
        (headings.length ? ` — headings here: ${headings.map(h => `"${textOf(html, h)}"`).join(', ')}` : ' — it has no headings'));
    if (hits.length > 1)
      throw new PlanError(`"${headingText}" matches ${hits.length} headings in '${address}' ` +
        `(${hits.map(h => `"${textOf(html, h)}"`).join(', ')}) — narrow the text`);
    const h = hits[0];
    const block = fitBlock(body, indentAt(html, h.outerStart));
    out = beforeHeading ? spliceBefore(html, h.outerStart, block) : spliceAfter(html, h.outerEnd, block);
    at = `${beforeHeading ? 'before' : 'after'} heading "${textOf(html, h)}"`;
  } else {
    const block = fitBlock(body, childIndent(html, target));
    // Both ends splice BEFORE their index: innerStart is the first byte of the
    // body, innerEnd the first byte of the closing tag — so appending means
    // landing just above `</…>`, on the line the closing tag's indent occupies.
    out = spliceBefore(html, where === 'start' ? target.innerStart : target.innerEnd, block);
    at = where === 'start' ? 'at the start' : 'at the end';
  }
  assertIntact(html, out, where === 'start' ? 'prepend' : 'insert');
  return { html: out, message: `inserted ${trimEdgeBlank(body).length} chars ${at} of '${address}'${scope}` };
}

/* Pure: (html, flags) -> { html, message }.
   Flips a <plan-badge> inside the table row whose visible text matches. Exists
   because these are usually EMPTY tags (`<plan-badge type="open"></plan-badge>`),
   so an `Edit` written assuming inner text matches nothing. Refuses to guess: an
   ambiguous --match errors rather than writing the first hit. */
function planBadge(html, flags) {
  const match = flagValue(flags, 'match');
  const type = flagValue(flags, 'set');
  if (!match) throw new PlanError('badge requires --match <text> — a substring of the target row');
  if (!type) throw new PlanError(`badge requires --set <type> — valid: ${BADGE_TYPES.join(', ')}`);
  if (!BADGE_TYPES.includes(type))
    throw new PlanError(`invalid badge type '${type}' — valid: ${BADGE_TYPES.join(', ')}`);
  const nthRaw = flagValue(flags, 'nth');
  if (nthRaw != null && !/^\d+$/.test(nthRaw)) throw new PlanError(`--nth expects a 1-based number, got "${nthRaw}"`);
  const nth = nthRaw == null ? null : parseInt(nthRaw, 10);
  const text = flagValue(flags, 'text');

  const scopeAddr = flagValue(flags, 'in');
  const node = scopeAddr ? resolveNode(html, scopeAddr.split('.')) : null;
  const from = node ? node.innerStart : 0;
  const to = node ? node.innerEnd : html.length;
  const where = scopeAddr ? ` in '${scopeAddr}'` : '';

  const needle = String(match).toLowerCase();
  const matched = findElements(html, 'tr', from, to).filter(r => textOf(html, r).toLowerCase().includes(needle));
  if (!matched.length) throw new PlanError(`no table row matching "${match}"${where}`);
  const rows = matched.filter(r => findElements(html, 'plan-badge', r.innerStart, r.innerEnd).length);
  if (!rows.length)
    throw new PlanError(`${matched.length} row(s) match "${match}"${where} but none contains a <plan-badge>`);
  if (rows.length > 1 && !flags.all)
    throw new PlanError(`"${match}" matches ${rows.length} rows${where} — narrow it, or pass --all to set every one:\n` +
      rows.map(r => `  ${textOf(html, r).slice(0, 72)}`).join('\n'));

  // Descending document order: an earlier row's splice must not shift a later
  // row's offsets out from under it.
  const targets = [];
  for (const row of rows) {
    const badges = findElements(html, 'plan-badge', row.innerStart, row.innerEnd);
    if (nth != null) {
      if (!badges[nth - 1]) throw new PlanError(`--nth ${nth}: the row "${textOf(html, row).slice(0, 48)}" has ${badges.length} badge(s)`);
      targets.push({ badge: badges[nth - 1], row });
    } else if (badges.length > 1) {
      throw new PlanError(`the row "${textOf(html, row).slice(0, 48)}" has ${badges.length} badges — pick one with --nth <n>`);
    } else {
      targets.push({ badge: badges[0], row });
    }
  }
  let out = html;
  for (const { badge } of [...targets].sort((a, b) => b.badge.outerStart - a.badge.outerStart)) {
    // Inner content first: its offsets sit after the attribute span, so editing
    // it leaves attrStart/attrEnd valid.
    if (text != null) out = out.slice(0, badge.innerStart) + text + out.slice(badge.innerEnd);
    out = out.slice(0, badge.attrStart) + setAttrRaw(badge.attrsRaw, 'type', type) + out.slice(badge.attrEnd);
  }
  assertIntact(html, out, 'badge');
  return {
    html: out,
    message: targets.map(t => `set badge type = "${type}"${text != null ? ` text = "${text}"` : ''} in row "${textOf(html, t.row).slice(0, 60)}"`).join('\n'),
  };
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

function cmdNew(outPath, flags) {
  if (!outPath) throw new PlanError('new requires an output path, e.g. `new plan.html --template tdd`');
  const template = flagValue(flags, 'template') || 'basic';
  if (template.startsWith('_')) throw new PlanError(`'${template}' is not a selectable template`);
  const bodyPath = path.join(TEMPLATE_DIR, `${template}.html`);
  if (!fs.existsSync(bodyPath)) throw new PlanError(`unknown template '${template}' — run \`planr templates\` to list`);
  const html = planNew(read(path.join(TEMPLATE_DIR, '_shell.html')), read(bodyPath), {
    title: flagValue(flags, 'title'),
    date: new Date().toISOString().slice(0, 10),
    skillSubpath: resolveSkillSubpath(),
    sets: flags.set == null ? [] : [].concat(flags.set),
  });
  const parent = path.dirname(outPath);
  if (parent && !fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
  write(outPath, html);
  process.stdout.write(`Created ${outPath} (template: ${template})\n`);
}

// Read-only shell: read, run core, print.
function cmdList(file, flags)        { process.stdout.write(planList(read(file), flags)); }
function cmdTasks(file, flags)       { process.stdout.write(planTasks(read(file), flags)); }
function cmdRead(file, addr, flags)  { process.stdout.write(planRead(read(file), addr, flags)); }
function cmdCheck(file) {
  const { ok, report } = planCheck(read(file));
  if (!ok) throw new PlanError(report);      // → stderr + exit 1, so CI can gate on it
  process.stdout.write(report + '\n');
}
function cmdTemplates(name) {
  let files;
  try { files = fs.readdirSync(TEMPLATE_DIR); }
  catch (e) { throw new PlanError(`cannot read templates dir: ${e.message}`); }
  const entries = planTemplates(files).map(n => ({ name: n, body: read(path.join(TEMPLATE_DIR, `${n}.html`)) }));
  process.stdout.write(planTemplateReport(entries, name, read(path.join(TEMPLATE_DIR, '_shell.html'))));
}

// Mutating shell: read, run core, write, print message.
function cmdSet(file, specs) {
  const { html, message } = planSet(read(file), specs);
  write(file, html); process.stdout.write(message + '\n');
}
// Hunk content for the body-writing commands: --file, else stdin.
function hunkBody(flags) {
  const src = flagValue(flags, 'file');
  return src ? read(src) : readStdin();
}
function cmdSetBody(file, address, flags) {
  const { html, message } = planSetBody(read(file), address, hunkBody(flags), { append: !!flags.append });
  write(file, html); process.stdout.write(message + '\n');
}
function cmdInsert(file, address, flags, opts) {
  const { html, message } = planInsert(read(file), address, hunkBody(flags), {
    ...opts,
    into: flagValue(flags, 'into'),
    beforeHeading: flagValue(flags, 'before-heading'),
    afterHeading: flagValue(flags, 'after-heading'),
  });
  write(file, html); process.stdout.write(message + '\n');
}
function cmdBadge(file, flags) {
  const { html, message } = planBadge(read(file), flags);
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
// Flags that never take a value. A valueless flag is otherwise indistinguishable
// from one whose value follows, so `tasks --all plan.html` consumed the FILENAME
// as --all's value and then reported a missing <file> — with the file right
// there on the line. Declaring them keeps flag order free.
const BOOLEAN_FLAGS = new Set(['all', 'body', 'append', 'outline', 'no-outline', 'help']);
function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!BOOLEAN_FLAGS.has(key) && next !== undefined && !next.startsWith('--')) {
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
  templates    [<name>]                                   (with a name: that template's guidance)
  list         <file> [--no-outline]
  check        <file>                                     (structure validation; exit 1 on a break)
  tasks        <file> [--all | --status <s>]
  read         <file> <address> [--body]
  set          <file> <path>=<value> [<path>=<value> ...]
  set-body     <file> <address> [--file <f>] [--append]   (body from --file or stdin)
  prepend      <file> <address> [--file <f>] [--into <sel>]
  append       <file> <address> [--file <f>] [--into <sel>]
  insert       <file> <address> (--before-heading T | --after-heading T) [--file <f>] [--into <sel>]
  badge        <file> --match <text> --set <type> [--in <addr>] [--nth N] [--all] [--text T]
  add-section  <file> --id <id> [--num N] [--title T] [--status S]
                      [--parent <addr>] [--after <addr> | --before <addr>] [--body-file <f>]
  rm-section   <file> <address>
  move-section <file> <address> (--after <addr> | --before <addr>)

address: header | <sectionId> | <sectionId>.<child> … (dot-path, any depth; a
         child is an id or a 1-based ordinal). Every address argument — the
         positional one, --parent, --after, --before, --in, and a DOTTED
         \`new --set\` key — uses this grammar. --after/--before name a SIBLING,
         which also fixes the nesting depth, so --parent is only needed to
         append as the last child.
--into:  a plain HTML container inside the addressed section — <tag> (the LAST
         one), <tag>:<n> (1-based), or #<id>. Never a <plan-*> tag: address
         those with the dot-path.
new --set: a DOTTED key is a node address applied to the generated file
         (--set header.status=review); a BARE key fills a {{placeholder}}.
round-trip: read --body <addr> | edit | set-body <addr>  (byte-exact hunk edit)`;

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') { process.stdout.write(USAGE + '\n'); return; }
  const { flags, positional } = parseFlags(rest);
  const file = positional[0];
  // Validate the command first (so an unknown command reports as such), then
  // enforce the <file> arg only for commands that take one.
  const NEEDS_FILE = ['new', 'list', 'check', 'tasks', 'read', 'set', 'set-body', 'prepend', 'append',
    'insert', 'badge', 'add-section', 'rm-section', 'move-section'];
  try {
    if (cmd !== 'templates' && !NEEDS_FILE.includes(cmd)) throw new PlanError(`unknown command '${cmd}'\n\n${USAGE}`);
    if (NEEDS_FILE.includes(cmd) && !file) throw new PlanError(`'${cmd}' requires a <file> argument`);
    switch (cmd) {
      case 'new':          return cmdNew(file, flags);
      case 'templates':    return cmdTemplates(positional[0]);
      case 'list':         return cmdList(file, flags);
      case 'check':        return cmdCheck(file);
      case 'tasks':        return cmdTasks(file, flags);
      case 'read':         return cmdRead(file, positional[1], flags);
      // Every assignment, not just the first: dropping the extras exited 0 and
      // read as success.
      case 'set':          return cmdSet(file, positional.slice(1));
      case 'set-body':     return cmdSetBody(file, positional[1], flags);
      case 'prepend':      return cmdInsert(file, positional[1], flags, { where: 'start' });
      case 'append':       return cmdInsert(file, positional[1], flags, { where: 'end' });
      case 'insert':       return cmdInsert(file, positional[1], flags, { anchored: true });
      case 'badge':        return cmdBadge(file, flags);
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
  render, templateVars, templateDoc, templateSummary, resolveSkillSubpath,
  scanAttrs, getAttr, setAttrRaw, flagValue,
  findElement, findElements, findElementsDeep, findElementById, findSectionById,
  childSections, resolveNode, ownElements, ownHeadings, resolveContainer, textOf,
  buildSection, sectionIds, allSectionIds, walkSections, walkTags, sectionNumber, decodeEntities,
  trimEdgeBlank, fitBlock, childIndent, indentAt, lineOf,
  PlanError, SECTION_STATUS, HEADER_STATUS, BADGE_TYPES, PLAN_TAGS,
  planNew, planTemplates, planTemplateReport, planList, planCheck, planTasks, planRead,
  planSet, planSetBody, planInsert, planBadge, planAddSection, planRmSection, planMoveSection,
};
