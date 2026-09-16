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

# start from a spine, and fill the header in the same command
node .claude/skills/html-planning/planr.js new plan.html --title "New Plan" --template issue \
  --set status=review --set "chips=Bug | Production"
```

Then start adding any relevant components, open in your browser and enjoy!

## Templates

`planr new` composes a plan from a template; three ship by default:

| Template | Use it for |
|----------|------------|
| `basic` | A minimal starting point — a single section, ready to fill in. |
| `tdd` | An opinionated software implementation plan with the canonical spine: Overview, Scope, Reconnaissance, Design Decisions, Implementation Steps, Callsite Audit, Callsite Migration List, Verification, Anti-Patterns. |
| `issue` | A defect write-up, one addressable section each: an overview whose danger callout states the blast radius, root cause, impact table, remediation table, what is *not* affected, and open questions. |

After installing, delete or add templates as you see fit.

Each one documents itself, so you can read a template before committing to it:

```bash
node .claude/skills/html-planning/planr.js templates       # all of them, one line each
node .claude/skills/html-planning/planr.js templates tdd   # what it is for, and what it scaffolds
```

All templates live in `templates/`. `_shell.html` is a parent template containing the `<head>` inline loader plus a slot for the template's body, so a template only expresses the body of the final document, and can be parameterized with variables.

### Writing a custom template

A template body is just the markup that goes inside `<main>`. Typically, this is a collection of `<plan-section>` elements.

Adding a new file into `templates/` immediately makes it available to the CLI.

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
```

Addresses are dot-paths, so the same commands reach any depth: `steps.step-3.detail`.

On a long-lived plan the common edit is smaller still — an amendment above a section, one item onto a running list, four rows onto a table, one badge flipped — and none should cost a whole-section rewrite. Those go in at a point:

```bash
planr prepend plan.html resolution --file amendment.html            # above everything in a section
planr insert  plan.html resolution --before-heading "Decisions" --file note.html
planr append  plan.html decisions --into ul --file gist.html        # one <li> onto the running list
planr append  plan.html vocab --into tbody --file rows.html         # rows onto a table
planr badge   plan.html --match "q16" --set decided                 # flip a badge in a table row
```

Every command that writes re-verifies the document afterwards and **aborts without writing** if the change would break it — and `planr check` validates one on demand, exiting non-zero on a structural break so CI can gate on it.

`planr.js` is zero-dependency and drives the same Web Component DSL the rest of the skill uses. The rest of the surface — `new`, `templates`, `tasks`, `add-section`, `rm-section`, `move-section`, and every flag — is in `planr --help` and `SKILL.md`.

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
| `references/` | Deep-dive docs the skill points at rather than inlining — `template-authoring.md` and `authoring-traps.md`. |
| `plan-runtime.js` | Web Component definitions loaded at runtime via the inline loader. |
| `plan-styles.css` | Plan design system, also injected via the inline loader. |
| `examples/sample-plan.html` | Sample file with every component listed. |
