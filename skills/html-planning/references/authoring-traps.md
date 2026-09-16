# Authoring traps

Failure modes hit while authoring real documents with `planr`. Each one leaves `planr check` green,
because the markup stays balanced — the document is wrong, not broken.

## Ids carried in table rows

**`planr check`'s "ids unique" covers `<plan-section>` ids only.** It does not see requirement or
criterion ids (`R3`, `AC12`) written into table rows. Inserting a new criterion beside a
thematically related row is how a duplicate gets in, and the document renders perfectly.

**New ids go at the end of the local space, never adjacent to the row they relate to** —
cross-reference instead. Audit after a renumber and after every edit that adds one:

```
grep -oE 'AC[0-9]+' <file> | sort -V | uniq -c
```

A count that rises on an existing id is either a new reference (fine) or a duplicate definition
(not); the `<tr><td>` form tells them apart.

**Renumber in one pass with a callback, never with sequential replaces.** Moving `AC14`–`AC28` into a
local `S5-AC1`–`S5-AC15` space means an early replacement's *output* (`S5-AC1`) contains a later
one's *input* (`AC1`), and sequential replaces corrupt it silently:

```python
re.sub(r'\bAC(\d+)\b', lambda m: MAP.get(int(m.group(1))) or m.group(0), s)
```

Then confirm every surviving bare id is one you meant to keep — prose *about* the old numbering
legitimately keeps the old id.

## Verifying an enumerated table

When a document's value is a complete enumeration (a property manifest, an endpoint list), extract
the rows back out and count them rather than re-reading the prose. The failure mode is a dropped or
duplicated row, which reads as correct and is invisible to `planr check`. Diffing the extracted name
sets of two tables also proves a claim that they cover the same things. Whenever you are asked to
reconcile a count, answer from an extraction.

## Escaping code bodies

**Author `<plan-file>` / `<plan-diff>` bodies unescaped, then escape them mechanically before
splicing.** Hand-escaping `&lt;` while writing — inside a format spec like `{name:<44}`, say — is
error-prone and unreadable. Write the body as normal source, apply `html.escape(inner, quote=False)`
(or the equivalent) between each open tag and its close, and only then `set-body --file`.

## Patching an existing document

**Lift a patch anchor from the dumped text, never retype it.** `planr read --body` preserves the
original wrapping, so a paragraph retyped at "natural" indentation matches nothing. Find the
distinctive phrase with `grep -n` in the dump and copy the surrounding lines verbatim, and assert the
anchor occurs exactly once before replacing it.

## Verifying diagrams

`planr check` validates structure, not Mermaid. A diagram with a syntax error renders as a
`.diagram-error` block with its source underneath, so check the rendered page, not the file. Load
the document in a headless browser, wait for `.diagram-render svg` (Mermaid is lazy-loaded, so the
`.diagram-render` container exists before any diagram has rendered), and evaluate:

```js
JSON.stringify({
  diagrams: document.querySelectorAll('plan-diagram').length,
  svg: document.querySelectorAll('.diagram-render svg').length,
  errors: [...document.querySelectorAll('.diagram-error')].map(e => e.textContent),
})
```

`svg` equal to `diagrams` with no `errors` is a pass. Read the text; a screenshot answers the same
question at many times the cost.
