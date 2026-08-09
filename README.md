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
  date="2026-05-26"
  chips="Backend | Database Updates">
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
5. Plan metadata badges, arbitrarily configured and prominently presented at the top.
6. Configurable line wrapping support for code snippets, plus adjustable view width.
7. Interactive tabs, collapsible components, and callout components.
8. Components for displaying structured data cleanly, such as timelines, cards, themed tables, formulas, and principles.
9. Per-section and per-step status pills (`todo`/`in-progress`/`done`/`blocked`) for tracking implementation progress in-place.

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

# use --template <name> to start from a spine (e.g. tdd); `planr templates` lists them

# --set takes the same addresses as `set`, so the header is filled in one command
node .claude/skills/html-planning/planr.js new plan.html --title "New Plan" --template issue \
  --set header.status=review --set "header.chips=Bug | Production"
```

Then start adding any relevant components, open in your browser and enjoy!

## Templates

`planr new` composes a plan from a template; three ship by default:

| Template | Use it for |
|----------|------------|
| `basic` | A minimal starting point — a single section, ready to fill in. |
| `tdd` | An opinionated software implementation plan with the canonical spine: Overview, Scope, Reconnaissance, Design Decisions, Implementation Steps, Callsite Audit, Verification, Anti-Patterns. |
| `issue` | A defect write-up: a danger callout stating the blast radius, root cause, impact table, remediation table, what is *not* affected, and open questions. |

After installing, delete or add templates as you see fit.

To interact with the template system:

```bash
# list available templates, with a one-line gist of each
node .claude/skills/html-planning/planr.js templates

# what a template is for, the conventions it encodes, and what it scaffolds
node .claude/skills/html-planning/planr.js templates tdd

# scaffold from the tdd template
node .claude/skills/html-planning/planr.js new plan.html --title "New Plan" --template tdd
```

All templates live in `templates/`. `_shell.html` is a parent template containing the `<head>` inline loader plus a slot for the template's body. As such, templates should just express the body of the final HTML document.

Templates can be parameterized with variables as needed.

### Writing a custom template

A template body is just the markup that goes inside `<main>`. Typically, this is a collection of `<plan-section>` elements.

Adding a new file into `templates/` immediately makes it available to the CLI.

**Open it with a comment saying what the template is for.** That leading comment is the template's documentation: its first sentence becomes the gist in the `templates` table, the whole thing is what `templates <name>` prints, and it ships inside every generated plan so the guidance reaches whoever fills the scaffold in. Write no literal `<plan-…>` tag inside it — that would inflate a reader's `grep -c` structure count — and put it before any element, or it reads as an ordinary inline comment.

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

(No `num=` — section numbers derive from document position and re-derive after every insert, so writing them by hand only creates collisions.)

Then scaffold from it, filling the custom field with `--set`:

```bash
node .claude/skills/html-planning/planr.js new checkout.html \
  --title "Checkout PRD" --template prd --set owner="Payments Team"
```

The body is injected into `_shell.html`'s `{{body}}` slot, and every `{{var}}` is substituted.

A placeholder can **declare a default** as `{{name:default}}`. That is how a template marks an attribute as a knob — write it as a placeholder and it becomes settable with `--set`, with no code change:

```html
<html lang="{{lang:en}}">              <!-- `en`, or --set lang=fr -->
  status="{{status:draft}}"            <!-- `draft`, or --set status=review -->
  subtitle="{{subtitle:}}"             <!-- empty, but settable -->
