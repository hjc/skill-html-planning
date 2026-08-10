---
description: Load the branch's handoff doc written by /handoff, verify it against the repo, archive it, and resume the work.
---

# Pickup

Resume work that a previous session recorded with `/handoff`. Treat the handoff document as the authoritative account of what is happening — it was written by an agent that had the full context you do not.

## Step 1 — Locate the handoff

```bash
git rev-parse --abbrev-ref HEAD | tr '/' '-'
```

The handoff file is `.claude/handoffs/<that value>.md`.

**If it does not exist:** list `.claude/handoffs/` and tell the user no handoff exists for this branch, showing what handoffs do exist (they may be on the wrong branch). Then stop — do not guess at a file and do not start work.

## Step 2 — Ingest

Read the entire file. Do not skim, do not read a portion of it — read all of it.

Then read the artifacts it points at, in this order of priority:

1. The design or plan doc it names as current, if any.
2. The files listed as having uncommitted or in-flight changes.
3. Anything section 9 (Next actions) requires you to have read to execute step 1.

Do not bulk-read everything the document mentions. Read what is needed to take the next action correctly.

## Step 3 — Verify against reality

The handoff describes a past state. Confirm it still holds:

```bash
git rev-parse --abbrev-ref HEAD
git log --oneline -10
git status --porcelain
npm test
```

Check that HEAD matches the recorded sha, that the claimed uncommitted files are still dirty, that any file the document says exists actually exists, and that the test result matches what was recorded. **If reality and the handoff disagree, the repo wins** — flag the discrepancy to the user rather than acting on the stale claim.

## Step 4 — Archive the handoff

Once you have read and verified it, **move** the file to `.claude/handoffs/.consumed/<branch-key>-<timestamp>.md`:

```bash
mkdir -p .claude/handoffs/.consumed
mv ".claude/handoffs/<key>.md" ".claude/handoffs/.consumed/<key>-$(date +%Y%m%d-%H%M%S).md"
```

Move it only *after* ingesting and verifying, never before. Then confirm the move actually happened: the source path must be gone **and** the destination must exist with content. A `cp` that leaves the original behind reads as success and would leave a stale handoff for the next pickup to resume from.

The archive is not for reuse — it is recovery. If this session compacts before the work finishes, the consumed doc is the only surviving record of the prior session's dead ends and standing orders. Never resume from `.consumed/` directly; a later `/handoff` folds it forward.

## Step 5 — Report and resume

Report back concisely:

- **Goal** — one or two sentences
- **Where we are** — the phase and what is in flight
- **Any discrepancies** found in step 3
- **Next action** — the specific thing you are about to do

Then:

- If the handoff's open-questions section has anything blocking, **ask the user those questions** and wait.
- Otherwise, **proceed with next action #1**.

## Carry the standing orders forward

Section 3 of the handoff records the user's instructions and constraints from the prior session. Those remain in force for the rest of this session — treat them exactly as if the user had just stated them to you directly. They are the reason this document exists.
