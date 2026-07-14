# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This repo hosts the `html-planning` Claude Code skill — not a project that consumes it. The skill itself lives in `skills/html-planning/` (the **Vercel skills package layout**: the skill folder is a discovered `skills/<name>/SKILL.md` subfolder), and the repo root is a normal Node project. Editing files under `skills/html-planning/` changes the skill's behavior for every repo that installs it (via symlink or copy into `.claude/skills/<name>/` — any folder name works; see the runtime-load contract below). The runtime files are served as-is to the browser.

Everything at the repo **root** (`package.json`, `tests/`, `node_modules/`) is a sibling of the skill folder — it is never discovered and never installed, so dev tooling is "tree-shaken" out of the delivered artifact by construction.

`skills/html-planning/SKILL.md` is the agent-facing contract (loaded into Claude's context when the skill is invoked). `skills/html-planning/README.md` is the human-facing version. Both document the same component vocabulary — keep them in sync with the code.

## Verifying changes

The repo is a Node project (root `package.json`, vitest the only dev dependency). Run the tests with:
```bash
npm install
npm test        # vitest run — unit + integration suites
```
`tests/planr.unit.test.js` imports the pure engine directly (`planr.js` is import-safe: `module.exports` + `if (require.main === module) main()`), and `tests/planr.cli.test.js` drives the CLI as a subprocess (dispatch, exit codes, stderr, stdin, round-trips). `tests/helpers.js` reaches `planr.js` through a single `PLANR` path constant.

To verify a change to `plan-runtime.js` or `plan-styles.css`, open `skills/html-planning/examples/sample-plan.html` in a browser — it exercises every component. The sample plan loads its assets via the same inline loader as a real plan, so it only renders correctly when opened from a path where the loader can resolve the skill folder (it falls back to `.claude/skills/html-planning` relative to the page). When adding or changing a component, **add a demonstrating instance to `skills/html-planning/examples/sample-plan.html`** so the showcase stays complete.

Generate a fresh skeleton to test `planr`:
```bash
node skills/html-planning/planr.js new /tmp/test-plan.html --title "Test" --template tdd
```

## Architecture: the runtime-load contract

A generated plan file contains **only semantic `<plan-*>` markup** — no inline CSS or JS. All styling and behavior arrives at runtime. The mechanism:

1. `planr new` composes a plan from `templates/_shell.html` (the shared document whose `<head>` contains the **inline loader** — the one piece of JS that must live in the plan file) and a body template, filling `{{title}}`/`{{date}}`/`{{skillSubpath}}`/`{{body}}` via a zero-dep `{{var}}` substitution. The loader walks `location.pathname`, finds the `.claude` segment, and resolves `{plan-styles.css, plan-runtime.js}` from there. The skill's install subpath (e.g. `skills/html-planning`) is **baked into the loader at generation time** — `planr` derives it from `process.argv[1]` (its own invocation path, which preserves the symlinked `.claude/skills/<name>/` even though `__dirname` would resolve through the link to the source repo). This is why the skill **no longer needs a fixed folder name**: install it under any name within `.claude/skills/` and the generated plans point at it. If `planr` is run from a path with no `.claude` segment (e.g. editing the skill itself), it falls back to `skills/<its-own-folder-name>`. (Template *bodies* are read relative to `planr.js`'s own dir, so they resolve through the symlink to the source repo.)
2. `plan-styles.css` is the dark, GitHub-inspired design system (CSS custom properties in `:root`, then component classes).
3. `plan-runtime.js` defines a Web Component class per `<plan-*>` tag. Each `connectedCallback` reads attributes + existing `innerHTML` and rewrites `innerHTML` into styled markup that targets the CSS classes.

`file://`-opened plans are fully interactive but **cannot read source files** (browsers block `fetch()` of local files). Live source reads and exact git diffs are the job of **Mimir**, a separate companion desktop app — not this skill.

## Adding or changing a component

A component spans **four** places that must stay aligned:

