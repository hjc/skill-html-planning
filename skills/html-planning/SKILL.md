---
name: html-planning
description: Format implementation plans, PRDs, BSDs, and design documents as interactive HTML using a Web Component DSL — instead of verbose hand-written CSS/HTML. Use when asked to produce or format any plan or design document as an HTML file.
version: 1.4.0
---

# html-planning

Format implementation plans, PRDs, BSDs, and design documents as interactive HTML using a Web Component DSL. This skill handles **how to format** — domain skills handle **what to plan**.

## CRITICAL RULES

1. **You MUST run `planr new` before writing any plan content.** This is non-negotiable. It creates the skeleton from a template with the inline loader that resolves `plan-styles.css` and `plan-runtime.js` from the skill folder. Without it, the plan has no styling or interactivity.

2. **NEVER write inline `<style>` blocks, CSS custom properties, or `<script>` blocks in plan files.** All styling comes from `plan-styles.css`, loaded at runtime by the skeleton's inline loader. If you find yourself writing CSS in a plan file, STOP — you are doing it wrong.

3. **NEVER write raw `<div>` structures for visual elements.** Use the Web Component tags documented below (`<plan-card>`, `<plan-callout>`, `<plan-table>`, `<plan-tabs>`, etc.). These are defined in `plan-runtime.js` and styled by `plan-styles.css`.

4. **Plan files contain ONLY semantic markup.** No CSS. No JS. Just the HTML skeleton from the generator plus the Web Component tags you add via `Edit`.

## Quick Start

1. **Generate the skeleton** (MANDATORY first step):
   ```bash
   node .claude/skills/html-planning/planr.js new <output-path> --title "My Plan"
   ```
   For a **TDD implementation plan**, add `--template tdd`; for a defect write-up, `--template issue`. Each scaffolds a fixed section spine owned by that document type (see "Templates" below):
   ```bash
   node .claude/skills/html-planning/planr.js new <output-path> --title "My Plan" --template tdd
   ```
   Set header attributes in the **same command** with dotted `--set` keys — they use the ordinary address grammar, so there is no follow-up `set`:
   ```bash
   node .claude/skills/html-planning/planr.js new <output-path> --title "My Plan" --template issue \
     --set header.subtitle="What it covers" --set header.status=review
   ```
   Typed facts — the paths a plan touches, what blocks it, whatever your repo's schema adds — go into the document's metadata afterwards with `planr meta <file> --set`, and render as header chips (see "Metadata").
2. **Read the generated file.**
3. **Use `planr`** (or `Edit`) to add sections, cards, tables, and other components using the Web Component tags below.
4. **Run `planr check <file>`** when you are done editing. It is the authoritative structure validation — never hand-roll a `grep -c '<plan-table>'` balance count. Read the warnings it prints after the structure report; each names a line that will not render as written.

## Component Reference

### Layout & Navigation

#### `<plan-header>`
Page header with title, subtitle, and a row of chips: the status, the date, and the document's metadata.
```html
<plan-header
  title="Feature Plan"
  subtitle="Optional subtitle line"
  status="draft"
  date="2026-05-24">
</plan-header>
```
**Attributes:** `title`, `subtitle`, `status`, `date`.

**The chip row** shows, in order: the status chip (a tone-coloured dot and the status), the date, then **one chip per field of the document's `<plan-meta>`** — `label value`, where the label is the field's schema `label` or, when it has none, its key — with a dot in the field's tone when its schema declares one. A field declared `hidden` is not shown, and a long value is cut with an ellipsis (hover for the key and the whole value). The status chip never shows a key, so `priority p1` cannot be mistaken for it.

**`chips` is deprecated.** A pipe-delimited `chips` attribute still renders, after the metadata chips, but no template writes it and `check` warns on it. Declare each recurring chip as a schema field and set it with `planr meta --set`.

**`status` values:** `draft` · `review` · `approved` · `implemented` · `rejected` — the full set, each with its own dot colour. This is the **header's own** enum and is different from a section's (`todo`/`in-progress`/`done`/`blocked`); `planr set` validates each against the right one. Use `review` for claimed-but-unresolved work.

#### `<plan-nav>`
Auto-generated navigation. By default the runtime shows a **left side-panel tree** covering every section at every depth (see "Architecture" below); the `<plan-nav>` element itself is the fallback view — a sticky top bar that renders top-level sections as links, with a hover dropdown of a section's **immediate** children, so it shows **two levels**. Deeper nesting is still addressable and rendered, just not shown in that bar. Either way the element carries no attributes — place it before `<main>` and the runtime handles the rest.
```html
<plan-nav></plan-nav>
```

#### `<plan-section>`
A content section. **Sections nest** — a `<plan-section>` may contain child `<plan-section>`s to any depth. The heading level (`h2` at the top → `h3` → `h4` …) and the number (`1`, `1.1`, `1.1.2`) are **derived from nesting depth and document position** — you don't manage them. Each section with an `id` is a nav/addressing target.
```html
<plan-section id="overview" title="Overview">
  <p>Content here.</p>
  <plan-section id="overview-detail" title="A nested section">
    <p>Renders as h3, auto-numbered 1.1.</p>
  </plan-section>
</plan-section>
```
**Attributes:** `id` (required for nav linking + CLI addressing; must be **unique document-wide**), `title`, `status` (optional: `todo`/`in-progress`/`done`/`blocked` — a colored pill in the heading; flip it cheaply with `planr`), `num` (optional — **overrides** the auto-number for that one section, e.g. `"Part 1"`; on a nested section a bare value like `1` joins onto the parent → `5.1`, while a dotted value like `5.1` is used as-is). Never write `num` merely to number sections in order; that is derived.

#### `<plan-subsection>`
Backward-compat **alias for a nested `<plan-section>`** — it renders identically (one level deeper: `h3`, auto-numbered `N.M`). New plans can simply nest `<plan-section>`; the `<plan-subsection>` tag remains so existing plans keep working. Use either for TDD steps, sub-phases, or any sub-grouping.
```html
<plan-section id="steps" title="Implementation Steps">
  <plan-subsection id="step-1" title="Add OrderAuditLog model" status="todo">
    <p>Red/green/refactor details here.</p>
  </plan-subsection>
  <plan-section id="step-2" title="Wire up signal handler" status="todo">
    <p>Equivalent, written with the nesting model directly.</p>
  </plan-section>
</plan-section>
```
**Attributes:** same as `<plan-section>` — `id`, `title`, `status`, optional `num` override.

### Data Display

#### `<plan-cards>` / `<plan-card>`
Grid of metric or summary cards. Wrap cards in `<plan-cards>` for grid layout.
```html
<plan-cards>
  <plan-card label="Monthly Cost" value="$780" color="red">
    <p>Breakdown detail lines go here as children.</p>
  </plan-card>
  <plan-card label="Revenue" value="$2,400" color="green"></plan-card>
  <plan-card label="Margin" value="68%" color="blue"></plan-card>
</plan-cards>
```
**Card attributes:** `label`, `value`, `subtitle`, `color` (blue/green/purple/amber/red).

#### `<plan-table>`
Wrapper that styles any `<table>` inside it with the plan theme.

**A recurring table shape is a convention, not a component.** A decisions table is a `plan-table` whose columns happen to be # / Decision / Rationale — never invent a `<plan-decision>` tag for it. Match the column headers the template scaffolds so the corpus stays uniform.
```html
<plan-table>
  <table>
    <thead><tr><th>Col 1</th><th>Col 2</th></tr></thead>
    <tbody><tr><td>Data</td><td>Data</td></tr></tbody>
  </table>
</plan-table>
```

#### `<plan-defs>` / `<plan-def>`
A **sub-record**: two to six name → value pairs that belong to one thing — the fields a model gains, the limits a tier sets. Each `<plan-def>` is one pair: its `key` attribute is the name, its content is the value (inline markup such as `<code>` is fine).
```html
<plan-defs>
  <plan-def key="country_code">CharField(max_length=2), ISO alpha-2</plan-def>
  <plan-def key="tier">CharField(max_length=10)</plan-def>
</plan-defs>
```
**Attributes:** `key` on `<plan-def>` — plain text. CSS renders it, so markup written in it shows literally.

