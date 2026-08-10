---
description: Dump the full working state of this session to a branch-keyed handoff doc so a fresh session can resume without loss.
argument-hint: [optional — what to emphasize or additional context to capture]
---

# Handoff

Write everything you currently know about this session's work to a handoff document, so a fresh agent with **zero context** can pick the work back up and continue without asking the user to re-explain anything.

This exists because context compaction is lossy. You are the last agent that still holds the full picture — write it down now, deliberately, while you still have it.

## Step 1 — Resolve the target path

```bash
git rev-parse --abbrev-ref HEAD | tr '/' '-'
```

The handoff file is `.claude/handoffs/<that value>.md`. Example: branch `feat--usage-fixes` → `.claude/handoffs/feat--usage-fixes.md`.

Create `.claude/handoffs/` if it does not exist.

**Fold forward prior handoff content — never silently drop it.** An earlier session may have recorded a dead end or a standing order that this session no longer holds in context. Two cases:

- **A live handoff already exists at that path** (`/handoff` run twice without a pickup in between): read it and merge its still-relevant content into the new one.
- **No live handoff, but `.claude/handoffs/.consumed/` holds an archived one for this branch key** (this session resumed via `/pickup`): read the most recent one. Carry forward anything still true — particularly section 3 standing orders and section 5 dead ends, which stay valid across cycles. Drop what the work has since superseded.

## Step 2 — Gather ground truth

Before writing, run these and capture the actuals (do not write from memory — memory is exactly what is degrading):

```bash
git rev-parse --abbrev-ref HEAD
git log --oneline -15
git status --porcelain
git diff --stat master..HEAD
npm test
```

Also note any scratch files (`.tmp/`, the session scratchpad), generated artifacts, and background processes started this session.

## Step 3 — Write the document

Write to the resolved path using this structure. Include every section; write `None.` under any that genuinely has nothing.

```markdown
# Handoff — <branch>

**Written:** <today's date>
**Branch:** <branch>
**HEAD:** <short sha> <subject>

## 1. Goal

What we are trying to accomplish, in the user's framing. Two to five sentences. A fresh
agent should understand the *point* of the work, not just the mechanics.

## 2. Where we are

Which phase (discussing / planning / reviewing / executing / tidying), what is finished,
what is in flight *right now*. Be specific: "commit 4 of 6; `planr badge` implemented and
tested, docs not yet updated" — not "partway through."

## 3. Standing orders

Every instruction, constraint, correction, or preference the **user** gave this session.
Quote them verbatim in blockquotes wherever possible — a paraphrase is exactly the kind of
lossy compression this document exists to prevent. Include rules from `CLAUDE.md` that were
reinforced, corrected, or clarified in conversation; those are the ones that get lost first.

## 4. Decisions made

| # | Decision | Why | Who made it |
|---|---|---|---|

"Who made it" is `user` or `agent`. Include rejected alternatives and why they lost.

## 5. Dead ends — do NOT retry

Everything attempted that failed, with the reason it failed and how it manifested. Anything
that *looked* like it worked but did not. This section prevents the next agent from burning
an hour rediscovering a wall you already hit.

## 6. Learned facts

Non-obvious things discovered this session: exact file paths and line numbers, working
command invocations (copy-pasteable, with the flags that mattered), invariants, gotchas,
environment quirks. Anything you had to dig for. Use backticks around every literal.

## 7. State on disk

- **Committed this session:** commits by sha + subject
- **Uncommitted changes:** file paths + one line on what changed in each and whether it is complete
- **Files created:** absolute paths, and what each is for
- **Test status:** the exact command run and the result — including known failures and whether
  they are pre-existing
- **Background processes / servers:** anything left running

## 8. Open questions for the user

Anything blocked on a human decision. State the question and the options, so the next agent
can ask it cleanly rather than re-deriving the ambiguity.

## 9. Next actions

Ordered and concrete. The first item should be executable immediately with no further
investigation.

1. ...
```

## Rules for writing it

- **Be specific to the point of tedium.** "Fixed the scanner bug" is worthless. "`skills/html-planning/planr.js` — `findElement` scanned to EOF even when given a range cap, so every range-limited lookup cost O(document); replaced with cached token offsets + binary search" is a handoff.
- **Verbatim over summary** for anything the user said. You are the compression risk.
- **Over-include.** A too-long handoff costs the next agent a few thousand tokens. A too-short one costs the user another explanation.
- **Absolute paths, backticked literals**, per the repo's instruction-doc conventions.
- **Record failure faithfully.** If tests are red, say so with the output. If something was skipped, say it was skipped. A handoff that flatters the session is worse than none.
- **Do not do any new work.** This command writes a document. It does not fix, refactor, commit, or continue the task.

If `$ARGUMENTS` is non-empty, treat it as additional emphasis from the user about what this handoff must capture.

## Step 4 — Report back

Tell the user the absolute path as a `file://` URL, plus a three-line summary of what the handoff covers. Remind them the flow is: `/clear`, then `/pickup`.