1. **`plan-runtime.js`** — define the `HTMLElement` subclass and add it to the `components` map at the bottom (the map drives `customElements.define`).
2. **`plan-styles.css`** — add the classes the component's `innerHTML` references.
3. **`SKILL.md`** — document the tag, its attributes, and an example. This is what future Claude instances actually read; an undocumented component effectively does not exist.
4. **`skills/html-planning/examples/sample-plan.html`** — add a live instance.

`README.md`'s component list is a summary — update it when the set of components changes, but the per-attribute detail lives in `SKILL.md`.

### Runtime conventions to match

- **Ordering / timing:** components that need their children or sibling sections present (`plan-nav`, `plan-tabs`) defer work to `requestAnimationFrame`. highlight.js runs `hljs.highlightAll()` one frame after registration so components finish rewriting their `innerHTML` first. Preserve this ordering when touching anything that highlights code.
- **Per-line rows:** both `plan-file` and `plan-diff` render each source line as its own `[gutter][text]` flex row, wrapped in a `.file-inner`/`.diff-inner` element sized `min-width: 100%; width: max-content`. This keeps gutter numbers aligned with their code even when lines soft-wrap, and lets the add/del backgrounds span the full width on horizontal scroll. Because lines are highlighted individually (`hljs.highlight(line, …)`), neither component participates in `hljs.highlightAll()` — don't expect cross-line highlight context.
- **Escaping:** code-bearing components (`plan-file`, `plan-diff`) read `this.textContent` raw (via `_trimEdgeBlankLines`, which strips blank edge lines **without** touching the first content line's indentation — never use plain `.trim()` here), then escape via `_escapeHtml` before injecting. Attribute values are interpolated directly into `innerHTML` and are **not** escaped — they're authored by Claude, not untrusted input, so don't add escaping that would break intentional markup, but don't introduce a path where untrusted text reaches an attribute either.
- **Language detection:** `plan-file`/`plan-diff` map file extension → highlight.js language via `_extLangMap`. Extend that map rather than special-casing.
- **Numeric attributes:** `plan-file`'s `lines` is treated as a range only when it parses to a real integer (otherwise the gutter starts at 1). Keep this "parse-or-ignore" behavior for any new numeric attribute.
- **View settings (gear):** `_initPlanSettings()` (bottom of `plan-runtime.js`) injects a fixed top-right gear + popover with runtime view preferences, persisted to `localStorage` under `plan-view-settings`. Each setting is an entry in the `PLAN_SETTINGS` array (`{key, label, apply}`); `apply` typically toggles a class on `<html>` that CSS keys off. The first/only setting is `wrap` → `.plan-wrap` (switches code components from horizontal scroll to soft-wrap). Add a new toggle by pushing one entry and adding the matching CSS — no markup changes needed. The gear is vertically centered against `plan-nav`'s measured height via a `ResizeObserver` (nav has no fixed height and populates a frame late), falling back to its CSS `top` when no nav is present.
- **Lazy external libraries:** highlight.js is loaded eagerly by the generator skeleton, but `plan-diagram` lazy-loads **Mermaid from cdnjs at runtime** — `_ensureMermaid()` injects the UMD `mermaid.min.js` only the first time a `<plan-diagram>` connects, caches the load promise, and initialises it with `theme: 'base'` + `themeVariables` read from the plan's own CSS custom properties (so diagrams match the palette). This is the pattern for any future heavy/optional dependency: keep it out of the skeleton templates (backwards compat + lean skeletons) and lazy-inject it from the component that needs it, gated on that component's presence. Diagrams render via `mermaid.render(id, src)`; parse/load failures fall back to showing the raw source.

## The core authoring rules (enforced by SKILL.md)

When generating plans (not editing the skill itself), the non-negotiable rules are: always run `planr new` first; never write inline `<style>`/`<script>`/CSS-custom-properties in a plan file; never hand-roll `<div>` structures where a `<plan-*>` component exists; encode code changes as `<plan-diff>`/`<plan-file>` rather than prose ("around line 45, change X"). If you change these rules, change them in `SKILL.md` — that text is the source of truth agents load.
