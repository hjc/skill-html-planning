# Setting up a repo's metadata schema

Read this when **installing the skill into a repo for the first time**, or when a repo first needs a document type, path rule or default the shipped core does not have. To simply *read or write* metadata, `SKILL.md`'s "Metadata" section is enough.

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

Every key the schema accepts is in `SKILL.md`'s schema table, under "Metadata".
