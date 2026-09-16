# Authoring a plan template

Read this when **writing or changing a template**. To simply *use* one, `SKILL.md` and `planr templates <name>` are enough.

A template is a plan spine: the sections a document type always has, the conventions its content follows, and the guidance for whoever fills it in. Adding one is a **file drop, not a code change** — `--template <name>` and `planr templates` pick it up.

## The two halves

```
templates/
├── _shell.html      the shared document — <head>, runtime loader, <plan-header>, <main>
├── basic.html       ┐
├── tdd.html         ├ selectable bodies: --template <name>
└── issue.html       ┘
```

`_shell.html` is the whole document with a `{{body}}` slot; every other `<name>.html` is **only the markup that goes inside `<main>`**. The leading underscore is what marks the shell as not selectable, so `_shell.html` never appears in `planr templates`.

You will almost always be writing a body. Change `_shell.html` only to alter something every plan shares — a new document-level variable, a `<head>` addition.

## Where a template lives

A template is either **shipped** — in the skill's `templates/` — or **consumer-owned**, in `.claude/planr-templates/`, the directory beside `skills/` under the same `.claude` ancestor. Write a repo's own templates in the consumer directory: updating the skill overwrites `templates/` and never touches `planr-templates/`.

| | Shipped `templates/` | Consumer `.claude/planr-templates/` |
|---|---|---|
| Bodies (`<name>.html`) | yes | yes — same format, same rules |
| `_shell.html` | the one shell | refused — `planr` errors until it is removed |
| A name the other directory also has | — | the consumer template wins; `planr templates` marks it `[consumer, shadows skill]` |

Everything below applies to both. `planr templates` holds every template it lists to the leading-comment rules and to `check`, and prints any that fail under **Template problems**.

## Variables

Values fill via a zero-dep `{{var}}` substitution. A placeholder may **declare a default**:

| Written | Unset | With `--set name=value` |
|---|---|---|
| `{{lang:en}}` | `en` | the value |
| `{{subtitle:}}` | empty | the value |
| `{{owner}}` | **left literally as `{{owner}}`** | the value |

That last row is deliberate: a placeholder with no declared default and no value stays in the output, so a missing required variable is *visible* rather than silently empty.

**This is how a template declares its settable surface.** There is no list of allowed variables in `planr.js` — an attribute becomes configurable by being written as a placeholder, and it is immediately reported by `planr templates <name>` and by the error `--set` gives for an unknown key. Making an attribute settable and documenting it are the same act.

Names are `\w+`. Values are substituted through a function replacer, so a `$` in a value is never reinterpreted as a regex reference.

### Variables the generator always fills

| Name | Value |
|---|---|
| `title` | `--title`, defaulting to `Untitled Plan` |
| `date` | today, `YYYY-MM-DD` |
| `skillSubpath` | the skill's install path, baked into the loader — **do not repurpose this name** |
| `body` | the selected body template; consumed before substitution, so it is not a knob |

The shell also declares `lang`, `subtitle`, `status` and `chips`. Reuse those names in a body only if you mean the same thing — they share one namespace.

### How `--set` reaches your variables

`planr new` takes two kinds of `--set` key, and the shape tells them apart:

- **bare** (`--set lang=fr`) fills a `{{placeholder}}`. It must name one the template declares, or the command errors and lists the ones that exist.
- **dotted** (`--set header.status=review`) is a node address applied to the *rendered* document, so it reaches any `<plan-*>` node whether or not the template parameterised it.

Both are validated identically. If you add a placeholder whose value has a constrained set — a status, an enum — note that a bare fill bypasses `planSet`, so its validation lives in `planNew` and must be added there too. Otherwise the placeholder path silently accepts what the node path rejects.

## The leading comment is the template's documentation

**Open every template with an HTML comment** saying what it is for and the conventions it encodes. This is not decoration:

- its **first sentence** becomes the template's one-line gist in `planr templates`;
- the **whole comment** is what `planr templates <name>` prints;
- it is **left out of the document `planr new` writes**, so a scaffolded plan never opens with instructions to itself. `new` strips it with the same match `templates` reads it with, so the two never disagree about which comment is the guidance.

