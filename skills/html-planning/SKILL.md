---
name: html-planning
description: Format implementation plans, PRDs, BSDs, and design documents as interactive HTML using a Web Component DSL — instead of verbose hand-written CSS/HTML. Use when asked to produce or format any plan or design document as an HTML file.
version: 1.1.0
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
   For a **TDD implementation plan**, add `--template tdd` to scaffold the canonical spine (see "Plan Templates & Canonical Sections" below); for a defect write-up, `--template issue`:
   ```bash
   node .claude/skills/html-planning/planr.js new <output-path> --title "My Plan" --template tdd
   ```
   Set header attributes in the **same command** with dotted `--set` keys — they use the ordinary address grammar, so there is no follow-up `set`:
   ```bash
   node .claude/skills/html-planning/planr.js new <output-path> --title "My Plan" --template issue \
     --set header.subtitle="What it covers" --set header.status=review --set "header.chips=Bug | Production"
   ```
2. **Read the generated file.**
3. **Use `planr`** (or `Edit`) to add sections, cards, tables, and other components using the Web Component tags below.
4. **Run `planr check <file>`** when you are done editing. It is the authoritative structure validation — never hand-roll a `grep -c '<plan-table>'` balance count.

## Plan Templates & Canonical Sections

`planr.js new --template tdd` scaffolds the **canonical TDD-plan spine** — a fixed set of section **ids** and titles. Use them verbatim: a stable id makes every plan addressable (`planr read plan.html anti-patterns` works because the id is never `antipatterns` or `risks`) and makes a corpus of plans comparable. Prefer this template for any test-driven implementation plan, and fill in the scaffold rather than inventing section names.

| # | id | Title | Purpose | Content convention |
|---|----|-------|---------|--------------------|
| 1 | `overview` | Overview | Goal, background, the problem solved | prose |
| 2 | `scope` | Scope & Prerequisites | What's in / out of scope + prerequisites | prose + an info `plan-callout` |
| 3 | `recon` | Reconnaissance Summary | Load-bearing facts the executor may need | `plan-table` **File / Lines / What** (+ `plan-file` excerpts, `plan-callout` for key facts) |
| 4 | `decisions` | Design Decisions | The chosen approach and why | `plan-table` **# / Decision / Rationale** |
| — | `dataflow` | Data Flow *(optional)* | before→after / sequence of a refactor | prose + `plan-diagram` |
| 5 | `steps` | Implementation Steps | The TDD steps | one nested `plan-section` per step (with `status`), `<h4>Red Phase</h4>` / `<h4>Green Phase</h4>` rhythm, `plan-file`/`plan-diff` |
| 6 | `callsites` | Callsite Audit | Every reference to the changed thing + its disposition | `plan-table` **# / Callsite / Change** |
| 7 | `verification` | Verification | Commands that prove it works | `<pre><code class="language-bash">` command + an "Expected: …" line |
| 8 | `anti-patterns` | Anti-Patterns | Tempting wrong approaches to forbid | `plan-table` **# / Don't / Why** |
| — | `open-questions` | Open Questions *(optional)* | Unresolved items needing a decision | list or `plan-table` |

**These table shapes are conventions, not components** — a decision row is just a `<tr>`, so it stays a `plan-table`. Match the column headers above so the corpus stays uniform; don't invent a `<plan-decision>` tag.

**This spine is a TDD *profile*, not a universal schema.** PRDs, BSDs, architecture docs, and issue write-ups have their own structures — for those, use the default `--template basic` (a single starter section) and structure the plan however the document type demands. Do **not** force the TDD spine onto a non-TDD plan.

## Component Reference

### Layout & Navigation

