# planr grammars

Every structured argument `planr` parses, in EBNF. `SKILL.md` gives a one-line form for each and points here for the full grammar.

Notation (ISO 14977 style): `=` defines a rule, `,` concatenates, `|` separates alternatives, `[ … ]` is optional, `{ … }` repeats zero or more times, `"…"` is a terminal, `? … ?` is a plain-language set, and `;` ends a rule.

## Addresses

The one grammar for every address argument: the positional `<address>`, `--parent`, `--after`, `--before`, `--in`, and a dotted `new --set` key.

```ebnf
address   = "header" | section , { "." , child } ;
section   = id ;
child     = id | ordinal ;
id        = ? a section's id attribute ? ;
ordinal   = digit , { digit } ;       (* 1-based, among that node's child sections *)
digit     = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" ;
```

- `header` takes no children.
- The first segment is an id, never an ordinal. It resolves at **any depth**, because ids are unique document-wide; a document where two sections share the id is refused, naming each one's full path.
- A later segment that is all digits is an ordinal; anything else is a child's id.
- The full path is what `list` and `tasks` print.

## Set assignments

The positional arguments of `set`.

```ebnf
assignment = address , "." , attribute , "=" , value ;
attribute  = ? an attribute name the addressed tag accepts ? ;
value      = ? any text without a literal double quote ? ;
```

The **last** dotted segment is the attribute, never a node: `steps.3.status=done`. The value is everything after the first `=`. Write a `"` as `&quot;`.

## Scaffold keys

The values of `new --set`.

```ebnf
scaffold-key    = placeholder-key , "=" , value | assignment ;
placeholder-key = name ;
name            = ? letters, digits, "_" and "-" ? ;
```

A key with no dot is a **bare** key and fills a template placeholder (see Template placeholders). A key with a dot is an `assignment` (see Set assignments), applied to the rendered document. A key that matches nothing is an error.

## Container selectors

The value of `--into`, which names a plain container inside an already-addressed section.

```ebnf
selector = tag , [ ":" , ordinal ] | "#" , element-id ;
tag      = letter , { letter | digit | "-" } ;
letter   = ? "A" to "Z" or "a" to "z" ? ;
element-id = ? an id attribute on any element in the section ? ;
```

- `tag` alone is the **last** such element the section owns; `tag:n` is the n-th, 1-based.
- "Owns" excludes anything inside a nested section.
- `plan-section`, `plan-subsection` and `plan-header` are refused: the address reaches those.

## Filter expressions

The values of `--where`, `--has` and `--missing` on `query` and `next`.

```ebnf
where-expr = field , op , value ;
op         = ">=" | "<=" | "!=" | "~" | "=" | ">" | "<" ;
value      = item , { "," , item }    (* a list only after "=" or "!=" *)
           | text ;                   (* "~", ">=", "<=", ">", "<" take one value *)
item       = ? text without "," ; surrounding spaces trimmed ? ;
text       = ? any non-empty text ? ;
field      = ? a schema field name, or "blocked" ? ;
has-expr   = field ;                  (* --has: the field resolves a value *)
missing-expr = field ;                (* --missing: it does not *)
```

| Operator | Means |
|---|---|
| `=` | equals one of the listed values |
| `!=` | equals none of them |
| `>=` `<=` `>` `<` | compares positions in the field's **declared order** |
| `~` | case-insensitive substring |

- The operator is the first token, in the order listed under `op`, that appears anywhere in the expression; `>=` is tried before `>`. Field and value are trimmed.
- Every flag is repeatable, and they AND together. A second `--where` with the same operator on one field replaces the first.
- An unknown field, an empty field or value, or a value the field cannot hold is an error naming what is valid.
- `path` is never a field: narrow by path with the target glob.
- On a repeatable field, `=`, `!=` and `~` match per item, and the ordering operators are refused.
- An unset field satisfies only `--missing` and `!=`.

## Sort specs

The values of `--sort` and of a ranking's `order` entries.

```ebnf
sort-spec = sort-key , { "," , sort-key } ;
sort-key  = field , [ ":" , direction ] ;
direction = "asc" | "desc" ;          (* default asc *)
```

A repeatable field is refused, because it has no single position. A document with no value for a key sorts last in both directions.

`--fields` takes a plain list:

```ebnf
field-list = column , { "," , column } ;
column     = field | "path" | "blocked" ;
```

## Rankings

A ranking is JSON in the schema's `rankings` object. Its `where` uses the same conditions the filter flags parse into.

```ebnf
ranking   = "{" , [ member , [ "," , member ] ] , "}" ;   (* each key at most once *)
member    = '"where": ' , where-obj | '"order": ' , order-list ;
where-obj = "{" , [ condition , { "," , condition } ] , "}" ;
condition = '"' , field , '": {' , op-entry , { "," , op-entry } , "}" ;
op-entry  = '"' , json-op , '": ' , literal ;
json-op   = "eq" | "ne" | "in" | "ge" | "le" | "gt" | "lt" | "contains" | "set" ;
literal   = string | string-array | boolean ;   (* a boolean for "set", and only there *)
order-list = "[" , [ '"' , sort-key , '"' , { "," , '"' , sort-key , '"' } ] , "]" ;
```

| JSON op | Flag form |
|---|---|
| `eq`, `in` | `=` (`in` takes an array) |
| `ne` | `!=` (a string or an array) |
| `ge` `le` `gt` `lt` | `>=` `<=` `>` `<` |
| `contains` | `~` |
| `set: true` / `set: false` | `--has` / `--missing` |

A missing `where` filters nothing; a missing `order` keeps path order. A ranking is validated when the schema is read, by the same code that runs it. A flag on a field the ranking filters replaces that field's conditions; `--sort` replaces `order` outright.

## Template placeholders

```ebnf
placeholder = "{{" , name , [ ":" , default ] , "}}" ;
default     = ? any text without "}" ? ;
```

A bare `new --set name=value` fills it. With no value given, `{{name:default}}` becomes its default (possibly empty) and `{{name}}` is left literally. Template conventions are in `references/template-authoring.md`.
