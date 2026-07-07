#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   Plan Skeleton Generator
   Writes a minimal HTML plan file with the inline loader.
   Usage:  node generate.js <output-path> [--title "Plan Title"]
   ═══════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (!args.length) {
  console.error('Usage: node generate.js <output-path> [--title "Plan Title"]');
  process.exit(1);
}

const outPath = args[0];
let title = 'Untitled Plan';
const titleIdx = args.indexOf('--title');
if (titleIdx !== -1 && args[titleIdx + 1]) {
  title = args[titleIdx + 1];
}

/* ── Resolve this skill's install subpath (relative to .claude) ──
   The generated plan's loader walks the page URL to find the `.claude`
   segment, then appends this subpath. Baking it in at generation time
   removes the old requirement that the skill folder be named exactly
   "html-planning".

   We read it from process.argv[1] (how the script was invoked) rather
   than __dirname, because when the skill is symlinked into
   .claude/skills/<name>/, __dirname resolves through the link to the
   real source dir, while argv[1] preserves the .claude/skills/<name>
   path the user actually ran. Falls back to skills/<dirname> when the
   invocation path has no .claude segment (e.g. editing the skill itself). */
function resolveSkillSubpath() {
  const invoked = (process.argv[1] || __filename).replace(/\\/g, '/');
  const segs = invoked.split('/');
  const idx = segs.indexOf('.claude');
  if (idx !== -1) {
    // Everything between `.claude` and the script's own filename.
    return segs.slice(idx + 1, segs.length - 1).join('/');
  }
  // Fallback: conventional skills/<folder name>.
  return 'skills/' + path.basename(path.dirname(invoked));
}
const skillSubpath = resolveSkillSubpath();

/* ── Template selection ──
   `--template tdd` scaffolds the canonical TDD-plan spine. The section ids are
   fixed vocabulary (overview/scope/recon/decisions/steps/callsites/verification/
   anti-patterns) so every TDD plan is addressable the same way by plan-cli and
   consistent across a corpus. It also pre-seeds the documented table conventions
   (Decision→Rationale, Don't→Why, File/Lines/What, Callsite→Change) and the
   Red/Green step rhythm so the executor fills blanks instead of inventing shape.
   Default `basic` emits a single starter section — use it for PRDs, BSDs,
   architecture docs, and anything that doesn't follow the TDD spine. */
let template = 'basic';
const tplIdx = args.indexOf('--template');
if (tplIdx !== -1 && args[tplIdx + 1]) template = args[tplIdx + 1];
if (template !== 'basic' && template !== 'tdd') {
  console.error(`Unknown --template "${template}". Valid: basic, tdd.`);
  process.exit(1);
}

const BASIC_BODY = `  <!-- ════════════════════════════════════════════════════════
       Section Template — copy & adapt as needed:

       <plan-section id="section-id" num="1" title="Section Title">
         <p>Section content here.</p>
       </plan-section>
       ════════════════════════════════════════════════════════ -->

  <plan-section id="overview" num="1" title="Overview">
    <p>Replace with plan content.</p>
  </plan-section>`;

