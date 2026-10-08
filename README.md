# html-planning

`html-planning` is two things:

1. An LLM skill describing how to build rich, interactive plans (business development plans, product requirements documents, software implementation plans, etc.) in HTML using Web Components.
2. An associated runtime for these plans (implemented in JavaScript and CSS via Web Components), plus planr, an accompanying CLI.

The skill is unconcerned with **what to plan** and focuses more on **how to format** those plans.

## Why?

Recent research shows that, while Markdown was initially the lingua franca for LLM planning workflows, [HTML is more effective](https://claude.com/blog/using-claude-code-the-unreasonable-effectiveness-of-html), primarily because it lowers cognitive overhead for the human operator or reviewer.

However, without guardrails and guidance, this format change has a non-trivial cost for the producing LLM agent.

Before this skill, when asked to produce an HTML plan, Claude Code is likely to output:

```html
<style>
  :root {
    --bg: #ffffff; --fg: #1e1e1e; --muted: #6b7280;
    --border: #e5e7eb; --accent: #2563eb; --accent-light: #dbeafe;
    --red-bg: #fef2f2; --red-border: #fca5a5; --red-text: #991b1b;
    --green-bg: #f0fdf4; --green-border: #86efac; --green-text: #166534;
    --refactor-bg: #fffbeb; --refactor-border: #fcd34d; --refactor-text: #92400e;
    --callout-bg: #f0f9ff; --callout-border: #38bdf8; --callout-text: #0c4a6e;
    --warn-bg: #fffbeb; --warn-border: #f59e0b; --warn-text: #78350f;
    --code-bg: #f8fafc; --code-border: #e2e8f0;
    --scope-bg: #f8fafc;
  }
  <!-- ... 50 more lines of boilerplate css ... -->
</style>
<span class="kw">def</span> <span class="fn">test_detects_single_horizontal_line</span>(self):
    <span class="str">"""A single horizontal line across the middle of the image is detected."""</span>
    <span class="cmt"># Setup: 400x300 image with one horizontal line from (50,150) to (350,150)</span>
    image_bytes = self._make_image_with_lines(<span class="num">400</span>, <span class="num">300</span>, [(<span class="num">50</span>, <span class="num">150</span>, <span class="num">350</span>, <span class="num">150</span>)])
    <!-- ... considerably more code blocks manually syntax highlighted -->
</span>
```

This poses a few obvious problems:

1. Each produced plan is subtly, but materially, different from the last. You never know what you'll get until you open it up.
2. Emitting all of this boilerplate CSS and HTML DEVOURS tokens each time a plan is produced or iterated on. This sends your costs soaring.

After the skill, when asked to produce an HTML plan, Claude uses the skill to generate a boilerplate template and only outputs:

```html
<plan-header
  title="Sample Plan — Customer UUID Additions"
  subtitle="Add a UUID field for each customer"
  status="draft"
  date="2026-05-26">
</plan-header>

<main>
<plan-section id="models" num="1" title="Model Updates">
  <h3>Update the model definitions:</h3>

  <plan-diff path="server/app/orders/models.py" old-start="45" new-start="45">
 class Order(models.Model):
     customer = models.ForeignKey(
-        Customer, on_delete=models.CASCADE,
+        Customer, on_delete=models.SET_NULL, null=True,
         related_name='orders',
     )
+    customer_uuid = models.UUIDField(
+        db_index=True, editable=False,
+        help_text="Preserved copy — survives FK nullification",
+    )
     placed_at = models.DateTimeField()
  </plan-diff>
</plan-section>
</main>
```

This enables the production of plans that are:

1. Semantically expressive.
2. Succinct and concise.
3. Consistent and easily consumed.

For some numbers, if we assume an original Markdown plan consisting of 12,253 output tokens, a corresponding HTML plan looks like:

| Method | Length in Tokens |
|--------|------------------|
| With `html-planning` | 13,672 (+12% tokens over Markdown) |
| Without `html-planning` | 21,499 (+57% tokens over `html-planning`) |

## Plan Features

For a minor size increase over plaintext Markdown plans, plans generated with `html-planning` support:

1. Syntax highlighting for code snippets.
2. GitHub-style diff markers for lines added and removed, presenting changes in a friendly and efficient manner.
3. Sections and sub-sections, navigated by a resizable, collapsible side-panel tree (default) or a two-level top bar.
4. Support for embedding Mermaid diagrams (lazy-loaded when diagrams are present).
5. Typed, schema-driven document metadata (`<plan-meta>`), shown as toned chips in the header and queryable across a whole directory of plans.
6. Configurable line wrapping support for code snippets, plus adjustable view width.
7. Interactive tabs, collapsible components, and callout components.
8. Components for displaying structured data cleanly, such as timelines, cards, themed tables, key/value sub-records (`<plan-defs>`), document metadata (`<plan-meta>`), formulas, and principles.
9. Per-section and per-step status pills (`todo`/`in-progress`/`done`/`blocked`) for tracking implementation progress in-place.

| Component | Renders |
|-----------|---------|
| `<plan-header>` | Title, subtitle, status dot, date, and one chip per metadata field |
| `<plan-nav>` | Navigation: side-panel tree (default) or a two-level top bar |
| `<plan-section>` / `<plan-subsection>` | Nestable, auto-numbered, addressable sections with optional status pills |
| `<plan-meta>` / `<plan-field>` | The document's queryable metadata (drawn by the header, not in place) |
| `<plan-cards>` / `<plan-card>` | Metric / summary cards |
| `<plan-table>` | A themed `<table>` |
| `<plan-defs>` / `<plan-def>` | A key/value sub-record, chromeless inside a table cell |
| `<plan-tabs>` / `<plan-tab>` | Tabbed panels |
| `<plan-callout>` | Info / warn / success / danger callouts |
| `<plan-badge>` | Inline status badges (`decided`, `open`, `deferred`, `high`, `medium`, `low`) |
| `<plan-formula>` | A highlighted formula with a note |
| `<plan-principles>` / `<plan-principle>` | A grid of principles or key decisions |
| `<plan-timeline>` / `<plan-phase>` | A vertical phased timeline |
| `<plan-file>` / `<plan-diff>` | GitHub-style code view and unified diff |
| `<plan-diagram>` | A Mermaid diagram |

Every coloured mark draws from one of six tones (`danger`, `warn`, `info`, `ok`, `final`, `muted`).

In addition to the user-facing features mentioned above, `html-planning` comes with a CLI, `planr.js`, that serves as an interface an LLM can use to scaffold, edit, and manage plans.

All in all, `html-planning` enables your agent to write semantically expressive plans that are considerably more pleasurable to read than those in raw Markdown.

## Installation

The easiest way to install `html-planning` is using [Vercel's skills package](https://github.com/vercel-labs/skills) (`npx skills`):

```sh
# add locally for this project for Claude Code:
npx skills add hjc/skill-html-planning -a claude-code

# add globally for your user for Codex:
npx skills add hjc/skill-html-planning -g -a codex

# copy the skill files so you can edit them to fit your project:
npx skills add hjc/skill-html-planning --copy -a claude-code
```

Happy planning!

## Using the Generator

```bash
node .claude/skills/html-planning/planr.js new <plan-output-path>.html --title "New Plan"

# start from a spine, and fill the header in the same command
node .claude/skills/html-planning/planr.js new plan.html --title "New Plan" --template issue \
  --set status=review

# typed metadata, rendered as header chips
node .claude/skills/html-planning/planr.js meta plan.html --set reference-paths=server/app,client
```

Then start adding any relevant components, open in your browser and enjoy!

## Templates

`planr new` composes a plan from a template; three ship by default:

| Template | Use it for |
|----------|------------|
| `basic` | A minimal starting point — a single section, ready to fill in. |
| `tdd` | An opinionated software implementation plan with the canonical spine: Overview, Scope, Reconnaissance, Design Decisions, Implementation Steps, Callsite Audit, Callsite Migration List, Verification, Anti-Patterns. |
| `issue` | A defect write-up, one addressable section each: an overview whose danger callout states the blast radius, root cause, impact table, remediation table, what is *not* affected, and open questions. |

After installing, add your own templates to `.claude/planr-templates/` — the directory beside `skills/` — rather than editing the skill's `templates/`. They are listed (marked `[consumer]`), documented and selectable exactly like the shipped ones, a same-named one overrides the shipped template, and updating the skill never touches them.

Each one documents itself, so you can read a template before committing to it:

```bash
node .claude/skills/html-planning/planr.js templates       # all of them, one line each
node .claude/skills/html-planning/planr.js templates tdd   # what it is for, and what it scaffolds
```

Shipped templates live in `templates/`. `_shell.html` is a parent template containing the `<head>` inline loader plus a slot for the template's body, so a template only expresses the body of the final document, and can be parameterized with variables.

### Writing a custom template

A template body is just the markup that goes inside `<main>`. Typically, this is a collection of `<plan-section>` elements.

Adding a new file to `.claude/planr-templates/` immediately makes it available to the CLI.

**Open it with a comment saying what the template is for.** That leading comment is the template's documentation — `templates` shows its first sentence as a gist, `templates <name>` prints all of it, and `new` leaves it out of the document it scaffolds so a plan never opens with instructions to itself.

For example, a lightweight PRD template with a custom `{{owner}}` field:

`templates/prd.html`:

```html
<!-- ════════════════════════════════════════════════════════
     PRD — what we are building and why, for a reader deciding
     whether to fund it. Keep Requirements to must-haves; a
     nice-to-have belongs in Open Questions where it can be cut.
     ════════════════════════════════════════════════════════ -->

<plan-section id="summary" title="Summary">
  <p><strong>Owner:</strong> {{owner}}</p>
  <p>What we're building and why.</p>
</plan-section>

<plan-section id="requirements" title="Requirements">
  <p>The must-haves.</p>
</plan-section>
```

Then scaffold from it, filling the custom field with `--set`:

```bash
node .claude/skills/html-planning/planr.js new checkout.html \
  --title "Checkout PRD" --template prd --set owner="Payments Team"
```

Write a placeholder as `{{name:default}}` and it becomes a knob — settable with `--set`, listed by `planr templates <name>`, with no code change:

```html
<html lang="{{lang:en}}">              <!-- `en`, or --set lang=fr -->
  status="{{status:draft}}"            <!-- `draft`, or --set status=review -->
```

That is the tour. The authoring reference ships with the skill at [`references/template-authoring.md`](skills/html-planning/references/template-authoring.md).

### Metadata

Every document can carry a small `<plan-meta>` block of queryable facts (`type`, `status`, `reference-paths`, `blocked-by`, …), resolved from the block itself, the header, the file's path, or a schema default — with no block at all still fully queryable. The field vocabulary is data: a shipped `planr-schema.json` plus an optional `.claude/planr-schema.json` a consuming repo adds for its own fields. Read and write it with `planr meta <file>`; see `SKILL.md`'s "Metadata" section for the full contract.

The fields render as chips in the header, beside the status and date. A schema enum can give each value a tone (`danger`, `warn`, `info`, `ok`, `final`, `muted`), any field can name its chip with `"label"`, and any field can stay out of the header with `"hidden": true`.

#### First-time setup

The shipped core knows two document types, `issue` and `tdd`, and infers and defaults nothing. Declare your own types, path rules and defaults in `.claude/planr-schema.json`:

```json
{
  "fields":   { "type": { "type": "enum", "values": ["prd", "spec", "tdd", "issue"] } },
  "infer":    [{ "match": "/issues/", "set": { "type": "issue" } }, { "match": "/tdds/", "set": { "type": "tdd" } }],
  "defaults": { "type": "spec" }
}
```

A consumer field replaces the core one of the same name, so a redeclared `type` lists every type you use. See `SKILL.md`'s "First-time setup".

## Editing Plans Cheaply

The same token pressure that makes verbose HTML expensive to *write* also makes it expensive to *edit*. Agents looking to flip a single status have to read the whole plan back into context just to locate and change one string.

`planr.js` sidesteps that by mutating a plan **by address**, so an edit costs tokens proportional to the change, not the size of the document. (`planr` below is shorthand for `node .claude/skills/html-planning/planr.js`.)

```bash
# orient without loading the file — every section, and the headings inside them
planr list plan.html

# flip a status, or several at once, without reading the plan
planr set plan.html steps.3.status=done header.status=review

# pull one section's hunk out, edit it, push it back
planr read plan.html caching --body > hunk.html
planr set-body plan.html caching --file hunk.html

# read a section for its content: structure kept, markup gone
planr read plan.html caching --text
```

Addresses are dot-paths, so the same commands reach any depth: `steps.step-3.detail`. A bare id reaches it too: `detail`.

On a long-lived plan the common edit is smaller still — an amendment above a section, one item onto a running list, four rows onto a table, one badge flipped — and none should cost a whole-section rewrite. Those go in at a point:

```bash
planr prepend plan.html resolution --file amendment.html            # above everything in a section
planr insert  plan.html resolution --before-heading "Decisions" --file note.html
planr append  plan.html decisions --into ul --file gist.html        # one <li> onto the running list
planr append  plan.html vocab --into tbody --file rows.html         # rows onto a table
planr badge   plan.html --match "q16" --set decided                 # flip a badge in a table row
planr rm-item plan.html fog --match "graduated patch"               # take one item back off a list
planr strike  plan.html resolution --match "retry hourly"           # strike superseded text in place
planr replace plan.html resolution --match "hourly" --with "daily"  # rewrite text in place
```

Every command that writes re-verifies the document afterwards and **aborts without writing** if the change would break it — and `planr check` validates one on demand, exiting non-zero on a structural break — an unbalanced tag, or a balanced one in a parent it cannot sit in — so CI can gate on it. It also warns, by line, on markup that balances but will not render as written (an unescaped tag in a code block, a diff line with no gutter, a stale `<title>`); `planr check --strict` makes those fatal too.

`planr.js` is zero-dependency and drives the same Web Component DSL the rest of the skill uses. The full surface:

| Group | Commands |
|-------|----------|
| Generate | `new` (`--template`, `--set`), `templates [<name>]` |
| Inspect | `list`, `check [--strict]`, `tasks`, `read [--body \| --text]` |
| Metadata | `meta` (`--set`, `--unset`, `--stamp`, `--format json`) |
| Corpus | `query <dir\|glob>` (`--where`, `--has`, `--missing`, `--rank`, `--sort`, `--fields`, `--limit`, `--format table\|json\|tsv\|paths`), `next <dir\|glob>` |
| Edit by address | `set`, `set-body`, `prepend`, `append`, `insert`, `add-section`, `rm-section`, `move-section` |
| Edit by text | `badge` (`--text`), `rm-item`, `strike`, `replace` |

Every flag is in `planr --help` and `SKILL.md`.

### Querying a corpus

```bash
planr query .claude/plans/issues --where 'status!=implemented' --sort priority
planr query .claude/plans/issues --rank default --format json   # a schema-declared ranking, for an agent
planr next  .claude/plans/issues --format json                  # the top document and the sections to act on
planr query .claude/plans/issues --where blocked=false          # leave out what an open blocked-by target holds
```

`--format json` is the machine surface: one record per document with every resolved field and its source. An empty queue exits 0, so "nothing to do" is distinguishable from "broken".

## What's new in 1.4.0

**One colour system, and metadata in the header**

- `replace` refuses a replacement that would open a block element inside its match's parent — a `<tr>` spliced into a cell's `<code>` — and names the parent. `check` now fails on a balanced tag in a parent it cannot sit in, so no writing command can introduce one into a sound document.
- **Tones.** Every coloured mark — a badge, the header status dot, a metadata chip — colours by one of six tones (`danger`, `warn`, `info`, `ok`, `final`, `muted`), each mapped onto the theme's own colours. Badges and status dots look exactly as before.
- **A schema enum declares a tone per value** (`"tones": { "p0": "danger" }`), and any field can stay out of the header with `"hidden": true` while remaining queryable. An unknown tone, or a tone for an undeclared value, is refused when the schema loads.
- **Metadata renders in the header.** `<plan-header>` shows each `<plan-meta>` field as a chip — key, value and a tone dot — beside the status and date, and the separate metadata strip is gone. The status chip stays visibly distinct.
- **`planr meta <file> --stamp`.** `planr` writes each field's tone and hidden flag onto the page, so the browser never needs the schema. `--stamp` brings an existing document in line after a schema change, and `check` warns when a stamp disagrees with the schema.
- **Fix: `meta --set` escapes field values.** `&`, `<` and `>` in a value are written as entities, so a value can no longer become live markup; reads decode them back to the exact original, and `check` warns on a raw `<` already on disk.
- **Free-text header chips are deprecated.** No template writes them and `check` warns on a header carrying them. They still render, so nothing breaks before a repo moves them into schema fields.
- **A lean core schema.** `type` ships `issue` and `tdd` only, `infer` and `defaults` ship empty, `owner` is gone and `area` is renamed `reference-paths`. A repo declares its own document types and path rules — see "First-time setup". A field's `from` may view only `header:title`, `header:status` or `header:date`.
- **Labels render.** A field's schema `label` is stamped onto its `<plan-field>` and shown in the header chip in place of the key; `meta --stamp` and `check` cover it like a tone.
- **Blockers.** A document is blocked while a `blocked-by` target exists and is not `implemented` or `rejected`. Filter with `--where blocked=false` or a ranking's `"blocked": { "eq": false }`; `query --format json` and `next` show what holds a document. A missing target never blocks, and `check` warns on it.
- **Unknown flags are refused.** A flag the command does not read is an error naming the valid ones, instead of being ignored. The dead `list --outline` flag is gone (listing headings is the default; `--no-outline` remains).

## What's new in 1.3.0

**Metadata, and a queryable corpus**

- A visible `<plan-meta>` block of `<plan-field key="...">` pairs holds the facts a tool filters and sorts documents by. A document without one is still queryable: values resolve from the block, then the header, then the document's path, then a schema default.
- The field vocabulary is **data**, not built in. `planr-schema.json` beside the skill ships the core set; a repo extends or replaces it with `.claude/planr-schema.json`, in the same format.
- `planr meta` reads a document's resolved metadata and where each value came from, and writes it with `--set` / `--unset`. An unknown field or an out-of-schema value is refused.
- **`planr query <dir|glob>`** filters, sorts and projects a whole corpus — `--where`, `--has`, `--missing`, `--sort`, `--fields`, `--limit`, and `--format table|json|tsv|paths`. Comparisons read the order the schema declares. No index and no cache: 142 documents scan in about a quarter of a second.
- **`planr next <dir>`** hands one document to an agent: the top-ranked path, its metadata, and the section addresses to act on it. `--format json` is the machine surface for both commands, and it carries the whole metadata record per result, not just the printed columns.
- Rankings are named `where` + `order` presets declared in the schema, so each repo defines its own queue. `--rank <name>` applies one; an explicit flag overrides it per field.
- `planr check` reports metadata problems as warnings, and `check --strict` gates them.

## What's new in 1.2.0

**Fixes**

- `badge --set` no longer leaves a stale label: a label derived from the old type is cleared, and a custom label is refused unless `--text` says what to do with it.
- Components render correctly in long documents — the runtime registers them after the page has parsed, so none upgrades against an empty body.
- `set header.title` keeps the page's `<title>` in step, and `check` warns when the two diverge.
- Diagrams keep a `<br/>` in a label, and large diagrams stay legible instead of shrinking to fit.
- `new` no longer copies a template's documentation comment into the generated plan.
- An out-of-range `--into` names the nested sections it excludes, so an ordinal read off `read --body` is no longer silently wrong.
- `SKILL.md` points at the template-authoring reference with a plain path.

**New**

- `rm-item` removes a list item or table row by its visible text; `strike` strikes superseded text in place; `replace` rewrites a matched run of text.
- A bare section id resolves at any depth, and an ambiguous one lists the addresses it could mean.
- `read --text` prints a section as plain text, one block per line.
- `<plan-defs>` / `<plan-def>`: a key/value sub-record, compact standalone and chromeless inside a table cell.
- `.claude/planr-templates/`: templates a repo owns, listed and selectable beside the shipped ones, and untouched when the skill is updated.

**`check` warnings** — printed after the structure report; exit 0, or 1 with `--strict`. They catch markup in a section title (which `add-section --title` and `set …title=` now also refuse), a tag inside a code component, a diff line with no gutter character, a bare `§N` used as link text, a badge label that restates a different type, and a scaffold banner opening `<main>`.

## Developing this skill

The skill itself lives in `skills/html-planning/`; the repo root is a normal Node project (the CLI's manifest, with vitest as the only dev dependency). The **shipped skill carries zero runtime dependencies** — the dev tooling is a sibling of the skill folder and is never installed. To run the tests:

```sh
npm install
npm test        # vitest — unit (pure engine) + integration (CLI subprocess) suites
```

### Contents

Relative to `skills/html-planning/`:

| File | Purpose |
|------|---------|
| `SKILL.md` | The skill definition (agent instructions + primer + component reference). |
| `planr.js` | The CLI — generates plan skeletons (`planr new`), validates structure and warns on silent rendering traps (`planr check`), and makes cheap, address-based edits to an existing plan (status flips, section add/remove/move, body swaps, hunk inserts) without re-reading the whole file. |
| `templates/` | Plan skeletons composed by `planr new` — `_shell.html` (shared document + inline loader) plus one selectable body per template (`basic`, `tdd`, `issue`). A consuming repo adds its own in `.claude/planr-templates/`. |
| `references/` | Deep-dive docs the skill points at rather than inlining — `template-authoring.md` and `authoring-traps.md`. |
| `plan-runtime.js` | Web Component definitions loaded at runtime via the inline loader. |
| `plan-styles.css` | Plan design system, also injected via the inline loader. |
| `examples/sample-plan.html` | Sample file with every component listed. |
