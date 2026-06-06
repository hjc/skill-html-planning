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

  <!-- ════════════════════════════════════════════════════════
       Section Template — copy & adapt as needed:

       <plan-section id="section-id" num="1" title="Section Title">
         <p>Section content here.</p>
       </plan-section>
       ════════════════════════════════════════════════════════ -->

  <plan-section id="overview" num="1" title="Overview">
    <p>Replace with plan content.</p>
  </plan-section>

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