Standalone it is a compact bordered block with the keys in one column. **Inside a `<plan-table>` cell it drops its chrome** and reads as part of the row — this is the shape for any cell whose content is a sub-record:
```html
<tr><td>Add fields to <code>SmsLog</code></td><td><plan-defs>
  <plan-def key="country_code">CharField(max_length=2)</plan-def>
  <plan-def key="tier">CharField(max_length=10)</plan-def>
</plan-defs></td></tr>
```
- **Never nest a `<table>` in a `<td>` for this.** The inner table inherits every plan-table rule and compounds inside the host cell's padding and border, and it asserts a peer grid where the content is one row's attributes.
- **One level only.** A sub-record inside a sub-record is a real table — give it its own `<plan-table>`.
- **Add a pair with `planr append <file> <section> --into plan-defs --file row.html`.** With several in a section, pick one with `--into plan-defs:<n>`.
- **`planr read --text` prints each pair as `key: value`** — one line per pair, joined with `; ` inside a table cell.

#### `<plan-meta>` / `<plan-field>`
The document's own **metadata** — the `key → value` facts a tool can filter and sort a whole directory of documents by.
Each `<plan-field>` is one pair: its `key` attribute names the field, its content is the value. **The block itself
shows nothing**: `<plan-header>` renders each field as a chip in its meta-row.

```html
<plan-meta>
  <plan-field key="type">issue</plan-field>
  <plan-field key="reference-paths" label="paths">server/project/crm, celery</plan-field>
  <plan-field key="blocked-by" label="blocked by">storage-quota-cache.html</plan-field>
</plan-meta>
```

