---
name: html-planning
description: Format implementation plans, PRDs, BSDs, and design documents as interactive HTML using a Web Component DSL — instead of verbose hand-written CSS/HTML. Use when asked to produce or format any plan or design document as an HTML file.
---

# html-planning

Format implementation plans, PRDs, BSDs, and design documents as interactive HTML using a Web Component DSL. This skill handles **how to format** — domain skills handle **what to plan**.

## CRITICAL RULES

1. **You MUST run `generate.js` before writing any plan content.** This is non-negotiable. The generator creates the skeleton with the inline loader that resolves `plan-styles.css` and `plan-runtime.js` from the skill folder. Without it, the plan has no styling or interactivity.

2. **NEVER write inline `<style>` blocks, CSS custom properties, or `<script>` blocks in plan files.** All styling comes from `plan-styles.css`, loaded at runtime by the skeleton's inline loader. If you find yourself writing CSS in a plan file, STOP — you are doing it wrong.

3. **NEVER write raw `<div>` structures for visual elements.** Use the Web Component tags documented below (`<plan-card>`, `<plan-callout>`, `<plan-table>`, `<plan-tabs>`, etc.). These are defined in `plan-runtime.js` and styled by `plan-styles.css`.

4. **Plan files contain ONLY semantic markup.** No CSS. No JS. Just the HTML skeleton from the generator plus the Web Component tags you add via `Edit`.

## Quick Start

1. **Generate the skeleton** (MANDATORY first step):
   ```bash
   node .claude/skills/html-planning/generate.js <output-path> --title "My Plan"
   ```
2. **Read the generated file.**
3. **Use `Edit`** to add sections, cards, tables, and other components using the Web Component tags below.

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
**Attributes:** `id` (required for nav linking), `num` (badge number), `title`.

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
**Attributes:** `id` (required for nav dropdown linking), `num` (badge number), `title`.

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
> The runtime then displays them correctly (it re-escapes on output, but it cannot recover what the parser already mangled). This applies **only inside the element's text content** — attribute values like `path=` and the `+`/`-` diff prefixes are unaffected.

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

1. **Start with the generator.** Always run `generate.js` first — never write raw HTML boilerplate.
2. **One `<plan-section>` per major topic.** These drive the nav.
3. **Use `<plan-tabs>` to reduce vertical scrolling** when a section has parallel views (e.g., summary vs. detail, by-tier breakdowns).
4. **Use `<plan-cards>` for 2-4 key metrics** at the top of quantitative sections.
5. **Use `<plan-table>` for structured data.** Standard `<table>` inside — the wrapper just applies theming.
6. **Use `<plan-callout>` sparingly** — for genuinely important notes, not every paragraph.
7. **Use native `<details>` for optional depth** — lengthy calculations, raw data, edge cases.
8. **Keep plan files semantic.** The CSS and JS live in the skill folder and are loaded at runtime. Don't inline styles or scripts in plan files.
9. **Encode code changes as `<plan-diff>` and `<plan-file>`, not prose.** Never write "Around line 45, remove the `CASCADE` argument and replace with `SET_NULL`" — instead, use a `<plan-diff>` that shows the exact change with line numbers, add/delete markers, and syntax highlighting. The markup is the instruction. Prose should describe *why* the change is made, not *what* lines to edit. Similarly, when referencing existing code to read or understand, use `<plan-file>` with the path and line range instead of describing it in a sentence.

## Architecture

```
.claude/skills/html-planning/
├── generate.js       ← Skeleton generator (run once per plan)
├── plan-styles.css   ← Design system (loaded at runtime)
├── plan-runtime.js   ← Web Component definitions (loaded at runtime)
└── SKILL.md          ← This file (agent instructions)
```

The inline loader in each generated plan file finds `.claude/` in the file path and resolves the skill assets from there, appending the install subpath that `generate.js` baked in at generation time (so the skill works under any folder name within `.claude/skills/`). Plan files contain only semantic markup — no CSS or JS.

Every rendered plan also gets a **view-settings gear** (floating, top-right) injected by the runtime — currently a "Wrap long lines" toggle for code/diff blocks, persisted per reader via `localStorage`. This is automatic; you don't author it, and you shouldn't hand-roll your own settings UI.