const TDD_BODY = `  <plan-section id="overview" num="1" title="Overview">
    <p>Goal, background, and the problem this plan solves.</p>
  </plan-section>

  <plan-section id="scope" num="2" title="Scope &amp; Prerequisites">
    <p>What this plan covers — and explicitly what it does not.</p>
    <plan-callout type="info">Prerequisites and assumptions the executor can rely on.</plan-callout>
  </plan-section>

  <plan-section id="recon" num="3" title="Reconnaissance Summary">
    <p>Load-bearing facts the executor may need to reference. Convention: a table of the relevant files.</p>
    <plan-table>
      <table>
        <thead><tr><th>File</th><th>Lines</th><th>What</th></tr></thead>
        <tbody>
          <tr><td class="mono">path/to/file.py</td><td>42-58</td><td>What lives here and why it matters</td></tr>
        </tbody>
      </table>
    </plan-table>
  </plan-section>

  <plan-section id="decisions" num="4" title="Design Decisions">
    <p>Convention: a numbered table of decision → rationale.</p>
    <plan-table>
      <table>
        <thead><tr><th>#</th><th>Decision</th><th>Rationale</th></tr></thead>
        <tbody>
          <tr><td>1</td><td><strong>Decision.</strong> What was chosen.</td><td>Why — including any alternative it supersedes.</td></tr>
        </tbody>
      </table>
    </plan-table>
  </plan-section>

  <plan-section id="steps" num="5" title="Implementation Steps">
    <plan-subsection id="step-1" num="1" title="First step" status="todo">
      <p><strong>Files touched:</strong> <code>path/to/file.py</code></p>
      <h4>Red Phase</h4>
      <p>Write the failing test first.</p>
      <plan-file path="path/to/tests.py" add lang="python">
# failing test goes here
      </plan-file>
      <h4>Green Phase</h4>
      <p>Make it pass with the smallest change.</p>
      <plan-diff path="path/to/file.py" old-start="1" new-start="1">
 context line
+added line
      </plan-diff>
    </plan-subsection>
  </plan-section>

  <plan-section id="callsites" num="6" title="Callsite Audit">
    <p>Every place that references the changed symbol or behavior, and its disposition. Convention: a table.</p>
    <plan-table>
      <table>
        <thead><tr><th>#</th><th>Callsite</th><th>Change</th></tr></thead>
        <tbody>
          <tr><td>1</td><td class="mono">path/to/caller.py:120</td><td>What must change here (or "no change — why")</td></tr>
        </tbody>
      </table>
    </plan-table>
  </plan-section>

  <plan-section id="verification" num="7" title="Verification">
    <p>The commands that prove the change works, each with its expected result.</p>
    <pre><code class="language-bash">command to run</code></pre>
    <p>Expected: what a passing run looks like.</p>
  </plan-section>

  <plan-section id="anti-patterns" num="8" title="Anti-Patterns">
    <p>Convention: a numbered table of Don't → Why.</p>
    <plan-table>
      <table>
        <thead><tr><th>#</th><th>Don't</th><th>Why</th></tr></thead>
        <tbody>
          <tr><td>1</td><td>The tempting wrong approach.</td><td>What it would break or which invariant it violates.</td></tr>
        </tbody>
      </table>
    </plan-table>
  </plan-section>`;

const body = template === 'tdd' ? TDD_BODY : BASIC_BODY;

const skeleton = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <!-- ── highlight.js (syntax highlighting) ── -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"></script>
  <!-- ── Inline loader: resolves .claude/ from any plan depth ── -->
  <script>
    (function() {
      var segs = location.pathname.split('/');
      var idx = segs.indexOf('.claude');
      if (idx === -1) { /* fallback: try parent dirs */
        var base = location.pathname.substring(0, location.pathname.lastIndexOf('/'));
        while (base && !base.endsWith('.claude')) base = base.substring(0, base.lastIndexOf('/'));
        if (base) idx = base.split('/').indexOf('.claude');
      }
      var root = idx !== -1 ? segs.slice(0, idx + 1).join('/') : '.claude';
      var skillBase = root + '/${skillSubpath}';
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = skillBase + '/plan-styles.css';
      document.head.appendChild(link);
      var script = document.createElement('script');
      script.src = skillBase + '/plan-runtime.js';
      document.head.appendChild(script);
    })();
  </script>
</head>
<body>

<plan-nav></plan-nav>

<plan-header
  title="${title}"
  subtitle=""
  status="draft"
  date="${new Date().toISOString().slice(0, 10)}"
  chips="">
</plan-header>

<main>

${body}

</main>

</body>
</html>
`;

// Ensure parent directory exists
const dir = path.dirname(outPath);
if (dir && !fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

fs.writeFileSync(outPath, skeleton, 'utf8');
console.log(`Created: ${outPath}`);