#### `<plan-header>`
Page header with title, status badge, and metadata chips.
```html
<plan-header
  title="Feature Plan"
  subtitle="Optional subtitle line"
  status="draft"
  date="2026-05-24"
  chips="Backend | Frontend | Phase 1">
</plan-header>
```
**Attributes:** `title`, `subtitle`, `status`, `date`, `chips` (pipe-delimited).

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
```html
<plan-table>
  <table>
    <thead><tr><th>Col 1</th><th>Col 2</th></tr></thead>
    <tbody><tr><td>Data</td><td>Data</td></tr></tbody>
  </table>
</plan-table>
```

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
**Attributes:** `type` (decided/open/deferred/high/medium/low).

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
Renders a [Mermaid](https://mermaid.js.org/) diagram from plain text — flowcharts, sequence diagrams, state diagrams, ER diagrams, Gantt charts, etc. Prefer this over hand-drawn SVG: it's far more compact, expressive, and themed automatically to match the plan. The element's text content **is** the Mermaid source.
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

The Mermaid library is **lazy-loaded from cdnjs at runtime** the first time a `<plan-diagram>` appears — nothing is added to the plan skeleton, and plans without diagrams load nothing extra. A diagram needs network access on first render; opened fully offline, it falls back to showing its source text. Write standard Mermaid syntax — arrows like `-->` are safe (a lone `>` is read as text), but if a node/edge label contains a literal `<` or `&`, escape it as `&lt;`/`&amp;` for the same HTML-parser reason as `<plan-file>`/`<plan-diff>` above.

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
<sectionId>               a top-level section
<sectionId>.<child>…      a descendant, to any depth
```

Each segment after the first is a child's `id` or its **1-based ordinal** among siblings: `steps.step-3`, `steps.3`, `steps.3.detail`. A bare id only resolves at the top level — a nested section always needs its full path (`steps.step-1`, never `step-1`).

`set` is the one exception: its **last** segment is an attribute name, not a node (`steps.3.status=done`).

**`--into <sel>` is the only non-address selector**, and it never replaces an address — it names a plain HTML container *inside* an already-addressed section:

```
ul            the LAST <ul> the section owns   (what "the running list" means)
tr:2          the 2nd <tr>, 1-based
#tickets      the element carrying id="tickets"
```

"Owns" excludes anything inside a nested section, so `--into ul` on a parent never reaches a child section's list. A `<plan-*>` tag is rejected here: address those with the dot-path.

### Command reference

**Positional args are order-sensitive; flags may appear in any order.** `<file>` is the plan path (for `new`, the output path).

| Command | Positional args | Flags | What it does |
|---------|-----------------|-------|--------------|
| `new` | `<file>` | `--title <T>` · `--template <name>` (default `basic`) · `--set <k=v>` (repeatable) | Generate a plan from a template. A **dotted** `--set` key is a node address applied to the generated file (`header.status=review`); a **bare** key fills a `{{placeholder}}`. Either way an unusable key is an error, never a silent drop. |
| `templates` | `[<name>]` | *(none)* | With no name, a table of every template and its one-line gist. With a name, that template's **full guidance** — the leading comment its author wrote — plus the sections it scaffolds. |
| `list` | `<file>` | `--no-outline` | Print the title, then every section as `num. id — title [status]`, indented by depth, **and each section's own `<h1>`–`<h6>` headings** — where a large plan's real structure lives, and the anchors `insert --before-heading` takes. `--no-outline` drops the headings for the rare document with hundreds of them. |
| `check` | `<file>` | *(none)* | **Authoritative structure validation.** Per-tag balance for every `<plan-*>` and `<table>`/`<thead>`/`<tbody>`/`<tfoot>`/`<tr>`, unregistered components, duplicate ids, and a tag census. Exits **1** with the offending line numbers on any break. |
| `tasks` | `<file>` | `--all` · `--status <s>` (comma-sep) | List sections carrying a `status`, excluding `done`. Rows are `<address>  [status]  title`. |
| `read` | `<file> <address>` | `--body` | Print the node's **outer** markup; with `--body`, just its **inner** content. |
| `set` | `<file> <path>=<value> …` | *(none)* | Set attributes. **Every** assignment given is applied, each to the result of the last. |
| `set-body` | `<file> <address>` | `--file <f>` · `--append` | Replace the node's inner content (or `--append` before its closing tag). Body from `--file`, else **stdin**. |
| `prepend` | `<file> <address>` | `--file <f>` · `--into <sel>` | Insert a hunk at the **start** of the addressed body — or of a container inside it. |
| `append` | `<file> <address>` | `--file <f>` · `--into <sel>` | Insert a hunk at the **end** of that body / container, just above its closing tag. |
| `insert` | `<file> <address>` | `--before-heading <T>` \| `--after-heading <T>` **(one required)** · `--file <f>` · `--into <sel>` | Insert a hunk relative to an authored heading, matched on visible text (case-insensitive substring). |
| `badge` | `<file>` | `--match <text>` **(required)** · `--set <type>` **(required)** · `--in <addr>` · `--nth <n>` · `--all` · `--text <T>` | Flip a `<plan-badge>` inside the table row whose visible text contains `--match`. |
| `add-section` | `<file>` | `--id <id>` **(required)** · `--title <T>` · `--status <S>` · `--num <N>` · `--after <addr>` \| `--before <addr>` · `--parent <addr>` · `--body-file <f>` | Insert a section, empty or filled from `--body-file`. |
| `rm-section` | `<file> <address>` | *(none)* | Remove the section at that address, at any depth. |
| `move-section` | `<file> <address>` | `--after <addr>` \| `--before <addr>` **(one required)** | Move the addressed section beside a sibling. |

**Rules & gotchas:**

- **Placing a section:** `--after`/`--before` name a **sibling by full address**, which fixes the new section's nesting depth too — so `add-section --id step-2 --after steps.step-1` nests under `steps` with no `--parent`. Use `--parent <addr>` alone to append as that node's **last** child. Passing a `--parent` that contradicts the ref is an error, not a silent override. With neither, the section is appended at top level.
- **Numbers are automatic.** `1`, `1.1`, `1.1.2` derive from document position and re-derive after every add/move/remove — never write a `num` to keep a plan in order, and never renumber by hand. `num` is a label **override** only: a bare value (`"Part 1"`) replaces that one level and still joins onto its parent (`→ 5.1`); a dotted value (`5.1`) is the complete number, used as-is.
- **`status` values:** sections use `todo` / `in-progress` / `done` / `blocked`; the header uses `draft` / `review` / `approved` / `implemented` / `rejected`. `set` validates each against **its own** enum, and **rejects** an out-of-set status or a misspelled attribute (`staus`) — it never silently no-ops. That holds for `new --set header.status=…` too, which is the same code path.
- **Nothing is dropped in silence.** `set` applies every assignment it is given; `new --set` errors on a key that addresses nothing. If a command exits 0, every argument you passed took effect.
- **Ids are unique document-wide.** `add-section` rejects an id already used at any depth, and `check` reports a duplicate that got in another way.
- **Quotes in values:** a `set` value cannot contain a literal `"` (attributes are double-quoted). Use `&quot;` — the runtime decodes it on render.
- **Body input:** `set-body`, `prepend`, `append`, and `insert` read `--file <f>` if given, otherwise **stdin**. `add-section` takes `--body-file <f>` (no stdin).
- **`set-body` is verbatim; the hunk commands fit the seam.** A `set-body` body owns its whitespace byte-for-byte (that is what makes the round-trip lossless). A `prepend`/`append`/`insert` hunk is placed at one point instead, so blank edge lines are dropped and the anchor's indentation is applied **only when the hunk carries none of its own**. Escaping is yours either way.
- **Round-trip:** `read --body <addr>` → edit the hunk → `set-body <addr>` is byte-for-byte lossless.
- **Ambiguity is an error, not a guess.** `insert --before-heading` refuses a text that matches two headings, and `badge --match` refuses a text that matches two rows (pass `--all` if you mean both). Both list the candidates so you can narrow it.
- **Not a general HTML editor.** Structural ops act on `<plan-section>` elements, assume one element per line, and leave comments in place. Every body-writing command — `set-body`, `prepend`, `append`, `insert`, `add-section`, `badge` — **aborts without writing** if the splice would break the plan's structure.

```bash
node .../planr.js new plan.html --title "My Plan" --template tdd      # generate
node .../planr.js new issue.html --template issue --title "Bug" \
                  --set header.status=review --set "header.chips=Bug | Prod"   # header in one command
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
node .../planr.js add-section plan.html --id risks --title "Risks" --after overview
node .../planr.js add-section plan.html --id step-2 --title "Wire it up" \
                  --status todo --after steps.step-1                  # nests under steps
```

### Editing a document too big to load

The characteristic write on a long-lived plan is **small and deep**: an amendment callout at the top of a resolution decided three sessions ago, one `<li>` onto a running gist, four rows onto a vocabulary table, one badge flipped in a ticket table. None of those is a whole-section rewrite, and none should cost a `set-body` of the surrounding 20KB.

| The write | Reach for |
|---|---|
| Amendment above everything in a section | `prepend <section> --file` |
| One more item on a running list | `append <section> --into ul --file` |
| More rows on a table | `append <section> --into tbody --file` |
| Something next to a known heading | `insert <section> --before-heading "…" --file` |
| A status/badge transition | `set <addr>.status=…` · `badge --match … --set …` |
| Replacing a whole section's content | `set-body <section> --file` |

**Prefer these over `Edit` for anything structural.** An `Edit` on a plan means hand-lifting an `old_string` out of a large file, which is where this toolchain's worst failure mode lives — and a `<plan-badge>` in a table row is usually an *empty* tag (`<plan-badge type="open"></plan-badge>`), so an `old_string` written assuming inner text matches nothing at all.

### Templates

Templates live in `./templates/`: `_shell.html` is the shared document + runtime loader (with a `{{body}}` slot), and every other `<name>.html` is a body selectable via `--template <name>`. Run `planr templates` for the current list; today it is:

| Template | For |
|---|---|
| `basic` | anything without a fixed spine — one starter section |
| `tdd` | test-driven implementation plans (the canonical spine above) |
| `issue` | a defect write-up: danger callout → root cause → impact table → remediation table → what is *not* affected → Open |

Values fill via a zero-dep `{{var}}` substitution — `{{title}}`, `{{date}}`, `{{skillSubpath}}`, plus any **bare** `--set` key naming a placeholder the template actually offers. A **dotted** `--set` key is not a placeholder at all: it is a node address applied to the rendered file, which is how the header is filled in the same command.

**A template's leading HTML comment is its documentation.** `planr templates <name>` prints it, so before using an unfamiliar template, read what its author wrote:

```bash
node .claude/skills/html-planning/planr.js templates          # all of them, one gist each
node .claude/skills/html-planning/planr.js templates tdd      # what tdd is for, and its conventions
```

The comment also ships inside every generated plan, so the guidance travels with the document to whoever fills the scaffold in.

**Add a new spine by dropping a `<name>.html` body file into `templates/`** — no code change; `--template <name>` and `planr templates` pick it up. Open it with a comment saying what the template is for and the conventions it encodes: the first sentence becomes its one-line gist in the table, and the rest is what `templates <name>` prints. Two rules for that comment — **write no literal `<plan-…>` tag in it** (it would inflate a reader's `grep -c` structure count, balanced, so it never looks like a failure), and put the comment **first**, before any element, or it is treated as an ordinary inline comment.

### Field notes

Established by driving `planr` against real multi-session plan sets. Each of these cost a failed edit or a wrong conclusion before it was written down; they are re-learned every session otherwise.

- **`list` and `check` are the authoritative section counts — `grep` is not.** `grep -c '<plan-section'` counts literal strings, so a commented example inflates the total. The over-count stays *balanced*, so it never reads as a failure, and reconciling it against `list` sends you hunting a splice bug that does not exist. Use `check` for balance and `list` for the count. (The shipped templates no longer contain a commented plan tag, but plans in the wild may.)
- **`read <addr> --body` is byte-faithful.** Indentation is preserved exactly; it prepends a single leading newline and nothing else. An `Edit` `old_string` can be lifted from its output directly.
- **…but never reconstruct an `old_string` from a byte-truncated view of it.** `tail -c N` / `cut -c` truncate mid-line, which makes wrapped prose look like it starts at a line boundary when it does not — the resulting `Edit` fails with "String to replace not found." Use `grep -n` plus `Read` with an offset to get line-accurate text. Better: use `prepend`/`append`/`insert` and skip the `old_string` entirely.
- **`planr` handles plans written before the CLI existed.** `list`, `read`, `set`, and `set-body` all address hand-authored plan files unchanged — no migration step.
- **Large splices are fine.** A single `set-body --file` of ~17KB into an existing section is a normal operation; there is no observed size-related failure mode. Structure is re-verified after every splice.
- **A literal `sed -i` substitution over a plan file is safe** for text-content-only changes (repointing a moved path, say) — the file still parses and every tag pair stays balanced. It is still not a substitute for `set-body` when the change is structural. Run `check` afterwards either way.
- **Windows paths with forward slashes work from the Bash tool** (`--file "C:/Users/.../hunk.html"`) with no `MSYS_NO_PATHCONV=1` prefix, because the path sits inside a quoted argument.

### Rich content

Rich content (paragraphs, code, diffs, callouts) is irreducibly the size of the content — but you can pay for the content *without* also paying to load the plan. Author the body as normal plan markup in a scratch file, then inject it by address with `add-section --body-file` or `set-body --file`; the plan is mutated in place and never read into context. To fix content in an existing section, pull just that hunk with `read --body`, edit it, and push it back with `set-body` — ~2× the hunk, still far less than materializing the whole plan. To *add* to a section rather than rewrite it, skip the read entirely and use `prepend` / `append` / `insert` (see "Editing a document too big to load"): the cost is the hunk alone. `set-body` and `add-section` splice **verbatim** (the body owns its whitespace); escaping is your responsibility exactly as when authoring markup directly.

## Architecture

```
.claude/skills/html-planning/
├── planr.js          ← Generate (from a template) + address-based plan mutator
├── templates/        ← _shell.html (shared doc + loader) and <name>.html bodies (basic, tdd, …)
├── plan-styles.css   ← Design system (loaded at runtime)
├── plan-runtime.js   ← Web Component definitions (loaded at runtime)
└── SKILL.md          ← This file (agent instructions)
```

The inline loader in each generated plan file finds `.claude/` in the file path and resolves the skill assets from there, appending the install subpath that `planr new` baked in at generation time (so the skill works under any folder name within `.claude/skills/`). Plan files contain only semantic markup — no CSS or JS.

Every rendered plan also gets a **view-settings gear** (floating, top-right) injected by the runtime, with per-reader toggles persisted via `localStorage`: **"Wrap long lines"** (soft-wraps code/diff blocks), **"Side-panel navigation"** (**on by default** — a left **side-panel tree** listing every section at every depth; turning it off falls back to the two-level top nav), **"Start sections collapsed"**, and **"Full-width content"** (drops the centered reading cap so content fills the available width). A toggle the reader has never touched tracks its default, so changing a default reaches everyone who hasn't opted out. The panel is runtime-injected from the live section tree and drawn as a file-tree with connector guides; it has a header with a collapse control, collapses to a floating opener, is resizable by dragging its right edge, and on narrow screens overlays full-screen. A single scroll-spy highlights the active section in whichever view is showing. This is all automatic; you don't author it, and you shouldn't hand-roll your own settings UI or navigation tree.
