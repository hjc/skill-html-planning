---
name: html-planning
description: Format implementation plans, PRDs, BSDs, and design documents as interactive HTML using a Web Component DSL — instead of verbose hand-written CSS/HTML. Use when asked to produce or format any plan or design document as an HTML file.
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
   For a **TDD implementation plan**, add `--template tdd` to scaffold the canonical spine (see [Plan Templates & Canonical Sections](#plan-templates--canonical-sections)):
   ```bash
   node .claude/skills/html-planning/planr.js new <output-path> --title "My Plan" --template tdd
   ```
2. **Read the generated file.**
3. **Use `Edit`** (or `planr`) to add sections, cards, tables, and other components using the Web Component tags below.

## Plan Templates & Canonical Sections

`planr.js new --template tdd` scaffolds the **canonical TDD-plan spine** — a fixed set of section **ids** and titles that the pipefile corpus converged on over dozens of successful plans. Using the canonical ids matters for two reasons: plans become **reliably addressable** (`planr.js read plan.html anti-patterns` works because the id is always `anti-patterns`, never `antipatterns`/`risks`), and consistent across a corpus so cross-plan tooling is possible. Prefer this template for any test-driven implementation plan; fill in the pre-seeded scaffolding rather than inventing new section names.

| # | id | Title | Purpose | Content convention |
|---|----|-------|---------|--------------------|
| 1 | `overview` | Overview | Goal, background, the problem solved | prose |
| 2 | `scope` | Scope & Prerequisites | What's in / out of scope + prerequisites | prose + an info `plan-callout` |
| 3 | `recon` | Reconnaissance Summary | Load-bearing facts the executor may need | `plan-table` **File / Lines / What** (+ `plan-file` excerpts, `plan-callout` for key facts) |
| 4 | `decisions` | Design Decisions | The chosen approach and why | `plan-table` **# / Decision / Rationale** |
| — | `dataflow` | Data Flow *(optional)* | before→after / sequence of a refactor | prose + `plan-diagram` |
| 5 | `steps` | Implementation Steps | The TDD steps | one `plan-subsection` per step (with `status`), `<h4>Red Phase</h4>` / `<h4>Green Phase</h4>` rhythm, `plan-file`/`plan-diff` |
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
**Attributes:** `title`, `subtitle`, `status` (draft/approved/implemented/rejected), `date`, `chips` (pipe-delimited).

#### `<plan-nav>`
Auto-generated sticky nav bar. Discovers all `<plan-section>` elements and renders top-level links. Sections that contain `<plan-subsection>` children get a hover dropdown with links to each subsection. No attributes needed — just place it before `<main>`.
```html
<plan-nav></plan-nav>
```

#### `<plan-section>`
Top-level content section. Each becomes a nav target.
```html
<plan-section id="overview" num="1" title="Overview">
  <p>Content here.</p>
</plan-section>
```
**Attributes:** `id` (required for nav linking), `num` (badge number), `title`, `status` (optional: `todo`/`in-progress`/`done`/`blocked` — renders a colored pill in the heading; flip it cheaply with `planr` instead of re-editing the file).

#### `<plan-subsection>`
Lighter-weight section nested inside a `<plan-section>`. Subsections appear in the parent section's nav dropdown on hover. Use for TDD steps, sub-phases, or any second-level grouping.
```html
<plan-section id="steps" num="5" title="Implementation Steps">
  <plan-subsection id="step-1" num="1" title="Add OrderAuditLog model">
    <p>Red/green/refactor details here.</p>
  </plan-subsection>
  <plan-subsection id="step-2" num="2" title="Wire up signal handler">
    <p>Red/green/refactor details here.</p>
  </plan-subsection>
</plan-section>
```
**Attributes:** `id` (required for nav dropdown linking), `num` (badge number), `title`, `status` (optional: `todo`/`in-progress`/`done`/`blocked` — a per-step status pill, ideal for tracking TDD steps; flip it with `planr`).

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
> The runtime then displays them correctly (it re-escapes on output, but it cannot recover what the parser already mangled). This applies inside the element's text content — attribute values like `path=` and the `+`/`-` diff prefixes are unaffected. **The same escaping is required in *any* code shown as text — native `<pre><code>` blocks and inline `<code>` too** (see [Code Blocks](#code-blocks-with-syntax-highlighting)); a literal `<` there is misread as a tag, and if it's a `<plan-*>` tag it can corrupt `planr`'s section scanner.

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

Run `planr` with no arguments (or `--help`) to print usage. Every command is itemized below — read this table and you can operate the CLI without guessing.

### Command reference

Every top-level command. **Positional args are order-sensitive; flags may appear in any order.** `<file>` is the plan path (for `new`, the output path). Flags that take a value are shown as `--flag <x>`; boolean flags take no value.

| Command | Positional args | Flags | What it does |
|---------|-----------------|-------|--------------|
| `new` | `<file>` | `--title <T>` · `--template <name>` (default `basic`) · `--set <k=v>` (repeatable) | Generate a plan into `<file>` from a template. `--template tdd` scaffolds the canonical spine; `--set` fills extra `{{var}}` placeholders. |
| `templates` | *(none)* | *(none)* | List available template names, one per line. |
| `list` | `<file>` | *(none)* | Print the title then every section & subsection as `num. id — title [status]`. Orients you without loading the file. |
| `tasks` | `<file>` | `--all` · `--status <s>` (comma-sep) | List open tasks — nodes carrying a `status`, excluding `done`. Rows are `<address>  [status]  title`. `--all` includes done; `--status` filters to the given value(s). |
| `read` | `<file> <address>` | `--body` | Print the node's **outer** markup; with `--body`, just its **inner** content (byte-exact with `set-body`). |
| `set` | `<file> <path>=<value>` | *(none)* | Set one attribute by address — the **last** `.`-segment of `<path>` is the attribute name. |
| `set-body` | `<file> <address>` | `--file <f>` · `--append` | Replace the node's inner content (or `--append` before its closing tag). Body from `--file`, else **stdin**. |
| `add-section` | `<file>` | `--id <id>` **(required)** · `--num <N>` · `--title <T>` · `--status <S>` · `--after <ref>` \| `--before <ref>` · `--body-file <f>` | Insert a new section — empty, or filled from `--body-file`. Placed via `--after`/`--before`; else appended before `</main>`. |
| `rm-section` | `<file> <id>` | *(none)* | Remove the section with that id. |
| `move-section` | `<file> <id>` | `--after <ref>` \| `--before <ref>` **(one required)** | Move the section relative to another section. |

**Rules & gotchas (read these to avoid mistakes):**

- **Help:** run `planr` with no args, or `planr --help` / `-h`, to print usage.
- **Addressing (dot-paths):** `header` · `<sectionId>` (e.g. `steps`) · `<sectionId>.<n>` (Nth subsection, 1-based) · `<sectionId>.<subId>` (subsection by id). A `<ref>` in `--after`/`--before` is a **section id**.
- **`set` path grammar:** `<node>.<attr>=<value>` — e.g. `steps.status=done`, `steps.3.status=in-progress`, `header.status=approved`.
- **`status` values:** sections & subsections use `todo` / `in-progress` / `done` / `blocked`; the header uses `draft` / `approved` / `implemented` / `rejected`. `set` **rejects** an out-of-set status or an unknown attribute name (e.g. a typo like `staus`) with an error — it never silently no-ops.
- **`num` is a manual badge:** `add-section` / `move-section` / `rm-section` do **not** renumber siblings, so after reordering the `num` badges drift out of document order — fix them by hand with `set <id>.num=N`.
- **Quotes in values:** a `set` value cannot contain a literal `"` (attributes are double-quoted). Use `&quot;` — the runtime decodes it on render (e.g. `set plan.html 'header.subtitle=the &quot;remember me&quot; box'`).
- **Mutually exclusive:** `--after` and `--before` (passing both is an error). `move-section` requires exactly one.
- **Body input:** `set-body` reads `--file <f>` if given, otherwise **stdin** (`… | planr set-body plan.html steps`). `add-section` takes `--body-file <f>` (no stdin).
- **Round-trip:** `read --body <addr>` → edit the hunk → `set-body <addr>` is byte-for-byte lossless.
- **Structural ops** (`add-section`/`rm-section`/`move-section`) act on the `<plan-section>` element only, assume canonical one-element-per-line serialization, and leave decorative comments in place — they are **not** a general HTML editor. `set-body` and `add-section` **abort without writing** if the spliced content would break the plan's structure.
- **No subsection structural commands yet:** `add`/`rm`/`move-section` operate on top-level sections only. To add or reorder a `<plan-subsection>` (e.g. a new TDD step), edit its parent section's body via `read --body` → edit → `set-body`.

```bash
node .../planr.js new plan.html --title "My Plan" --template tdd     # generate
node .../planr.js tasks plan.html                                    # what's open
node .../planr.js set plan.html steps.3.status=done                  # nth-subsection attr
node .../planr.js read plan.html steps --body > hunk.html            # pull a hunk to edit
node .../planr.js add-section plan.html --id risks --title "Risks" --after overview
```

### Templates

Templates live in `./templates/`: `_shell.html` is the shared document + runtime loader (with a `{{body}}` slot), and every other `<name>.html` is a body selectable via `--template <name>`. Values fill via a zero-dep `{{var}}` substitution — `{{title}}`, `{{date}}`, `{{skillSubpath}}`, plus anything you pass with `--set`. **Add a new spine by dropping a `<name>.html` body file into `templates/`** — no code change; `--template <name>` and `planr templates` pick it up.

### Rich content

Rich content (paragraphs, code, diffs, callouts) is irreducibly the size of the content — but you can pay for the content *without* also paying to load the plan. Author the body as normal plan markup in a scratch file, then inject it by address with `add-section --body-file` or `set-body --file`; the plan is mutated in place and never read into context. To fix content in an existing section, pull just that hunk with `read --body`, edit it, and push it back with `set-body` — ~2× the hunk, still far less than materializing the whole plan. Bodies are spliced **verbatim** (they own their own whitespace), and escaping is your responsibility exactly as when authoring markup directly.

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

Every rendered plan also gets a **view-settings gear** (floating, top-right) injected by the runtime — currently a "Wrap long lines" toggle for code/diff blocks, persisted per reader via `localStorage`. This is automatic; you don't author it, and you shouldn't hand-roll your own settings UI.
