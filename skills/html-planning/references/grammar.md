# planr grammars

Every structured argument `planr` parses, in EBNF. `SKILL.md` gives a one-line form for each and points here for the full grammar.

Notation (ISO 14977 style): `=` defines a rule, `,` concatenates, `|` separates alternatives, `[ … ]` is optional, `{ … }` repeats zero or more times, `"…"` is a terminal, `? … ?` is a plain-language set, `(* … *)` is a comment, and `;` ends a rule.

Each grammar is self-contained: it uses only its own rules and the common elements below. A rule name is defined once in the whole file, so no grammar shadows another's.

## Common elements

Shared by every grammar in this file.

```ebnf
digit          = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" ;
letter         = ? "A" to "Z" or "a" to "z" ? ;
ordinal        = digit , { digit } ;      (* 1-based *)
name           = ? letters, digits, "_" and "-" ? ;
section-id     = ? a section's id attribute ? ;
attribute-name = ? an attribute name the addressed tag accepts ? ;
field          = ? a field the schema declares, or "blocked" when a field declares "blocks" ? ;
```

`field` never includes `path`: `path` is the document's own path, a built-in column that `--fields` accepts and that no condition or sort key can name.

### Addresses

The one grammar for every address argument: the positional `<address>`, `--parent`, `--after`, `--before`, `--in`, and a dotted `new --set` key. `address` is a common element, so the grammars below use it directly.

```ebnf
address       = "header" | section-id , { "." , address-child } ;
address-child = section-id | ordinal ;   (* an ordinal counts that node's child sections *)
```

- `header` takes no children.
- The first segment is an id, never an ordinal. It resolves at **any depth**, because ids are unique document-wide; a document where two sections share the id is refused, naming each one's full path.
- A later segment that is all digits is an ordinal; anything else is a child's id.
- The full path is what `list` and `tasks` print.

## Set assignments

The positional arguments of `set`.

```ebnf
assignment       = address , "." , attribute-name , "=" , assignment-value ;
assignment-value = ? any text without a literal double quote ? ;
```

The **last** dotted segment is the attribute, never a node: `steps.3.status=done`. The value is everything after the first `=`. Write a `"` as `&quot;`.

## Scaffold keys

The values of `new --set`.

```ebnf
scaffold-key   = name , "=" , scaffold-value                            (* bare: fills a placeholder *)
               | address , "." , attribute-name , "=" , scaffold-value ;  (* dotted: sets an attribute *)
scaffold-value = ? any text ? ;
```

A key with no dot is a **bare** key and fills the template placeholder of that name, verbatim. A key with a dot sets an attribute on the rendered document exactly as `set` does, so its value takes the same rule: no literal `"`. A key that matches nothing is an error.

## Container selectors

The value of `--into`, which names a plain container inside an already-addressed section.

```ebnf
selector   = tag , [ ":" , ordinal ] | "#" , element-id ;
tag        = letter , { letter | digit | "-" } ;
element-id = ? an id attribute on any element in the section ? ;
```

- `tag` alone is the **last** such element the section owns; `tag:n` is the n-th, 1-based.
- "Owns" excludes anything inside a nested section.
- `plan-section`, `plan-subsection` and `plan-header` are refused: the address reaches those.

## Filter expressions

The values of `--where`, `--has` and `--missing` on `query` and `next`.

```ebnf
where-expr   = field , filter-op , filter-value ;
filter-op    = ">=" | "<=" | "!=" | "~" | "=" | ">" | "<" ;
filter-value = filter-item , { "," , filter-item }  (* a list only after "=" or "!=" *)
             | filter-text ;                       (* "~", ">=", "<=", ">", "<" take one value *)
filter-item  = ? text without "," ; surrounding spaces trimmed ? ;
filter-text  = ? any non-empty text ? ;
has-expr     = field ;                             (* --has: the field resolves a value *)
missing-expr = field ;                             (* --missing: it does not *)
```

| Operator | Means |
|---|---|
| `=` | equals one of the listed values |
| `!=` | equals none of them |
| `>=` `<=` `>` `<` | compares positions in the field's **declared order** |
| `~` | case-insensitive substring |

- The operator is the first token, in the order listed under `filter-op`, that appears anywhere in the expression; `>=` is tried before `>`. Field and value are trimmed.
- Every flag is repeatable, and they AND together. A second `--where` with the same operator on one field replaces the first.
- An unknown field, an empty field or value, or a value the field cannot hold is an error naming what is valid.
- `--where path…` is refused: narrow by path with the target glob.
- On a repeatable field, `=`, `!=` and `~` match per item, and the ordering operators are refused.
- An unset field satisfies only `--missing` and `!=`.

## Sort specs