**Attributes:** `key` on `<plan-field>` — plain text; the header shows it verbatim, so markup written in it shows
literally. `label`, `tone` and `hidden` are **stamps written by `planr`** from the schema, never by hand (see "Tones
and the header" below).

- **It is the first element inside `<main>`**, before the first section. Anywhere else and `check` warns.
- **One block per document.** A second one is not read.
- **The field names are not free text** — they come from a schema, and a name the schema does not declare is a `check`
  warning. See "Metadata" below for the schema, the resolution chain and `planr meta`.
- **`planr read --text` prints each pair as `key: value`**, one line per pair.

### Interactive

#### `<plan-tabs>` / `<plan-tab>`
Tabbed content panels.
```html
<plan-tabs>
  <plan-tab label="Summary">
    <p>Summary content.</p>
  </plan-tab>
  <plan-tab label="Details">
    <p>Detail content.</p>
  </plan-tab>
</plan-tabs>
```
**Tab attributes:** `label` (button text). First tab is active by default.

### Callouts & Badges

#### `<plan-callout>`
Highlighted callout box.
```html
<plan-callout type="info">Key insight here.</plan-callout>
<plan-callout type="warn">Watch out for this.</plan-callout>
<plan-callout type="success">This is confirmed.</plan-callout>
<plan-callout type="danger">Critical risk.</plan-callout>
```
**Attributes:** `type` (info/warn/success/danger).

#### `<plan-badge>`
Inline status badge.
```html
<plan-badge type="decided"></plan-badge>  <!-- Auto-fills "Decided" -->
<plan-badge type="open">Custom Text</plan-badge>
```
**Attributes:** `type` (decided/open/deferred/high/medium/low). Each type colours with a tone (see "Tones and the header"): `decided` and `high` → `ok`, `open` and `medium` → `warn`, `deferred` → `muted`, `low` → `danger`.

Leave a status badge **empty** unless it needs words its type cannot say: an empty badge derives its label from `type`, so it stays correct through every `planr badge --set`. A badge with its own text keeps that text, which is why `badge --set` refuses to flip one without `--text`.

### Formulas & Principles

#### `<plan-formula>`
Highlighted formula or equation display.
```html
<plan-formula expr="Total = Subtotal × (1 + TAX_RATE)" note="TAX_RATE = 0.0875, applied at checkout"></plan-formula>
```
**Attributes:** `expr` (the formula), `note` (explanation — or use innerHTML).

#### `<plan-principles>` / `<plan-principle>`
Grid of design principles or key decisions.
```html
<plan-principles>
  <plan-principle label="Append-Only">Never mutate ledger entries.</plan-principle>
  <plan-principle label="Idempotent">Safe to retry any operation.</plan-principle>
</plan-principles>
```
**Attributes:** `label`.

### Code References

> **CRITICAL — escape `<`, `>`, and `&` in `<plan-file>` and `<plan-diff>` content.**
> These components read the element's text from the DOM, which means the browser's HTML parser sees your code *first*. Any literal `<` (e.g. `Vector<int>`, `</div>`, JSX, `a -> b<c>`) is misread as an HTML tag, and a literal `&` (e.g. `a && b`, `&str`) can be decoded as an entity — both corrupt the rendered code before the runtime ever runs. Write the entities in the source:
> - `<` → `&lt;`
> - `>` → `&gt;`
> - `&` → `&amp;`
>
> The runtime then displays them correctly (it re-escapes on output, but it cannot recover what the parser already mangled). This applies inside the element's text content — attribute values like `path=` and the `+`/`-` diff prefixes are unaffected. **The same escaping is required in *any* code shown as text — native `<pre><code>` blocks and inline `<code>` too** (see "Code Blocks with Syntax Highlighting"); a literal `<` there is misread as a tag, and if it's a `<plan-*>` tag it can corrupt `planr`'s section scanner.

#### `<plan-file>`
GitHub-style file code view with filename header, optional line range badge, line number gutter, and syntax highlighting.
```html
<plan-file path="server/app/orders/models.py" lines="42-58">
class OrderAuditLog(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE)
    checksum = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
</plan-file>
```
Use `new` for a new file (green "NEW" badge, gutter from line 1) or `add` to append to an existing file at an unspecified location, e.g. new test cases (blue "ADD" badge, `+N` gutter markers numbered within the chunk — `+1`, `+2`, …):
```html
<plan-file path="client/src/utils/formatters.js" new>...</plan-file>
<plan-file path="client/src/utils/__tests__/formatters.test.js" add>...</plan-file>
```
**Attributes:** `path` (header), `lines` (numeric range like `"42-58"` — `L42-58` badge + gutter start), `new` / `add` (booleans, see above), `lang` (override extension auto-detect).

`lines` is **strictly numeric** — never free-text. Non-numeric values are ignored (no badge, gutter starts at 1). Pick one: `lines` for a known location, `add` to append, `new` for a new file.

Language is auto-detected from the file extension (`.py` → `python`, `.js` → `javascript`, `.ts` → `typescript`, etc.). Use `lang` only when auto-detection would be wrong.

#### `<plan-diff>`
GitHub-style unified diff view with add/delete line coloring and dual line number columns.
```html
<plan-diff path="server/app/orders/models.py" old-start="45" new-start="45">
 class Order(models.Model):
     customer = models.ForeignKey(
-        Customer, on_delete=models.CASCADE,
+        Customer, on_delete=models.SET_NULL, null=True,
         related_name='orders',
     )
</plan-diff>
```
**Attributes:** `path` (file path shown in header), `old-start` (starting line number for removed lines, default 1), `new-start` (starting line number for added lines, default 1).

> **Every line needs a gutter character.** Column 0 of each line is the marker and is **always consumed**: a leading space = context, `+` = added, `-` = removed. This is the only thing that distinguishes a gutter `-`/`+` from a code line that *genuinely begins* with `-` or `+` (a negative literal, a leading unary operator, a CLI flag). To show such a line **unchanged**, give it the space gutter so the real character survives:
> ```html
> <plan-diff path="util/sign.py" old-start="10" new-start="10">
>  def normalize(x):
> -    return -x if x else 0
> +    return -x if x else 0.0
> </plan-diff>
> ```
> Here the context line `     return ...` and both changed lines keep their leading-space/`+`/`-` gutter; the `-x` in the code is preserved because the marker is a *separate* leading character. A line authored with **no** gutter character renders as context but is flagged amber with a ⚠ (and logged to the console) so the omission is visible rather than silently mis-colored or truncated.

**Line prefix convention:** Lines starting with `+` are additions (green), `-` are deletions (red), space or no prefix are context lines.

> **`plan-diff` is for changes; `plan-file` is for code.** A `<plan-diff>` whose content has no `+`/`-` lines renders fine, but it is the wrong tag: it labels an unchanged snippet as a change and spends two gutter columns saying nothing. Use `<plan-file>` for any code the reader is meant to *read* — an excerpt (`lines="42-58"`), a whole new file (`new`), or an appended block (`add`) — and `<plan-diff>` only when the point is what differs between two versions.

#### Embedding a whole file, and verifying the round-trip

When a `<plan-file>` carries a **complete file body** rather than an excerpt — a script or config the plan ships verbatim — generate the block programmatically and verify it survived, rather than trusting a visual scan. A single unescaped bracket truncates the render in a way that looks identical to a correct one at a glance.

- **Escape `&`, `<`, `>` only.** In Python that is `html.escape(s, quote=False)`. Escaping quotes too corrupts the payload, since the executor reads the embedded text as the literal file contents.
- **Splice between `<plan-file path="X" new>\n` and `\n</plan-file>`.** The closing tag's leading newline **is** the file's final newline, so the embedded text is the file minus exactly one trailing `\n`. A round-trip check that reports "off by 1 char" is therefore **correct** — re-add the `\n` before comparing, or you will chase a phantom.
- **Round-trip before shipping the plan.** Extract the embedded text back out, unescape it, and diff it against the source file.
- **Keep the real file authoritative.** Write the file to disk, run it, *then* embed. When a plan and an installed file both exist, treat the installed one as canonical and regenerate the embed from it — hand-editing the copy inside the HTML desynchronizes them with no error.

Prefer `planr set-body --file` / `add-section --body-file` to splice a generated block in: the body is written verbatim and the plan is never loaded into context.

### Diagrams

#### `<plan-diagram>`
Renders a [Mermaid](https://mermaid.js.org/) diagram from plain text — flowcharts, sequence diagrams, state diagrams, ER diagrams, Gantt charts, etc. Prefer this over hand-drawn SVG: it's far more compact, expressive, and themed automatically to match the plan. The element's content **is** the Mermaid source.
```html
<plan-diagram caption="Audit log write path on checkout">
flowchart LR
    A[Checkout request] --> B{Order valid?}
    B -- No --> C[Return 400]
    B -- Yes --> D[Persist Order]
    D --> E[Create OrderAuditLog]
</plan-diagram>
```
**Attributes:** `caption` (optional muted caption shown below the diagram).

The Mermaid library is **lazy-loaded from cdnjs at runtime** the first time a `<plan-diagram>` appears — nothing is added to the plan skeleton, and plans without diagrams load nothing extra. A diagram needs network access on first render; opened fully offline, it falls back to showing its source text. A diagram renders at its natural size, and one wider than the page scrolls horizontally rather than shrinking.

Write standard Mermaid syntax. Arrows like `-->` are safe, and a line break in a label is written literally as `<br/>`. Any other `<` that could read as a tag (`List<int>`) or `&` that could read as an entity must be escaped as `&lt;`/`&amp;`, for the same HTML-parser reason as `<plan-file>`/`<plan-diff>` above.

### Timeline

#### `<plan-timeline>` / `<plan-phase>`
Vertical timeline for phased rollout plans.
```html
<plan-timeline>
  <plan-phase num="1" title="Foundation" weeks="Weeks 1-2" color="blue">
    <ul><li>Set up models</li><li>Add migrations</li></ul>
  </plan-phase>
  <plan-phase num="2" title="Integration" weeks="Weeks 3-4" color="green">
    <ul><li>Wire up API</li><li>Add UI</li></ul>
  </plan-phase>
</plan-timeline>
```
**Attributes:** `num`, `title`, `weeks`, `color` (blue/green/purple/amber).

## Native HTML Elements

These require no custom component — just use them directly with plan-styles.css:

- **`<details>` / `<summary>`** — Collapsible sections (styled automatically).
- **`<code>`** — Inline code. Wrap in `<pre><code>` for blocks.
- **`<ul>`, `<ol>`** — Lists (styled with plan theme).

### Code Blocks with Syntax Highlighting

Code blocks use **highlight.js** (loaded from cdnjs) for automatic syntax highlighting. Just write standard `<pre><code>` blocks — hljs auto-detects the language:

> **Escape `<`, `>`, `&` here too.** A native `<pre><code>` or inline `<code>` that shows literal markup — e.g. an example `&lt;plan-section&gt;` — must use entities exactly like `<plan-file>`/`<plan-diff>`. An unescaped `<` renders as a real tag; if it's a `<plan-*>` tag it corrupts `planr`'s addressing. (`planr`'s body-injecting commands now abort rather than write a plan that would break, but escaping is the actual fix.)

```html
<pre><code>class OrderAuditLog(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE)
    checksum = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)</code></pre>
```

For explicit language hints (recommended when auto-detect might be ambiguous), add a `class="language-*"` attribute:

```html
<pre><code class="language-python">def test_audit_log_survives_order_deletion(self):
    self.order.delete()
    self.assertTrue(OrderAuditLog.objects.filter(pk=self.log.pk).exists())</code></pre>
```

Supported languages include: `python`, `javascript`, `bash`, `json`, `html`, `sql`, `diff`, and many more. Do NOT manually add `<span>` elements for syntax coloring — highlight.js handles this automatically.

## Utility CSS Classes

Apply these to any element:

| Class | Effect |
|-------|--------|
| `.muted` | Dimmed text (secondary info) |
| `.mono` | Monospace font |
| `.right` | Right-align text |
| `.green` | Green text (positive) |
| `.amber` | Amber text (caution) |
| `.red` | Red text (negative) |
| `.row-total` | Bold row in tables |

## Composition Guidelines

1. **Start with the generator.** Always run `planr new` first — never write raw HTML boilerplate.
2. **One `<plan-section>` per major topic.** These drive the nav.
3. **Use `<plan-tabs>` to reduce vertical scrolling** when a section has parallel views (e.g., summary vs. detail, by-tier breakdowns).
4. **Use `<plan-cards>` for 2-4 key metrics** at the top of quantitative sections.
5. **Use `<plan-table>` for structured data.** Standard `<table>` inside — the wrapper just applies theming.
6. **Use `<plan-callout>` sparingly** — for genuinely important notes, not every paragraph.
7. **Use native `<details>` for optional depth** — lengthy calculations, raw data, edge cases.
8. **Keep plan files semantic.** The CSS and JS live in the skill folder and are loaded at runtime. Don't inline styles or scripts in plan files.
9. **Encode code changes as `<plan-diff>` and `<plan-file>`, not prose.** Never write "Around line 45, remove the `CASCADE` argument and replace with `SET_NULL`" — instead, use a `<plan-diff>` that shows the exact change with line numbers, add/delete markers, and syntax highlighting. The markup is the instruction. Prose should describe *why* the change is made, not *what* lines to edit. Similarly, when referencing existing code to read or understand, use `<plan-file>` with the path and line range instead of describing it in a sentence.
10. **Link every reference to another plan document.** These files are read by clicking through them in a browser; a bare `<code>` path is a dead end. Wrap the `<code>` so the displayed text is unchanged: `<a href="../prd-<feature>.html"><code>prd-<feature>.html</code></a>`.
    - **The `href` is relative to the file that carries it, not to what the text displays.** A document one directory down cites a sibling as `../research/decisions.html` even where the text reads `research/decisions.html`. Resolve each path against the containing file and confirm it exists before writing it.
    - **A glob is never a link** (`notes/*.html`, `slices/<n>-*.html`, `tdds/`) — it is not a file. Leave it plain.
    - Don't double-wrap an existing `<a>`, and don't add icons or link text.
    - This is a rule for HTML documents. Plain-text instruction docs (`.md`) keep the bare backtick path.
11. **A document's `<plan-meta>` is the first element inside `<main>`**, directly below the header. See "Metadata" below for the schema, the resolution chain and `planr meta`.

## Using `planr`

`planr.js` is the single tool for plans — it **generates** a plan from a template and **manipulates** an existing plan by address. There is no separate generate step. Manipulating by address means an edit costs tokens proportional to the change, not the size of the plan; use `Edit` only when changing the *content inside* a component.

```bash
node .claude/skills/html-planning/planr.js <command> <file> [...]
```

Run `planr` with no arguments (or `--help`) to print usage.

### Addressing

One grammar for every address argument — the positional `<address>`, `--parent`, `--after`, `--before`, `--in`, and a dotted `new --set` key alike:

```
header                    the <plan-header>
<sectionId>               the section carrying that id, at any depth
<sectionId>.<child>…      a descendant, to any depth
```

Each segment after the first is a child's `id` or its **1-based ordinal** among siblings: `steps.step-3`, `steps.3`, `steps.3.detail`. A bare id resolves at **any depth** — `step-1` finds `steps.step-1` — because ids are unique document-wide. A document where two sections carry the id is refused, naming each one's full path and line. The full path is what `list` and `tasks` print, and an ordinal segment still needs its parent in front of it.

`set` is the one exception: its **last** segment is an attribute name, not a node (`steps.3.status=done`).

**`--into <sel>` is the only non-address selector**, and it never replaces an address — it names a plain HTML container *inside* an already-addressed section:

```
ul            the LAST <ul> the section owns   (what "the running list" means)
tr:2          the 2nd <tr>, 1-based
#tickets      the element carrying id="tickets"
```

"Owns" excludes anything inside a nested section, so `--into ul` on a parent never reaches a child section's list. `--into` refuses exactly the tags the dot-path addresses — `plan-section`, `plan-subsection`, `plan-header` — and accepts any other container, components included: `--into plan-defs` adds a `<plan-def>` pair, `--into plan-cards` a card. `read --body` on a parent still shows its nested sections' content; when an ordinal taken from it is out of range for `--into`, the error says nested sections are excluded.

### Command reference

**Positional args are order-sensitive; flags may appear in any order.** `<file>` is the plan path (for `new`, the output path).

| Command | Positional args | Flags | What it does |
|---------|-----------------|-------|--------------|
| `new` | `<file>` | `--title <T>` · `--template <name>` (default `basic`) · `--set <k=v>` (repeatable) | Generate a plan from a template. A **bare** `--set` key fills a `{{placeholder}}` the template declares (`lang`, `subtitle`, `status`, `reference-paths`, …); a **dotted** key is a node address applied to the generated file (`header.status=review`). Both are validated the same way, and an unusable key is an error, never a silent drop. A template's metadata fields are stamped from the schema. Run `templates <name>` for the variables a template offers. |
| `templates` | `[<name>]` | *(none)* | With no name, a table of every template and its one-line gist. With a name, that template's **full guidance** — the leading comment its author wrote — plus the sections it scaffolds. |
| `list` | `<file>` | `--no-outline` | Print the title, then every section as `num. id — title [status]`, indented by depth, **and each section's own `<h1>`–`<h6>` headings** — where a large plan's real structure lives, and the anchors `insert --before-heading` takes. `--no-outline` drops the headings for the rare document with hundreds of them. |
| `check` | `<file>` | `--strict` | **Authoritative structure validation, then warnings.** Per-tag balance for every `<plan-*>` and `<table>`/`<thead>`/`<tbody>`/`<tfoot>`/`<tr>`, a legal parent for every balanced tag — a `<tr>` directly in `<table>`/`<thead>`/`<tbody>`/`<tfoot>`, a cell in a `<tr>`, and no table tag or block component inside an inline element such as `<code>` — unregistered components, duplicate ids, and a tag census; exits **1** with the offending line numbers on any break. On a sound document it then lists, by line, markup that balances but will not render as written: an unescaped tag inside `<plan-file>`/`<plan-diff>`, a `<plan-diff>` line with no gutter character, link text that is only a section number (`&sect;5`), a badge whose label names a different type, a `<title>` that disagrees with the header title, and a template banner left at the top of `<main>`, a header carrying free-text `chips`, a `<plan-field>` stamp that disagrees with the schema, and a `blocked-by` target that does not exist. Warnings exit **0**; `--strict` exits **1** when there are any. |
| `tasks` | `<file>` | `--all` · `--status <s>` (comma-sep) | List sections carrying a `status`, excluding `done`; `--all` includes `done`, `--status` lists only the given statuses. Rows are `<address>  [status]  title`. |
| `read` | `<file> <address>` | `--body` · `--text` | Print the node's **outer** markup; with `--body`, just its **inner** content. With `--text`, plain text instead of markup, structure kept: one block per line, headings and numbered section titles as `#` lines, list items as `- ` lines, table rows as cells joined with ` \| `, badges as `[label]`, content carried in attributes (a card's value, a header's subtitle, a diagram's caption) on its own line, code components fenced with their lines verbatim. Nested sections are included either way; `--body` drops only the node's own title line. |
| `meta` | `<file>` | `--format text\|json` · `--set <k>=<v>` (repeatable) · `--unset <k>` (repeatable) · `--stamp` | With no `--set`/`--unset`, print the document's **resolved metadata** and where each value came from. With them, write the `<plan-meta>` block — creating it when absent, refusing an unknown field or an out-of-schema value, and stamping every field from the schema. `--stamp` alone rewrites each field's `label`/`tone`/`hidden` stamp from the schema without touching a value. See "Metadata" below. |
| `query` | `<dir\|glob>` | `--where <expr>` (repeatable) · `--has <k>` · `--missing <k>` · `--rank <name>` · `--sort <k[:asc\|desc],…>` · `--fields <cols>` · `--limit N` · `--format table\|json\|tsv\|paths` · `--strict` | Filter, sort and project a **corpus** of documents by their resolved metadata. Unreadable, non-document and unbalanced files are reported on stderr, never dropped. See "Querying" below. |
| `next` | `<dir\|glob>` | `--rank <name>` · `--format text\|json` · `--strict` | The single top-ranked document, with its metadata and the section addresses an agent needs to act on it. An empty queue exits 0. |
| `wordy` | `<file\|dir\|glob> …` | `--max-chars N` · `--max-sentences N` · `--max-sentence-chars N` · `--format text\|json` | Detect wordy lines — `long`, `dense`, `run-on` — in Markdown, plain text and HTML plan documents. Detects only; exits **1** when anything is flagged. See "Wordy lines" below. |
| `set` | `<file> <path>=<value> …` | *(none)* | Set attributes. **Every** assignment given is applied, each to the result of the last. |
| `set-body` | `<file> <address>` | `--file <f>` · `--append` | Replace the node's inner content (or `--append` before its closing tag). Body from `--file`, else **stdin**. |
| `prepend` | `<file> <address>` | `--file <f>` · `--into <sel>` | Insert a hunk at the **start** of the addressed body — or of a container inside it. |
| `append` | `<file> <address>` | `--file <f>` · `--into <sel>` | Insert a hunk at the **end** of that body / container, just above its closing tag. |
| `insert` | `<file> <address>` | `--before-heading <T>` \| `--after-heading <T>` **(one required)** · `--file <f>` · `--into <sel>` | Insert a hunk relative to an authored heading, matched on visible text (case-insensitive substring). |
| `badge` | `<file>` | `--match <text>` **(required)** · `--set <type>` **(required)** · `--in <addr>` · `--nth <n>` · `--all` · `--text <T>` | Flip a `<plan-badge>` inside the table row whose visible text contains `--match`. `--in` scopes the row search to a node; `--all` sets every matching row; `--nth <n>` picks the n-th badge **within** a row that carries several. A label that is just the old type's own label is cleared; any other label is refused unless `--text` says what to do with it. |
| `rm-item` | `<file> <address>` | `--match <text>` **(required)** · `--into <sel>` · `--nth <n>` \| `--all` | Remove the `<li>` or `<tr>` whose visible text contains `--match` — among the section's own items, or those inside the `--into` container. The innermost matching item is the one taken, and an item alone on its line takes the whole line with it. |
| `strike` | `<file> <address>` | `--match <text>` **(required)** · `--into <sel>` · `--nth <n>` \| `--all` | Wrap the matched text run in `<s>…</s>` — the amendment convention's strike. Refuses a run that crosses an element boundary, one already struck, and one inside a code component. |
| `replace` | `<file> <address>` | `--match <text>` **(required)** · `--with <T>` \| `--file <f>` (else stdin) · `--into <sel>` · `--nth <n>` \| `--all` | Replace the matched text run with the given markup, spliced verbatim. `--with ""` deletes the run. Refuses a run that crosses an element boundary, and refuses a replacement that would open a block element inside the match's parent — a `<tr>` landing in a cell's `<code>`. |
| `add-section` | `<file>` | `--id <id>` **(required)** · `--title <T>` · `--status <S>` · `--num <N>` · `--after <addr>` \| `--before <addr>` · `--parent <addr>` · `--body-file <f>` | Insert a section, empty or filled from `--body-file`. |
| `rm-section` | `<file> <address>` | *(none)* | Remove the section at that address, at any depth. |
| `move-section` | `<file> <address>` | `--after <addr>` \| `--before <addr>` **(one required)** | Move the addressed section beside a sibling. |

**Rules & gotchas:**

- **Placing a section:** `--after`/`--before` name a **sibling** — by full path or bare id — which fixes the new section's nesting depth too — so `add-section --id step-2 --after step-1` nests under `steps` with no `--parent`. Use `--parent <addr>` alone to append as that node's **last** child. Passing a `--parent` that contradicts the ref is an error, not a silent override. With neither, the section is appended at top level.
- **Numbers are automatic.** `1`, `1.1`, `1.1.2` derive from document position and re-derive after every add/move/remove — never write a `num` to keep a plan in order, and never renumber by hand. `num` is a label **override** only: a bare value (`"Part 1"`) replaces that one level and still joins onto its parent (`→ 5.1`); a dotted value (`5.1`) is the complete number, used as-is.
- **`status` values:** sections use `todo` / `in-progress` / `done` / `blocked`; the header uses `draft` / `review` / `approved` / `implemented` / `rejected`. `set` validates each against **its own** enum, and **rejects** an out-of-set status or a misspelled attribute (`staus`) — it never silently no-ops. That holds for `new --set header.status=…` too, which is the same code path.
- **Nothing is dropped in silence.** `set` applies every assignment it is given; `new --set` errors on a key that addresses nothing; a flag the command does not read is refused, naming the ones it does. If a command exits 0, every argument you passed took effect.
- **Ids are unique document-wide.** `add-section` rejects an id already used at any depth, and `check` reports a duplicate that got in another way.
- **Quotes in values:** a `set` value cannot contain a literal `"` (attributes are double-quoted). Use `&quot;` — the runtime decodes it on render.
- **Body input:** `set-body`, `prepend`, `append`, and `insert` read `--file <f>` if given, otherwise **stdin**. `replace` takes `--with <T>` first, then `--file <f>`, then stdin, and drops a body's trailing newline. `add-section` takes `--body-file <f>` (no stdin).
- **`set-body` is verbatim; the hunk commands fit the seam.** A `set-body` body owns its whitespace byte-for-byte (that is what makes the round-trip lossless). A `prepend`/`append`/`insert` hunk is placed at one point instead, so blank edge lines are dropped and the anchor's indentation is applied **only when the hunk carries none of its own**. Escaping is yours either way.
- **Round-trip:** `read --body <addr>` → edit the hunk → `set-body <addr>` is byte-for-byte lossless.
- **Ambiguity is an error, not a guess.** `insert --before-heading` refuses a text that matches two headings, and `badge --match` refuses a text that matches two rows (pass `--all` if you mean both). A text-addressed write numbers its candidates so `--nth <n>` can pick one, and takes every one only with `--all`. All of them list the candidates so you can narrow it.
- **Text-addressed writes match visible text.** These commands — `rm-item`, `strike`, `replace` — match `--match` as a case-insensitive substring of the **visible** text: entities decoded (`&amp;` and `&` in `--match` hit the same text), whitespace collapsed so a sentence wrapped across source lines still matches, inline markup adding nothing (`Alerts to <code>ops</code>.` reads `Alerts to ops.`), and a block boundary reading as one space. `badge --match` is looser: it reads every tag as a space. Each sees only what the addressed section **owns** — never a nested section's content (address the child) — and `--into <sel>` narrows that further. List items and table rows need explicit closing tags.
- **A text run stays inside one element.** `strike` and `replace` refuse a match whose ends sit in different elements — `to <code>ops</code>` is not one run — so narrow `--match` to text inside one. `strike` also refuses a run already inside `<s>`, and one inside `pre`, `plan-file`, `plan-diff` or `plan-diagram`, where markup corrupts the code; `replace` reaches both. Every refusal names the line.
- **`replace` rewrites; `insert` only adds.** A `prepend`/`append`/`insert` hunk never displaces anything, so using one to swap a sentence leaves both copies and `check` stays green. Rewrite text in place with `replace --match "…" --with "…"`. The replacement is markup, spliced verbatim — escape `<` `>` `&` as in any body. A rewrite spanning several elements is `read --body` → edit → `set-body`.
- **`replace` rewrites text inside an element, never the element.** `--match` hits its text wherever it is visible — a filename or id cited in a row usually sits in that row's own `<code>` cell — so a whole row given as the replacement would land inside the cell. `replace` refuses it and names the parent. Rewrite a row with `rm-item --match` then `append --into tbody`, or `read --body` → edit → `set-body` to keep its position.
- **`badge --set` never leaves a label naming the old state.** An empty badge derives its label from `type`, so it follows every flip. A badge whose text is only its current type's label (`Open` on `type="open"`, compared case-insensitively) is cleared, so the new type names it. A badge carrying any other text is **refused** unless you pass `--text`: `--text "<label>"` keeps or rewrites it, `--text ""` clears it. With `--all`, one refusal writes nothing.
- **Every attribute write is validated the same way.** `set`, `add-section` and `new` all reject a `status` outside its tag's enum and a `title` containing an HTML tag (titles are plain text). `set header.title=…` also rewrites the document's `<title>`, so the browser tab and the header never disagree.
- **`check` warns; `--strict` gates.** A warning never changes `check`'s exit code and never blocks a write — every writing command still aborts on a structure break alone — an unbalanced tag, or a balanced one in a parent it cannot sit in. Pass `--strict` where a warning should fail the run.
- **Not a general HTML editor.** Structural ops act on `<plan-section>` elements, assume one element per line, and leave comments in place. Every body-writing command — `set-body`, `prepend`, `append`, `insert`, `add-section`, `badge`, `rm-item`, `strike`, `replace` — **aborts without writing** if the splice would break the plan's structure.
- **`list` and `check` are the authoritative counts. Never `grep`.** `grep -c '<plan-section'` counts literal strings, so a commented example inflates the total — and the over-count stays *balanced*, so it never reads as a failure. Use `check` for balance, `list` for the count.
- **`read <addr> --body` is byte-faithful.** Indentation is preserved exactly; it prepends one leading newline and nothing else, so an `Edit` `old_string` can be lifted from its output directly.
- **Read for content with `--text`, for editing with `--body`.** `read --text` is for understanding a section without paying for its tags; it is lossy by design (attributes, inline markup and escaping are gone), so never lift an `Edit` `old_string` or a `set-body` hunk from it.
- **`planr` handles plans written before the CLI existed.** `list`, `read`, `set` and `set-body` address hand-authored files unchanged — no migration step.
- **A literal `sed -i` substitution is safe for text-content-only changes** (repointing a moved path): the file still parses and every tag pair stays balanced. It is not a substitute for `set-body` on a structural change. Run `check` either way.
- **Windows paths with forward slashes work from a POSIX shell** (`--file "C:/Users/.../hunk.html"`) with no `MSYS_NO_PATHCONV=1` prefix, because the path sits inside a quoted argument.

```bash
node .../planr.js new plan.html --title "My Plan" --template tdd      # generate
node .../planr.js new issue.html --template issue --title "Bug" \
                  --set header.status=review --set header.subtitle="Prod"   # header in one command
node .../planr.js list plan.html                                      # sections + their headings
node .../planr.js check plan.html                                     # is it still structurally sound
node .../planr.js tasks plan.html                                     # what's open
node .../planr.js set plan.html steps.3.status=done header.status=review       # both land
node .../planr.js read plan.html steps.step-1 --body > hunk.html      # pull a hunk to edit
node .../planr.js prepend plan.html resolution --file amendment.html  # amendment above the section
node .../planr.js append plan.html decisions --into ul --file gist.html        # one <li> onto the running list
node .../planr.js append plan.html vocab --into tbody --file rows.html         # rows onto a table
node .../planr.js insert plan.html resolution --before-heading "The six decisions" --file note.html
node .../planr.js badge plan.html --match "q16" --set decided         # flip a badge in a tickets table
node .../planr.js rm-item plan.html fog --match "graduated patch"     # the inverse of append --into
node .../planr.js strike plan.html resolution --match "retry hourly"  # strike superseded text in place
node .../planr.js replace plan.html resolution --match "hourly" --with "daily"   # rewrite text in place
node .../planr.js add-section plan.html --id risks --title "Risks" --after overview
node .../planr.js add-section plan.html --id step-2 --title "Wire it up" \
                  --status todo --after steps.step-1                  # nests under steps
```

### Editing a document too big to load

The characteristic write on a long-lived plan is **small and deep**: an amendment callout at the top of a resolution decided three sessions ago, one row onto a decision register, four rows onto a vocabulary table, one badge flipped in a ticket table. None of those is a whole-section rewrite, and none should cost a `set-body` of the surrounding 20KB.

| The write | Reach for |
|---|---|
| Amendment above everything in a section | `prepend <section> --file` |
| One more item on a running list | `append <section> --into ul --file` |
| More rows on a table | `append <section> --into tbody --file` |
| One more pair on a sub-record | `append <section> --into plan-defs --file` |
| Something next to a known heading | `insert <section> --before-heading "…" --file` |
| A status/badge transition | `set <addr>.status=…` · `badge --match … --set …` |
| Removing a list item or a table row | `rm-item <section> --match "…"` · `--into <sel>` to scope it |
| Striking a superseded sentence | `strike <section> --match "…"` |
| Rewriting a phrase or sentence in place | `replace <section> --match "…" --with "…"` |
| Replacing a whole section's content | `set-body <section> --file` |
| A field on the document's metadata | `meta --set k=v` |

**Prefer these over `Edit` for anything structural.** An `Edit` on a plan means hand-lifting an `old_string` out of a large file, which is where this toolchain's worst failure mode lives — and a `<plan-badge>` in a table row is usually an *empty* tag (`<plan-badge type="open"></plan-badge>`), so an `old_string` written assuming inner text matches nothing at all.

**Never reconstruct an `old_string` from a byte-truncated view of it.** `tail -c N` / `cut -c` cut mid-line, which makes wrapped prose look like it starts at a line boundary when it does not, and the `Edit` fails with "String to replace not found." Use `grep -n` plus `Read` with an offset for line-accurate text — or better, `prepend`/`append`/`insert` and skip the `old_string` entirely.

**To read a large plan for its content rather than to edit it, use `read --text`:**

```
planr.js read <f>.html <sec> --text
```

It keeps the structure a tag strip loses — a table row stays one line with its cells separated, a list item stays its own line, code stays verbatim inside a fence — and costs a fraction of the markup. Use `read --body` whenever you need the markup itself.

### Templates

Templates live in `./templates/`: `_shell.html` is the shared document + runtime loader (with a `{{body}}` slot), and every other `<name>.html` is a body selectable via `--template <name>`. Run `planr templates` for the current list; today it is:

| Template | For |
|---|---|
| `basic` | anything without a fixed spine — one starter section |
| `tdd` | test-driven implementation plans: overview → scope → recon → decisions → steps → callsites → migration → verification → anti-patterns |
| `issue` | a defect write-up: overview → root-cause → impact → remediation → not-affected → open |

**A template's section ids are fixed vocabulary owned by that document type, not by this skill.** Use them verbatim, fill the scaffold rather than inventing names, and never force one template's spine onto a document type it was not written for — use `basic` and structure the document as its type demands. A stable id is what makes every document addressable (`planr read plan.html anti-patterns`) and a corpus comparable. This skill decides *how* a document is formatted; the document type decides *what* it contains.

**A repo can add its own templates** without editing this skill folder, so updating the skill stays a plain overwrite. They go in **`.claude/planr-templates/`** — the directory beside `skills/` under the same `.claude` that holds this skill:

```
.claude/
├── skills/html-planning/templates/   ← shipped: _shell.html and the bodies above
└── planr-templates/                  ← the repo's own <name>.html bodies
```

- **They behave exactly like shipped templates.** `planr templates` lists them, marked `[consumer]`; `planr templates <name>` prints their leading comment; `new --template <name>` scaffolds them.
- **A consumer template shadows a shipped one of the same name**, visibly: its row reads `[consumer, shadows skill]`, and `new` names the file it used.
- **The shell stays the skill's.** A `_shell.html` in `planr-templates/` is an error, not an override. Other `_`-prefixed files are ignored, as they are in `templates/`.
- **The same rules apply.** A template with no leading comment, a literal plan tag inside that comment, or a scaffold that fails `check` is listed under **Template problems** by `planr templates`.
- Run from a path with no `.claude` ancestor, `planr` has no consumer directory.

**Read a template before using it.** Each one opens with a comment stating what it is for and the conventions it encodes; `planr templates <name>` prints that, along with the sections it scaffolds and the variables it accepts:

```bash
node .claude/skills/html-planning/planr.js templates          # all of them, one gist each
node .claude/skills/html-planning/planr.js templates tdd      # what tdd is for, and its conventions
```

**Setting values.** `new --set` takes two key shapes, told apart by whether the key has a dot:

- **bare** — `--set lang=fr` — fills a `{{placeholder}}` the template declares. The shell offers `lang`, `title`, `subtitle`, `status`, `date`, `skillSubpath`; `templates <name>` lists any others, with defaults.
- **dotted** — `--set header.status=review` — is a node address applied to the rendered document, reaching any `<plan-*>` node whether or not the template parameterised it.

Both are validated identically (`--set status=aproved` and `--set header.status=aproved` both fail), and a key that matches nothing is an error listing the ones that exist — never a silent drop.

> **Writing or changing a template?** See **`references/template-authoring.md`**.
>
> **Authoring a real document?** See **`references/authoring-traps.md`** — the failure modes that leave `planr check` green and the document wrong: ids carried in table rows, sequential-replace renumbering, unverified enumerations, escaping code bodies, patching from a dump, and the browser check for diagrams.

## Metadata

A document's **metadata** is the small set of facts a tool filters and sorts a whole directory of documents by — `type`, `status`, `reference-paths`, `blocked-by`, and whatever else a repo's schema declares — held in the document itself rather than in a separate index.

**Resolution chain.** Every field resolves through four sources, in order, and the first one that carries a value wins: the document's own `<plan-meta>` block, then a `<plan-header>` attribute (for a field declared `from: "header:…"`), then path inference (an `infer` rule matching `/issues/` can resolve `type=issue`), then a schema-declared default. A document with **no `<plan-meta>` block at all is still fully queryable** — the header and path sources alone resolve `title`, `status`, `date` and whatever the `infer` rules set — so adding the block to an existing corpus is optional, never a prerequisite.

**The schema.** The field vocabulary is **data, not code**: nothing about a field's name, type or enum values is hardcoded in `planr.js`. Two files are read, merged in this order: the shipped core (`planr-schema.json` beside `planr.js`) and, when it exists, a consuming repo's own **`.claude/planr-schema.json`**, found beside `planr-templates/` under the same `.claude` this skill installs into. A consumer field **replaces** the core field of the same name outright — never a key-by-key merge — because an enum's declared value order is load-bearing and there is no unambiguous way to merge two orders.

```json
{
  "fields": {
    "priority":  { "type": "enum", "values": ["p0", "p1", "p2"], "tones": { "p0": "danger", "p1": "warn" } },
    "component": { "type": "list", "hidden": true },
    "due":       { "type": "date", "label": "due by" }
  },
  "infer":    [{ "match": "/issues/", "set": { "priority": "p1" } }],
  "defaults": { "priority": "p2" }
}
```

Six field types: `enum`, `string`, `list`, `path`, `date`, `number`. For an `enum`, the declared `values` order **is** the sort order — never alphabetical. `list` is a repeatable `string`.

| Key | Applies to | Means |
|---|---|---|
| `fields.<name>.type` | every field | one of the six types (required) |
| `.values` | `enum` | the allowed values, in sort order |
| `.tones` | single-valued `enum` | value → tone for the header chip (see "Tones and the header") |
| `.hidden` | any field | `true` keeps it out of the header; still queryable |
| `.repeatable` | any type | the value is a comma-separated list, matched per item |
| `.min` / `.max` | `number` | bounds |
| `.from` | any field | `header:title\|status\|date` — a read-only view of that header attribute |
| `.label` | any field but a `from` one | the chip's text in place of the key; stamped onto each `<plan-field>` |
| `.blocks` | `path` | `true` makes each target a blocker of the document (see "Blockers") |
| `infer` | top level | `[{ "match": "<regex on path>", "set": { field: value } }]` |
| `defaults` | top level | field → value, the last resort of the chain |
| `rankings` | top level | name → `{ where, order }` (see "Rankings") |

Field names match `^[a-z][a-z0-9-]*$`, except `path` and `blocked`, which are built-in columns. Merge: a consumer field or ranking **replaces** the core one of the same name, a consumer default overrides per field, and consumer `infer` rules run **before** the core's. A malformed schema fails every command that loads it, naming the file.

**`planr meta`** reads and writes the block. With no `--set`/`--unset`, it prints the resolved value of every field and where each one came from:

```bash
$ planr meta plan.html
title   Quota cache has no invalidator   (header)
type    issue                            (meta)
status  draft                            (header)

unset: reference-paths, blocked-by

$ planr meta plan.html --format json    # the same record, machine-readable
$ planr meta plan.html --set reference-paths=server/project/crm,celery
$ planr meta plan.html --unset reference-paths
```

`--set` creates the `<plan-meta>` block as the **first element inside `<main>`** when none exists yet, and updates it in place otherwise. An unknown field or a value the schema refuses is **refused, never written** — exactly the rule `check` enforces below.

**What `check` says.** A metadata problem is reported as a **warning**, never a structure failure: an unknown field, a value the type or enum refuses, a duplicate key, a header-owned field written into the block (see below), a `<plan-meta>` that is misplaced or appears twice, and a `<plan-field>` sitting outside any block. Warnings never change `check`'s exit code and never block a write; `check --strict` is the gate.

**One writable home per fact.** A field declared `from: "header:…"` — `title`, `status`, `date` in the shipped core — is a **read-only view** of that header attribute, not a second place to store it. `planr meta --set` refuses to write one and names the real writer: `planr set <file> header.status=…`. A template may not declare one either, and `check` warns when a hand edit puts one in a block anyway.

**Template defaults.** A template declares metadata defaults by writing a literal `<plan-meta>` block at the top of its body, using `{{name:default}}` wherever the value should be fillable at scaffold time — no new template syntax. A placeholder left empty is dropped rather than written as an empty field, and a template may not declare a header-owned field. See **`references/template-authoring.md`** for the full convention.

### First-time setup

The shipped core declares only what every repo shares: `title`, `status` and `date` (views of the header), `type`
with the two document types the skill ships templates for — `issue` and `tdd` — plus `reference-paths` and
`blocked-by`. It infers nothing and defaults nothing. Declare the rest in **`.claude/planr-schema.json`**:

```json
{
  "fields": {
    "type": { "type": "enum", "values": ["prd", "spec", "tdd", "issue"] }
  },
  "infer": [
    { "match": "/issues/", "set": { "type": "issue" } },
    { "match": "/tdds/", "set": { "type": "tdd" } },
    { "match": "/prd-[^/]*\\.html$", "set": { "type": "prd" } }
  ],
  "defaults": { "type": "spec" }
}
```

- **Redeclare `type` whole to add a document type.** A consumer field replaces the core one, so keep `issue` and `tdd`
  in the list if you use those templates.
- **`infer`** sets fields from the document's path — a regex on the path, the first matching rule wins — and
  **`defaults`** fill whatever is still unset.
- Run `planr meta <file>` on a few documents to see which source each value came from.

### Tones and the header

Every coloured mark a document draws — a badge, the header status dot, a metadata chip's dot — colours by one of six
**tones**, each mapped onto the theme's own colours:

| Tone | Colour | Drawn by |
|---|---|---|
| `danger` | red | `rejected` status · `low` badge |
| `warn` | amber | `draft` status · `open`, `medium` badges |
| `info` | blue | `review` status |
| `ok` | green | `approved` status · `decided`, `high` badges |
| `final` | purple | `implemented` status |
| `muted` | grey | `deferred` badge |

The set is fixed: a schema **picks** a tone and never declares a colour.

- **An enum declares a tone per value** with `"tones"` beside `"values"`. A partial map is fine; a value with no tone
  renders as an untoned chip.
- **Any field opts out of the header** with `"hidden": true`. It stays fully queryable.
- **Any field can name its chip** with `"label"`: the chip shows the label instead of the key, and the hover still
  names the key, which is what `query` takes.
- **Refused at schema load:** a tone outside the six, a tone for an undeclared value, `tones` on anything but a
  single-valued enum, a non-boolean `hidden`, an empty `label`, and any of the three on a header-owned field (the
  header draws those itself).
- **The writer stamps; the page stays schema-free.** The browser cannot read the schema, so `planr` writes what
  rendering needs onto each `<plan-field>` as `label="…"`, `tone="…"` and `hidden`. `planr meta --set` stamps every
  field of the block it rebuilds, and `planr new` stamps a template's declared fields. **`planr meta <file> --stamp`**
  rewrites an existing document's stamps from the current schema without touching a value: run it after changing a
  schema's labels, tones or `hidden` flags, and once over documents written before 1.4.0.
- **`check` warns when a stamp disagrees with the schema**, and names `planr meta <file> --stamp` as the fix. A
  document with no stamps still renders: every field shows, untoned.

### Rich content

**Author an HTML body to a file, not through a shell heredoc.** Write it with your file-writing tool and splice it with `set-body --file` / `add-section --body-file`: the body is written verbatim, the plan is never loaded into context, and a splice that aborts leaves the body on disk to fix and retry.

**A single `set-body --file` of ~17KB is a normal operation** — there is no size-related failure mode, and structure is re-verified after every splice.

Rich content (paragraphs, code, diffs, callouts) is irreducibly the size of the content — but you can pay for the content *without* also paying to load the plan. Author the body as normal plan markup in a scratch file, then inject it by address with `add-section --body-file` or `set-body --file`; the plan is mutated in place and never read into context. To fix content in an existing section, pull just that hunk with `read --body`, edit it, and push it back with `set-body` — ~2× the hunk, still far less than materializing the whole plan. To *add* to a section rather than rewrite it, skip the read entirely and use `prepend` / `append` / `insert` (see "Editing a document too big to load"): the cost is the hunk alone. `set-body` and `add-section` splice **verbatim** (the body owns its whitespace); escaping is your responsibility exactly as when authoring markup directly.

## Querying

`planr meta` answers one document. `planr query` and `planr next` answer a **corpus**: which documents match, in what order, and which one to pick up. Both read the schema in force and the metadata every document resolves, so a document with no `<plan-meta>` block is still queryable from its header and its path.

```bash
planr query <dir|glob> [--where <expr> ...] [--has <k>] [--missing <k>] [--rank <name>]
                       [--sort <k[:asc|desc],...>] [--fields <cols>] [--limit N]
                       [--format table|json|tsv|paths] [--strict]
planr next  <dir|glob> [--rank <name>] [--format text|json] [--strict]
```

### What gets scanned

The target is a **directory**, a **single file**, or a **glob**:

| Target | Scans |
|---|---|
| `.claude/plans/issues` | every `*.html` under it, recursively |
| `.claude/plans/issues/quota.html` | that one file |
| `.claude/plans/**/tdds/*.html` | whatever the glob matches — `**` crosses directories (including none), `*` and `?` do not |

There is **no index and no cache**: the documents are read on every run. A 142-document, 8 MB corpus scans in about a quarter of a second.

A file the scan cannot use is **reported, never silently dropped**. Three reasons, printed on stderr so stdout stays exactly the result set, and carried in the `skipped` array under `--format json`:

```
2 file(s) skipped — scanned, not queryable:
  .claude/plans/issues/mockup.html: not a plan document — no <plan-*> markup
  .claude/plans/issues/old.html: structure does not balance — run `planr check` on it
```

`--strict` turns a non-empty skip list into exit 1, exactly as it does for `check`'s warnings. A target that resolves to **no files at all** is an error; a filter that matches no documents is not.

### Filtering

`--where`, `--has` and `--missing` are repeatable and **AND** together. Every comparison runs against the schema, so an unknown field or a value the field cannot hold is an error naming what *is* valid — never a silently empty result.

| Form | Means |
|---|---|
| `--where 'priority=p0'` | equals |
| `--where 'priority=p0,p1'` | equals any of them |
| `--where 'status!=implemented'` | equals none of them |
| `--where 'impact>=high'` · `<=` · `>` · `<` | compares positions in the field's **declared order** |
| `--where 'reference-paths~celery'` | case-insensitive substring |
| `--has blocked-by` | the field resolves a value |
| `--missing priority` | it does not |

Three rules worth knowing before the first surprise:

- **`>=` and friends read the declared order, not intuitive importance.** With `priority` declared `["p0","p1","p2","p3"]`, `priority<=p1` means "at index p1 or below" — p0 and p1, the *most* important. The schema's declaration order is the whole of the ordering.
- **A repeatable field matches per item.** `reference-paths~celery` and `reference-paths=celery` both hit `crm, celery`; `reference-paths=crm, celery` does not, because that is the raw string rather than one item. `>=`, `<=`, `>`, `<` and `--sort` refuse a repeatable field outright — it has no single position.
- **An unset field satisfies nothing** except `--missing` and `!=`. A document that declares no `status` does match `--where 'status!=implemented'`, which is what you want while a corpus is still being backfilled.

Narrow by **path** with the target glob, not with a filter — `path` is a column you can print, not a field you can filter.

### Sorting, projection and output

`--sort priority,impact:desc` sorts on the same declared order, **ascending by default for every field type**, so an enum sorts in the order the schema declares it and a ranking writes `:desc` where its enum runs least-to-most. Documents with no value for a sort key come **last in both directions**, and the sort is stable: ties keep path order.

`--fields path,title,priority` picks the columns. With none given, the columns are `path` plus every schema field that at least one matching document resolves — so a column is never all-empty and any field you filtered on is always shown.

| `--format` | For |
|---|---|
| `table` *(default)* | reading. Aligned columns, `-` for an unset value, a trailing `N of M document(s) match`. |
| `json` | **an agent or a script.** The counts, the column list, the schema files in force, the skip list, and one `{ value, raw, source, type, rank }` record per projected field — the same per-field shape `meta --format json` emits. |
| `tsv` | a pipeline. A header row, tab-separated, empty cell for unset. |
| `paths` | a loop. One path per line and nothing else. (`--fields` is refused here — there is one column.) |

`--limit N` cuts the result **after** sorting; the trailing count still reports how many matched.

### Rankings

A ranking is a named `where` + `order` preset declared **in the schema**, so each repo defines its own queue rather than inheriting one:

```json
{
  "rankings": {
    "default": {
      "where": { "status": { "ne": "implemented" }, "priority": { "set": true }, "blocked": { "eq": false } },
      "order": ["priority", "impact:desc", "urgency:desc", "effort:asc", "date:asc"]
    },
    "triage": { "where": { "priority": { "set": false } }, "order": ["date:asc"] }
  }
}
```

The `where` operators are `eq`, `ne`, `ge`, `le`, `gt`, `lt`, `in`, `contains` and `set` — the same nine the command line spells `=`, `!=`, `>=`, `<=`, `>`, `<`, `~`, `--has` and `--missing`. A ranking is validated **when the schema is read**, by the very code that runs it, so an unknown operator or an out-of-enum literal is refused at load rather than the first time somebody reaches for that ranking.

`--rank <name>` applies the preset. An explicit flag **replaces the preset's conditions on that field** and leaves the rest standing; `--sort`, when given, replaces the preset's order outright:

```bash
planr query .claude/plans/issues --rank default
planr query .claude/plans/issues --rank default --where 'impact=high'   # keeps the preset's status, priority and blocked rules
planr query .claude/plans/issues --rank default --sort date             # keeps the preset's filter, replaces its order
```

### Blockers

Record that a document waits on another with **`blocked-by`**, a repeatable `path` field the core declares with
`"blocks": true`:

```bash
planr meta q07-auth.html --set blocked-by=q04-tokens.html,../tdds/m1.html
```

- **A target resolves against the directory of the document naming it**, as a link does — a sibling is its bare file
  name.
- **A document is blocked while any target is open**: the file exists and its `status` is not `implemented` or
  `rejected`.
- **`blocked` is a derived column, not a field.** Filter on it with `--where blocked=false` or
  `"blocked": { "eq": false }` in a ranking's `where`, print it with `--fields path,blocked`, sort on it. Only `=` and
  `!=` apply. `query --format json` carries `blocked: { value, blockers }` on each result, and `next` prints a
  `blocked by:` list when the document it hands over is held. Nothing writes it — `meta --set blocked=…` is an
  unknown field.
- **A missing target never blocks, and `check` warns on it**, naming the command that removes the stale entry:
  `planr meta <file> --set blocked-by=…` with the targets that remain, or `--unset blocked-by`.
- Any `path` field may declare `"blocks": true`; `blocked` reads them all. No git history is consulted.

### `planr next` — handing one document to an agent

`next` is the top-ranked document and the addresses needed to act on it. It is driven by a **named ranking** and nothing else, defaulting to the one called `default`; with no ranking declared it says so rather than inventing an order.

```
$ planr next .claude/plans/issues
.claude/plans/issues/quota.html
Quota cache has no invalidator

  type             issue                       (meta)
  status           draft                       (header)
  reference-paths  server/project/crm, celery  (meta)
  priority         p0                          (meta)

  ranking 'default' — 1 of 7 matching, 122 scanned

open sections:
  impact       [in-progress]  Impact
  remediation  [todo       ]  Remediation

start at: impact
```

Under `--format json` the `document` object carries the path, the title, every resolved field, and the document's address space:

- **`sections`** — every section at every depth as `{ addr, num, title, status }`. `addr` is the same dot-path every other `planr` command takes, so a caller can `read`, flip a `status` or `append` without a `list` round-trip.
- **`open`** — the subset carrying a status other than `done`, which is where the work is.
- **`next_section`** — the first of those in document order, or `null`.

**An empty queue is an answer, not a failure.** `next` prints `no document matches ranking '<name>'` and exits **0**, with `"document": null` in JSON, so a caller polling "is there anything to do" can tell *nothing* from *broken*.

## Wordy lines

`planr wordy` measures prose and reports the lines a reader will struggle with. It **detects only** — rewriting is a skill's job, and `--format json` is the work list that skill consumes.

```bash
planr wordy .claude/context docs/guide.md   # files, directories and globs, as many as you like
planr wordy plan.html --format json         # the work list
```

| Kind | Flagged when | Limit (default) |
|---|---|---|
| `long` | the line has more characters than the limit | `--max-chars` (600) |
| `dense` | it has more sentences than the limit | `--max-sentences` (5) |
| `run-on` | its longest sentence has more characters than the limit | `--max-sentence-chars` (300) |

- **A line may carry several kinds:** `notes.md:182  long(5207) dense(14) run-on(1153)`. Findings are sorted by file, then line, and followed by a summary. **Exit 1 when anything is flagged**, 0 when clean — the `check --strict` convention.
- **What is read.** An `.html` or `.htm` file goes through the `read --text` conversion; its line number is the source line the text starts on. Anything else is read as plain text, line by line. A directory contributes its `.md`, `.markdown`, `.txt`, `.html` and `.htm` files.
- **Exempt:** fenced code (backtick or tilde fences), YAML front-matter at the top of a Markdown file, and headings.
- **Table cells are measured one by one** and reported as `table col N` — a cell can be compacted, never split.
- **A sentence** ends at `.`, `!` or `?` followed by whitespace and a capital letter or an opening marker (a backtick, `*`, `(`, `[` or a quote), once backtick spans and URLs are masked. `e.g.`, `i.e.`, `vs.` and `cf.` never end one. The rule is tuned for agent-written prose.
- **`--format json`** carries the limits, the counts and one item per finding: `path`, `line`, `column` (a table cell's, else `null`), `context` (`prose` or `table`), `section` (an HTML finding's section address, else `null`), `kinds` (each `{ kind, value, max }`) and an 80-character `preview`.

## Escaping Inside Code Components

**Escape `<`, `>` and `&` inside `<plan-file>`, `<plan-diff>` and `<code>`.** URL converters (`<uuid:pk>`, `<item_id>`), JSX tags and generics are parsed as HTML otherwise, and the browser eats the content **silently** — the document renders, the snippet is just missing its middle. The markup stays balanced, so the structure check passes.

## Architecture

```
.claude/skills/html-planning/
├── planr.js          ← Generate (from a template) + address-based plan mutator
├── planr-schema.json ← Shipped core metadata schema (field vocabulary, as data)
├── templates/        ← _shell.html (shared doc + loader) and <name>.html bodies (basic, tdd, …)
├── references/       ← Deep-dive docs, read on demand (template-authoring.md, authoring-traps.md)
├── plan-styles.css   ← Design system (loaded at runtime)
├── plan-runtime.js   ← Web Component definitions (loaded at runtime)
└── SKILL.md          ← This file (agent instructions)
```

The inline loader in each generated plan file finds `.claude/` in the file path and resolves the skill assets from there, appending the install subpath that `planr new` baked in at generation time (so the skill works under any folder name within `.claude/skills/`). Plan files contain only semantic markup — no CSS or JS.

Every rendered plan also gets a **view-settings gear** (floating, top-right) injected by the runtime, with per-reader toggles persisted via `localStorage`: **"Wrap long lines"** (soft-wraps code/diff blocks), **"Side-panel navigation"** (**on by default** — a left **side-panel tree** listing every section at every depth; turning it off falls back to the two-level top nav), **"Start sections collapsed"**, and **"Full-width content"** (drops the centered reading cap so content fills the available width). A toggle the reader has never touched tracks its default, so changing a default reaches everyone who hasn't opted out. The panel is runtime-injected from the live section tree and drawn as a file-tree with connector guides; it has a header with a collapse control, collapses to a floating opener, is resizable by dragging its right edge, and on narrow screens overlays full-screen. A single scroll-spy highlights the active section in whichever view is showing. This is all automatic; you don't author it, and you shouldn't hand-roll your own settings UI or navigation tree.
