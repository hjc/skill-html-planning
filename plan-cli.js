#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   Plan CLI — cheap, structured manipulation of plan files
   Lets an agent read and mutate a plan by ADDRESS instead of
   loading the whole file into context and hand-editing markup.
   The token cost of an operation is O(change), not O(document).

   Usage:
     node plan-cli.js list        <file>
     node plan-cli.js read        <file> <address>
     node plan-cli.js set         <file> <path>=<value>
     node plan-cli.js add-section <file> --id <id> [--num N] [--title T]
                                         [--status S] [--after ref | --before ref]
     node plan-cli.js rm-section  <file> <id>
     node plan-cli.js move-section <file> <id> (--after ref | --before ref)

   Addressing (dot-paths):
     header               → the <plan-header>
     <sectionId>          → <plan-section id="…">
     <sectionId>.<n>      → the Nth <plan-subsection> (1-based)
     <sectionId>.<subId>  → <plan-subsection id="…">
   In `set`, the LAST path segment is the attribute:
     steps.status=done          → section 'steps', attr status
     steps.3.status=in-progress → 3rd subsection of 'steps', attr status
     header.status=approved     → the header, attr status

   Zero dependencies. Rather than parse arbitrary HTML, this walks the small,
   known set of <plan-*> tags with a quote-aware scanner — that is all a
   canonical plan file needs, and it keeps the tool install-free.
   ═══════════════════════════════════════════════════════════ */

'use strict';
const fs = require('fs');