The values of `--sort` and of a ranking's `order` entries.

```ebnf
sort-spec      = sort-key , { "," , sort-key } ;
sort-key       = field , [ ":" , sort-direction ] ;
sort-direction = "asc" | "desc" ;        (* default asc *)
```

A repeatable field is refused, because it has no single position. A document with no value for a key sorts last in both directions.

## Field lists

The value of `--fields`.

```ebnf
field-list = column , { "," , column } ;
column     = field | "path" ;
```

## Rankings

A ranking is JSON in the schema's `rankings` object, which maps a ranking's name to it. Its `where` uses the same conditions the filter flags parse into.

```ebnf
ranking       = "{" , [ ranking-member , [ "," , ranking-member ] ] , "}" ;  (* each key at most once *)
ranking-member = '"where": ' , where-object | '"order": ' , order-list ;
where-object  = "{" , [ condition , { "," , condition } ] , "}" ;
condition     = '"' , field , '": {' , op-entry , { "," , op-entry } , "}" ;
op-entry      = '"' , json-op , '": ' , json-literal ;
json-op       = "eq" | "ne" | "in" | "ge" | "le" | "gt" | "lt" | "contains" | "set" ;
json-literal  = json-scalar | json-array ;   (* "set" takes only json-boolean *)
json-scalar   = json-string | json-number | json-boolean ;
json-array    = "[" , [ json-scalar , { "," , json-scalar } ] , "]" ;
json-string   = ? a JSON string ? ;
json-number   = ? a JSON number ? ;
json-boolean  = "true" | "false" ;
order-list    = "[" , [ order-entry , { "," , order-entry } ] , "]" ;
order-entry   = '"' , field , [ ":" , ( "asc" | "desc" ) ] , '"' ;
```

| JSON op | Flag form |
|---|---|
| `eq`, `in` | `=` (`in` takes an array) |
| `ne` | `!=` (a string or an array) |
| `ge` `le` `gt` `lt` | `>=` `<=` `>` `<` |
| `contains` | `~` |
| `set: true` / `set: false` | `--has` / `--missing` |

Every operator but `set` compares a literal by its text, so `false` and `"false"`, or `3` and `"3"`, are the same literal: `"blocked": { "eq": false }` and `"blocked": { "eq": "false" }` mean one thing. `set` takes `true` or `false` only.

A missing `where` filters nothing; a missing `order` keeps path order. A ranking is validated when the schema is read, by the same code that runs it. A flag on a field the ranking filters replaces that field's conditions; `--sort` replaces `order` outright.

### As JSON Schema

The same ranking object, as a JSON Schema for one value of `rankings`. It checks shape only: whether a field exists, whether a literal is a value that field can hold, and whether an operator applies to it (`blocked` takes only `eq`, `in` and `ne`; a repeatable field takes no ordering operator) depend on the loaded schema, and `planr` checks them when it reads the schema.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "planr ranking",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "where": {
      "description": "field -> condition; every condition must hold",
      "type": "object",
      "propertyNames": { "pattern": "^[a-z][a-z0-9-]*$" },
      "additionalProperties": { "$ref": "#/$defs/condition" }
    },
    "order": {
      "description": "sort keys, most significant first; default direction asc",
      "type": "array",
      "items": { "type": "string", "pattern": "^[a-z][a-z0-9-]*(:(asc|desc))?$" }
    }
  },
  "$defs": {
    "condition": {
      "type": "object",
      "minProperties": 1,
      "additionalProperties": false,
      "properties": {
        "eq":       { "$ref": "#/$defs/scalar" },
        "in":       { "type": "array", "items": { "$ref": "#/$defs/scalar" } },
        "ne":       { "oneOf": [{ "$ref": "#/$defs/scalar" }, { "type": "array", "items": { "$ref": "#/$defs/scalar" } }] },
        "ge":       { "$ref": "#/$defs/scalar" },
        "le":       { "$ref": "#/$defs/scalar" },
        "gt":       { "$ref": "#/$defs/scalar" },
        "lt":       { "$ref": "#/$defs/scalar" },
        "contains": { "$ref": "#/$defs/scalar" },
        "set":      { "type": "boolean" }
      }
    },
    "scalar": {
      "description": "compared by its text: false and \"false\" are the same literal",
      "type": ["string", "number", "boolean"]
    }
  }
}
```

## Template placeholders

```ebnf
placeholder         = "{{" , name , [ ":" , placeholder-default ] , "}}" ;
placeholder-default = ? any text without "}" ? ;
```

A bare `new --set name=value` fills it. With no value given, `{{name:default}}` becomes its default (possibly empty) and `{{name}}` is left literally. Template conventions are in `references/template-authoring.md`.