Write it for that person: what the document type is for, what each section is meant to contain, and the judgement calls the shape encodes. The `issue` template's comment is a good model — it explains *why* root cause and impact are separate sections, not just that they are.

Two rules the extractor depends on:

1. **Put it before any element.** Only a comment at the very top counts; anything after the first element is an ordinary inline comment and is ignored.
2. **Write no literal `<plan-…>` tag inside it.** A plan tag in a comment inflates a reader's `grep -c` structure count — and because it inflates the open and close counts equally, the total stays *balanced* and never looks like a failure. Refer to components in prose, or point at `planr add-section`.

Formatting: rule lines (`═══`) are stripped, and the block is de-indented by its shallowest content line, so bullets and indented examples survive intact. Separate paragraphs with a blank line — the gist is taken from the first one.

## Writing the body

Ordinary plan markup, subject to the same rules as any plan (`SKILL.md` is the component reference). Three that bite template authors specifically:

- **Never write `num=`.** Section numbers derive from document position and re-derive after every insert. A hardcoded `num` collides the moment someone adds a section.
- **Give every section a stable `id`.** Ids are addresses (`planr read plan.html anti-patterns`) and browser anchors, and a fixed vocabulary is what makes a corpus of plans comparable. Choose them as deliberately as the titles, and do not rename them later.
- **No inline `<style>`, `<script>`, or CSS custom properties.** Styling arrives at runtime; a template that inlines it breaks the contract for every plan it generates.

Seed each section with a sentence describing what belongs there rather than leaving it empty. That placeholder prose is what an author actually reads, and it is where a convention gets enforced — "Convention: a table of decision → rationale" does more work than an empty section.

## Verifying a new template

```bash
node .claude/skills/html-planning/planr.js templates              # gist reads correctly? no "Template problems"?
node .claude/skills/html-planning/planr.js templates <name>       # guidance + sections + variables
node .claude/skills/html-planning/planr.js new /tmp/probe.html --template <name>
node .claude/skills/html-planning/planr.js check /tmp/probe.html  # exits 1 on a structural break
node .claude/skills/html-planning/planr.js list /tmp/probe.html   # the spine, as a reader sees it
```

Check that no `{{placeholder}}` survives into the generated file unless you meant it to, and open the result in a browser once.

Done when all four hold: the gist reads as a sentence, `templates <name>` shows the guidance and every variable you declared, `check` exits 0, and `list` shows the spine you intended.

## A complete example

`templates/prd.html`:

```html
<!-- ════════════════════════════════════════════════════════
     PRD — what we are building and why, for a reader deciding
     whether to fund it.

     Conventions this template encodes:
       · Summary is one paragraph. If it needs two, the scope
         is not settled yet.
       · Requirements are must-haves only. A nice-to-have goes
         in Open Questions, where it can be cut without a
         renegotiation.
       · Every requirement names how it will be verified.
     ════════════════════════════════════════════════════════ -->

<plan-section id="summary" title="Summary">
  <p><strong>Owner:</strong> {{owner}}</p>
  <p>What we're building and why, in one paragraph.</p>
</plan-section>

<plan-section id="requirements" title="Requirements">
  <p>Convention: a table of requirement → how it is verified.</p>
  <plan-table>
    <table>
      <thead><tr><th>#</th><th>Requirement</th><th>Verified by</th></tr></thead>
      <tbody>
        <tr><td>1</td><td>The must-have.</td><td>What proves it shipped.</td></tr>
      </tbody>
    </table>
  </plan-table>
</plan-section>

<plan-section id="open-questions" title="Open Questions">
  <ul><li>Anything whose answer changes the requirements.</li></ul>
</plan-section>
```

```bash
node .claude/skills/html-planning/planr.js new checkout.html \
  --title "Checkout PRD" --template prd --set owner="Payments Team" --set status=review
```

`{{owner}}` declares no default, so omitting it leaves `{{owner}}` visible in the output — the intended signal that a required field was skipped. Give it one (`{{owner:unassigned}}`) if you would rather it be optional.