/* ── tiny IO + error helpers ──────────────────────────── */
function die(msg) {
  process.stderr.write(`plan-cli: ${msg}\n`);
  process.exit(1);
}
function read(file) {
  try { return fs.readFileSync(file, 'utf8'); }
  catch (e) { die(`cannot read '${file}': ${e.message}`); }
}
function write(file, html) {
  try { fs.writeFileSync(file, html, 'utf8'); }
  catch (e) { die(`cannot write '${file}': ${e.message}`); }
}
function readStdin() {
  if (process.stdin.isTTY) die('no --file given and no stdin piped; use --file <f> or pipe content on stdin');
  try { return fs.readFileSync(0, 'utf8'); }
  catch (e) { die(`cannot read stdin: ${e.message}`); }
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
  if (value.indexOf('"') !== -1) die(`value for '${name}' may not contain a double-quote`);
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
function findSubsection(html, section, selector) {
  const subs = findElements(html, 'plan-subsection', section.innerStart, section.innerEnd);
  if (/^\d+$/.test(selector)) return subs[parseInt(selector, 10) - 1] || null;
  return subs.find(s => getAttr(s.attrsRaw, 'id') === selector) || null;
}
function resolveNode(html, segs) {
  if (segs[0] === 'header') {
    if (segs.length > 1) die('the header has no children');
    const el = findElement(html, 'plan-header');
    if (!el) die('no <plan-header> found');
    return el;
  }
  const sec = findSectionById(html, segs[0]);
  if (!sec) die(`section '${segs[0]}' not found`);
  if (segs.length === 1) return sec;
  if (segs.length === 2) {
    const sub = findSubsection(html, sec, segs[1]);
    if (!sub) die(`subsection '${segs[1]}' not found in section '${segs[0]}'`);
    return sub;
  }
  die('addresses deeper than <section>.<subsection> are not supported');
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

/* ── commands ─────────────────────────────────────────── */
function cmdList(file) {
  const html = read(file);
  const header = findElement(html, 'plan-header');
  if (header) {
    const title = getAttr(header.attrsRaw, 'title') || '(untitled)';
    const status = getAttr(header.attrsRaw, 'status');
    process.stdout.write(`# ${title}${status ? `  [${status}]` : ''}\n`);
  }
  for (const s of findElements(html, 'plan-section')) {
    const a = k => getAttr(s.attrsRaw, k);
    const st = a('status') ? `  [${a('status')}]` : '';
    process.stdout.write(`${a('num') != null ? a('num') + '. ' : ''}${a('id') || '(no id)'}${a('title') ? ' — ' + a('title') : ''}${st}\n`);
    for (const sub of findElements(html, 'plan-subsection', s.innerStart, s.innerEnd)) {
      const sa = k => getAttr(sub.attrsRaw, k);
      const sst = sa('status') ? `  [${sa('status')}]` : '';
      process.stdout.write(`    ${sa('num') != null ? sa('num') + '. ' : ''}${sa('id') || '(no id)'}${sa('title') ? ' — ' + sa('title') : ''}${sst}\n`);
    }
  }
}
// Open tasks: sections/subsections carrying a `status`, excluding `done` by
// default. Each row leads with the ADDRESS so it feeds straight into set/read.
function cmdTasks(file, flags) {
  const html = read(file);
  const OPEN = ['todo', 'in-progress', 'blocked'];
  const want = flags.status && flags.status !== true ? String(flags.status).split(',') : null;
  const include = (st) => {
    if (!st) return false;
    if (want) return want.includes(st);
    if (flags.all) return true;
    return OPEN.includes(st);
  };
  const rows = [];
  for (const s of findElements(html, 'plan-section')) {
    const sid = getAttr(s.attrsRaw, 'id') || '(no id)';
    const sst = getAttr(s.attrsRaw, 'status');
    if (include(sst)) rows.push({ addr: sid, status: sst, title: getAttr(s.attrsRaw, 'title') || '' });
    let n = 0;
    for (const sub of findElements(html, 'plan-subsection', s.innerStart, s.innerEnd)) {
      n++;
      const st = getAttr(sub.attrsRaw, 'status');
      if (!include(st)) continue;
      const subId = getAttr(sub.attrsRaw, 'id');
      rows.push({ addr: `${sid}.${subId || n}`, status: st, title: getAttr(sub.attrsRaw, 'title') || '' });
    }
  }
  if (!rows.length) { process.stdout.write('no open tasks\n'); return; }
  const aw = Math.max(...rows.map(r => r.addr.length));
  const sw = Math.max(...rows.map(r => r.status.length));
  for (const r of rows) {
    process.stdout.write(`${r.addr.padEnd(aw)}  [${r.status.padEnd(sw)}]  ${r.title}\n`);
  }
}
function cmdRead(file, address, flags) {
  if (!address) die('read requires an address, e.g. `read plan.html steps`');
  const html = read(file);
  const el = resolveNode(html, address.split('.'));
  if (flags && flags.body) {
    // Inner content only, byte-exact with the range set-body replaces — so
    // `read --body` → edit the hunk → `set-body` round-trips losslessly.
    process.stdout.write(html.slice(el.innerStart, el.innerEnd));
  } else {
    process.stdout.write(html.slice(el.outerStart, el.outerEnd) + '\n');
  }
}
function cmdSet(file, spec) {
  if (!spec || spec.indexOf('=') === -1) die('set expects <path>=<value>, e.g. `set plan.html steps.status=done`');
  const eq = spec.indexOf('=');
  const pathPart = spec.slice(0, eq);
  const value = spec.slice(eq + 1);
  const segs = pathPart.split('.');
  if (segs.length < 2) die('path must be <node>.<attr>, e.g. steps.status or steps.3.status');
  const attr = segs.pop();
  const html = read(file);
  const node = resolveNode(html, segs);
  const newRaw = setAttrRaw(node.attrsRaw, attr, value);
  write(file, html.slice(0, node.attrStart) + newRaw + html.slice(node.attrEnd));
  process.stdout.write(`set ${pathPart} = "${value}"\n`);
}
// Replace (or --append to) a node's inner content with a verbatim splice.
// Body comes from --file or stdin. Pairs with `read --body`.
function cmdSetBody(file, address, flags) {
  if (!address) die('set-body requires an address, e.g. `set-body plan.html caching`');
  const html = read(file);
  const el = resolveNode(html, address.split('.'));
  const body = flags.file && flags.file !== true ? read(flags.file) : readStdin();
  const out = flags.append
    ? html.slice(0, el.innerEnd) + body + html.slice(el.innerEnd)
    : html.slice(0, el.innerStart) + body + html.slice(el.innerEnd);
  write(file, out);
  process.stdout.write(`set body of ${address}${flags.append ? ' (appended)' : ''} — ${body.length} chars\n`);
}
function cmdAddSection(file, flags) {
  if (!flags.id) die('add-section requires --id');
  if (flags.after && flags.before) die('use only one of --after / --before');
  let html = read(file);
  if (findSectionById(html, flags.id)) die(`section '${flags.id}' already exists`);
  const body = flags['body-file'] && flags['body-file'] !== true ? read(flags['body-file']) : null;
  const block = buildSection(flags, sectionIndent(html), body);
  if (flags.after) {
    const ref = findSectionById(html, flags.after);
    if (!ref) die(`--after section '${flags.after}' not found`);
    html = insertBlock(html, ref, block, 'after');
  } else if (flags.before) {
    const ref = findSectionById(html, flags.before);
    if (!ref) die(`--before section '${flags.before}' not found`);
    html = insertBlock(html, ref, block, 'before');
  } else {
    html = appendSection(html, block);
  }
  write(file, html);
  process.stdout.write(`added section '${flags.id}'\n`);
}
function cmdRmSection(file, id) {
  if (!id) die('rm-section requires a section id');
  const html = read(file);
  const el = findSectionById(html, id);
  if (!el) die(`section '${id}' not found`);
  write(file, removeBlock(html, el.outerStart, el.outerEnd));
  process.stdout.write(`removed section '${id}'\n`);
}
function cmdMoveSection(file, id, flags) {
  if (!id) die('move-section requires a section id');
  const position = flags.after ? 'after' : flags.before ? 'before' : null;
  const refId = flags.after || flags.before;
  if (!position) die('move-section requires --after <ref> or --before <ref>');
  if (flags.after && flags.before) die('use only one of --after / --before');
  let html = read(file);
  const el = findSectionById(html, id);
  if (!el) die(`section '${id}' not found`);
  const from = lineStart(html, el.outerStart);
  const to = lineEndAfterNewline(html, el.outerEnd);
  const block = html.slice(from, to).replace(/\n$/, '');
  html = removeBlock(html, el.outerStart, el.outerEnd);
  const ref = findSectionById(html, refId);
  if (!ref) die(`reference section '${refId}' not found`);
  if (ref.outerStart === el.outerStart) die('cannot move a section relative to itself');
  html = insertBlock(html, ref, block, position);
  write(file, html);
  process.stdout.write(`moved section '${id}' ${position} '${refId}'\n`);
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
      if (next !== undefined && !next.startsWith('--')) { flags[key] = next; i++; }
      else flags[key] = true;
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

const USAGE = `plan-cli — structured plan manipulation

  list         <file>
  tasks        <file> [--all | --status <s>]
  read         <file> <address> [--body]
  set          <file> <path>=<value>
  set-body     <file> <address> [--file <f>] [--append]   (body from --file or stdin)
  add-section  <file> --id <id> [--num N] [--title T] [--status S]
                      [--after <ref> | --before <ref>] [--body-file <f>]
  rm-section   <file> <id>
  move-section <file> <id> (--after <ref> | --before <ref>)

address: header | <sectionId> | <sectionId>.<n|subId>
round-trip: read --body <addr> | edit | set-body <addr>  (byte-exact hunk edit)`;

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h') { process.stdout.write(USAGE + '\n'); return; }
  const { flags, positional } = parseFlags(rest);
  const file = positional[0];
  if (!file && cmd !== 'help') die(`'${cmd}' requires a <file> argument`);
  switch (cmd) {
    case 'list':         return cmdList(file);
    case 'tasks':        return cmdTasks(file, flags);
    case 'read':         return cmdRead(file, positional[1], flags);
    case 'set':          return cmdSet(file, positional[1]);
    case 'set-body':     return cmdSetBody(file, positional[1], flags);
    case 'add-section':  return cmdAddSection(file, flags);
    case 'rm-section':   return cmdRmSection(file, positional[1]);
    case 'move-section': return cmdMoveSection(file, positional[1], flags);
    case 'help':         return process.stdout.write(USAGE + '\n');
    default:             return die(`unknown command '${cmd}'\n\n${USAGE}`);
  }
}
main();