```

The vars `_shell.html` ships with:

| Placeholder | Default | Filled with |
|-------------|---------|-------------|
| `{{title}}` | `Untitled Plan` | `--title`, or `--set title=`; shown in the browser tab and the header. |
| `{{lang}}` | `en` | The document language, on `<html lang>`. |
| `{{subtitle}}` | *empty* | The header's subtitle line. |
| `{{status}}` | `draft` | The header's status — validated against `draft`/`review`/`approved`/`implemented`/`rejected`. |
| `{{chips}}` | *empty* | The header's pipe-delimited metadata chips. |
| `{{date}}` | today | `YYYY-MM-DD`, filled automatically. |
| `{{skillSubpath}}` | — | The skill's install path, baked into the loader. Rarely needs changing. |

Run `planr templates <name>` to see this list for any template, including its own vars. A `--set` key that matches no placeholder is an **error** listing the ones that exist — it is never silently dropped. A placeholder with **no** declared default and no value is left literally in the output, so a missing required var is visible rather than silent.

## Editing Plans Cheaply

The same token pressure that makes verbose HTML expensive to *write* also makes it expensive to *edit*. Agents looking to flip a single status have to read the whole plan back into context just to locate and change one string.

`planr.js` sidesteps that by mutating a plan **by address**, so an edit costs tokens proportional to the change, not the size of the document.

The full surface — `planr --help` prints the same list, and `SKILL.md` carries the per-flag reference:

| | Command | What it does |
|---|---|---|
| **Create** | `new` | Generate a plan from a template. `--set status=review --set lang=fr` fills the template's variables in the same command. |
| | `templates` | List the templates with a one-line gist each; `templates <name>` prints that one's full guidance. |
| **Inspect** | `list` | Every section as `num. id — title [status]`, plus the headings inside each one. `--no-outline` for sections alone. |
| | `check` | Authoritative structure validation — tag balance, unregistered components, duplicate ids, with line numbers. Exits 1 on a break. |
| | `tasks` | Just the sections carrying a status, with their addresses. `--all` · `--status <s>`. |
| | `read` | One node's markup; `--body` for its inner content only. |
| **Edit in place** | `set` | Set attributes. Every assignment given is applied. |
| | `badge` | Flip a `<plan-badge>` in a table row, found by the row's visible text. |
| **Write content** | `set-body` | Replace a node's whole inner content. |
| | `prepend` / `append` | Put a hunk at the start or end of a body — or of a container inside it, via `--into`. |
| | `insert` | Put a hunk beside an authored heading (`--before-heading` / `--after-heading`). |
| **Restructure** | `add-section` | Insert a section, empty or filled from `--body-file`. |
| | `rm-section` | Remove the section at an address, at any depth. |
| | `move-section` | Reorder a section beside a sibling. |

Every command that writes re-verifies the document afterwards and **aborts without writing** if the change would break it.

```bash
# orient without loading the file — every section, and the headings inside them
node .claude/skills/html-planning/planr.js list plan.html

# just the open work (sections/steps that aren't done), with addresses to act on
node .claude/skills/html-planning/planr.js tasks plan.html

# flip statuses (section, subsection, or header) — every assignment given is applied
node .claude/skills/html-planning/planr.js set plan.html steps.status=in-progress
node .claude/skills/html-planning/planr.js set plan.html steps.3.status=done header.status=review

# read one section back, add/remove/reorder sections
node .claude/skills/html-planning/planr.js read plan.html steps
node .claude/skills/html-planning/planr.js add-section plan.html --id risks --title "Risks" --after overview
node .claude/skills/html-planning/planr.js move-section plan.html risks --before timeline

# addresses are dot-paths, so the same commands work at any depth — and a
# sibling ref fixes the nesting, so a new step lands inside "steps"
node .claude/skills/html-planning/planr.js add-section plan.html --id step-4 --title "Wire it up" --after steps.step-3

# rich content: author a body in isolation, inject it by address (plan never loaded)
node .claude/skills/html-planning/planr.js add-section plan.html --id caching --title "Caching" --body-file body.html
node .claude/skills/html-planning/planr.js set-body plan.html caching --file body.html

# fix a section in place: pull just its hunk, edit, push it back (~2x the hunk, not the whole plan)
node .claude/skills/html-planning/planr.js read plan.html caching --body > hunk.html
node .claude/skills/html-planning/planr.js set-body plan.html caching --file hunk.html
```

On a long-lived plan the common edit is smaller still — an amendment above a section, one item onto a running list, four rows onto a table, one badge flipped — and none of those should cost a whole-section rewrite. Those go in at a point:

```bash
# the authoritative structure validation — exits 1 on a break, with line numbers
node .claude/skills/html-planning/planr.js check plan.html

# put a hunk at one point inside a section — start, end, or beside a heading
# (`list` above names the headings you can anchor on)
node .claude/skills/html-planning/planr.js prepend plan.html resolution --file amendment.html
node .claude/skills/html-planning/planr.js insert plan.html resolution --before-heading "The six decisions" --file note.html

# ...or inside a container within it: the running <ul>, a table's <tbody>
node .claude/skills/html-planning/planr.js append plan.html decisions --into ul --file gist.html
node .claude/skills/html-planning/planr.js append plan.html vocab --into tbody --file rows.html

# flip a <plan-badge> in a table row, found by the row's visible text
node .claude/skills/html-planning/planr.js badge plan.html --match "q16" --set decided
```

`planr.js` is zero-dependency and drives the same Web Component DSL the rest of the skill uses. See `SKILL.md` for the full command and addressing reference.

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
| `planr.js` | The CLI — generates plan skeletons (`planr new`), validates structure (`planr check`), and makes cheap, address-based edits to an existing plan (status flips, section add/remove/move, body swaps, hunk inserts) without re-reading the whole file. |
| `templates/` | Plan skeletons composed by `planr new` — `_shell.html` (shared document + inline loader) plus one selectable body per template (`basic`, `tdd`, `issue`). |
| `plan-runtime.js` | Web Component definitions loaded at runtime via the inline loader. |
| `plan-styles.css` | Plan design system, also injected via the inline loader. |
| `examples/sample-plan.html` | Sample file with every component listed. |
