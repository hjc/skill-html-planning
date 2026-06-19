# html-planning

`html-planning` is two things:

1. An LLM skill describing how to build rich, interactive plans (business development plans, product requirements documents, software implementation plans, etc.) in HTML using Web Components.
2. An associated runtime for these plans implemented in JavaScript and CSS using the Web Components technology.

The skill is unconcerned with **what to plan** and focuses more on **how to format** those plans.

## Why?

Recent research is showing that, while Markdown was initially the lingua franca for LLM planning workflows, [HTML is more effective](https://claude.com/blog/using-claude-code-the-unreasonable-effectiveness-of-html), primarily because it lowers cognitive overhead for the human operator or reviewer.

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
<plan-section num="1" title="Model Updates">
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
3. Sections and sub-sections, with a sticky nav to jump between them and clear identifiers.
4. Support for embedding Mermaid diagrams (lazy-loaded when diagrams are present).
5. Plan metadata badges, arbitrarily configured and prominently presented at the top.
6. Toggleable line wrapping support for code snippets.
7. Interactive tabs, collapsible components, and callout components.
8. Components for displaying structured data cleanly, such as timelines, cards, themed tables, formulas, and principles.

All in all, `html-planning` enables your agent to write semantically expressive plans that are considerably more pleasurable to read than those in raw Markdown.

## Contents

| File | Purpose |
|------|---------|
| `SKILL.md` | The skill definition (agent instructions + primer + component reference). |
| `generate.js` | Simple node script that emits a plan skeleton with the inline loader. |
| `plan-runtime.js` | Web Component definitions loaded at runtime via the inline loader. |
| `plan-styles.css` | Plan design system, also injected via the inline loader. |
| `examples/sample-plan.html` | Sample file with every component listed. |

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
node .claude/skills/html-planning/generate.js <plan-output-path>.html --title "New Plan"
```

Then start adding any relevant components, open in your browser and enjoy!
