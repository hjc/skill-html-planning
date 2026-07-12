/* ═══════════════════════════════════════════════════════════
   Plan UI — Component Runtime
   Web Components that transform semantic markup into styled UI.
   Loaded by the inline loader in each plan HTML file.
   ═══════════════════════════════════════════════════════════ */

/* ── plan-header ──────────────────────────────────────── */
class PlanHeader extends HTMLElement {
  connectedCallback() {
    const title = this.getAttribute('title') || 'Untitled';
    const subtitle = this.getAttribute('subtitle') || '';
    const status = this.getAttribute('status') || 'draft';
    const date = this.getAttribute('date') || '';
    const chips = this.getAttribute('chips') || '';

    const extraChips = chips
      .split('|').filter(Boolean)
      .map(c => `<span class="meta-chip">${c.trim()}</span>`)
      .join('');

    this.innerHTML = `
      <h1>${title}</h1>
      ${subtitle ? `<div class="plan-subtitle">${subtitle}</div>` : ''}
      <div class="meta-row">
        <span class="meta-chip"><span class="dot ${status}"></span> ${status.charAt(0).toUpperCase() + status.slice(1)}</span>
        ${date ? `<span class="meta-chip">${date}</span>` : ''}
        ${extraChips}
      </div>
    `;
  }
}

/* ── plan-nav ─────────────────────────────────────────── */
class PlanNav extends HTMLElement {
  connectedCallback() {
    // Defer to ensure all plan-sections are in the DOM
    requestAnimationFrame(() => this._init());
  }

  _init() {
    // Top-level sections only, so nested sections don't flatten into the nav.
    const sections = document.querySelectorAll('main > plan-section[id]');
    if (!sections.length) return;

    sections.forEach((sec, i) => {
      // Immediate children only — the nav shows two levels, no deeper.
      const subs = sec.querySelectorAll(':scope > plan-section[id], :scope > plan-subsection[id]');

      if (subs.length === 0) {
        // Simple link — no dropdown
        const a = document.createElement('a');
        a.href = '#' + sec.id;
        a.textContent = sec.getAttribute('title') || sec.id;
        a.dataset.section = sec.id;
        if (i === 0) a.classList.add('active');
        this.appendChild(a);
      } else {
        // Dropdown group
        const group = document.createElement('div');
        group.className = 'nav-group';

        const trigger = document.createElement('a');
        trigger.href = '#' + sec.id;
        trigger.className = 'nav-trigger';
        trigger.innerHTML = `${sec.getAttribute('title') || sec.id}<span class="nav-caret">▾</span>`;
        trigger.dataset.section = sec.id;
        if (i === 0) trigger.classList.add('active');
        group.appendChild(trigger);

        const dropdown = document.createElement('div');
        dropdown.className = 'nav-dropdown';
        subs.forEach(sub => {
          const a = document.createElement('a');
          a.href = '#' + sub.id;
          a.textContent = sub.getAttribute('title') || sub.id;
          a.dataset.subsection = sub.id;
          a.dataset.parent = sec.id;
          dropdown.appendChild(a);
        });
        group.appendChild(dropdown);
        this.appendChild(group);
      }
    });

    // Scroll-aware active state — position-based scrollspy (updates immediately).
    // The active target is the last section/subsection whose top has scrolled
    // above a threshold line just below the sticky nav.
    const allTargets = Array.from(
      document.querySelectorAll('plan-section[id], plan-subsection[id]')
    );

    const setActive = (target) => {
      const id = target.id;
      this.querySelectorAll('a').forEach(a => a.classList.remove('active'));
      document.querySelectorAll('.plan-tree a.active').forEach(a => a.classList.remove('active'));
      const treeLink = document.querySelector(`.plan-tree a[data-tree="${id}"]`);
      if (treeLink) treeLink.classList.add('active');

      // Tag-agnostic: a nested target may be registered as a dropdown item
      // (data-subsection) or a top-level link (data-section).
      const subLink = this.querySelector(`a[data-subsection="${id}"]`);
      if (subLink) {
        subLink.classList.add('active');
        const parentLink = this.querySelector(`a[data-section="${subLink.dataset.parent}"]`);
        if (parentLink) parentLink.classList.add('active');
      } else {
        const link = this.querySelector(`a[data-section="${id}"]`);
        if (link) link.classList.add('active');
      }
    };

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const threshold = this.offsetHeight + 24; // just below the sticky nav
        let current = allTargets[0];
        for (const t of allTargets) {
          if (t.getBoundingClientRect().top <= threshold) current = t;
          else break;
        }
        if (current) setActive(current);
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // set initial state
  }
}

/* ── plan-section ─────────────────────────────────────── */
class PlanSection extends HTMLElement {
  connectedCallback() {
    const title = this.getAttribute('title');
    if (!title) return;

    const status = this.getAttribute('status');
    const pill = status ? ` <span class="plan-status status-${status}">${_statusLabel(status)}</span>` : '';

    // Heading level follows nesting depth (h2 at top level → h6, capped);
    // the number derives from document position (`num` overrides its level).
    let depth = 0;
    for (let p = this.parentElement; p; p = p.parentElement)
      if (_isSectionTag(p)) depth++;

    const h = document.createElement('h' + Math.min(2 + depth, 6));
    h.className = 'plan-heading';   // marks the generated heading (vs authored content headings)
    h.innerHTML = `<span class="section-num">${_sectionNumber(this)}</span> ${title}${pill}`;
    this.prepend(h);
  }
}

/* ── plan-subsection ─────────────────────────────────── */
// Backward-compat alias: a subsection IS a nested section — same depth-derived
// heading + auto-numbering. Retained as a tag so existing plans keep working.
class PlanSubsection extends PlanSection {}

/* ── plan-tabs / plan-tab ─────────────────────────────── */
class PlanTabs extends HTMLElement {
  connectedCallback() {
    requestAnimationFrame(() => this._init());
  }

  _init() {
    const tabs = this.querySelectorAll(':scope > plan-tab');
    if (!tabs.length) return;

    const bar = document.createElement('div');
    bar.className = 'tab-bar';

    tabs.forEach((tab, i) => {
      const btn = document.createElement('button');
      btn.textContent = tab.getAttribute('label') || `Tab ${i + 1}`;
      btn.className = 'tab-btn' + (i === 0 ? ' active' : '');
      btn.addEventListener('click', () => {
        bar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
      });
      bar.appendChild(btn);

      if (i === 0) tab.classList.add('active');
    });

    this.prepend(bar);
  }
}
class PlanTab extends HTMLElement {} // Styled via CSS, logic in PlanTabs

/* ── plan-card ────────────────────────────────────────── */
class PlanCard extends HTMLElement {
  connectedCallback() {
    const label = this.getAttribute('label');
    const value = this.getAttribute('value');
    const subtitle = this.getAttribute('subtitle');

    // Collect existing children as detail lines
    const details = this.innerHTML;
    let html = '';

    if (label) html += `<div class="card-label">${label}</div>`;
    if (value) html += `<div class="card-value">${value}</div>`;
    if (subtitle) html += `<div class="card-subtitle">${subtitle}</div>`;
    if (details.trim()) html += `<div class="card-details">${details}</div>`;

    this.innerHTML = html;
  }
}
class PlanCards extends HTMLElement {} // CSS grid container only

/* ── plan-callout ─────────────────────────────────────── */
class PlanCallout extends HTMLElement {
  connectedCallback() {
    const type = this.getAttribute('type') || 'info';
    const icons = { info: '\u2139', warn: '\u26A0', success: '\u2713', danger: '\u2717' };
    const content = this.innerHTML;
    this.innerHTML = `<span class="callout-icon">${icons[type] || icons.info}</span><div>${content}</div>`;
  }
}

/* ── plan-formula ─────────────────────────────────────── */
class PlanFormula extends HTMLElement {
  connectedCallback() {
    const expr = this.getAttribute('expr') || '';
    const note = this.getAttribute('note') || this.innerHTML;
    this.innerHTML = `
      <div class="formula-expr">${expr}</div>
      ${note ? `<div class="formula-note">${note}</div>` : ''}
    `;
  }
}

/* ── plan-principle ───────────────────────────────────── */
class PlanPrinciple extends HTMLElement {
  connectedCallback() {
    const label = this.getAttribute('label') || '';
    const content = this.innerHTML;
    this.innerHTML = `
      <div class="principle-label">${label}</div>
      <div class="principle-desc">${content}</div>
    `;
  }
}
class PlanPrinciples extends HTMLElement {} // CSS grid container only

/* ── plan-phase ───────────────────────────────────────── */
class PlanPhase extends HTMLElement {
  connectedCallback() {
    const num = this.getAttribute('num') || '';
    const title = this.getAttribute('title') || '';
    const weeks = this.getAttribute('weeks') || '';
    const content = this.innerHTML;

    this.innerHTML = `
      <div class="phase-marker">${num}</div>
      <div class="phase-body">
        <div class="phase-title-row">
          <h4>${title}</h4>
          ${weeks ? `<span class="phase-weeks">${weeks}</span>` : ''}
        </div>
        ${content}
      </div>
    `;
  }
}
class PlanTimeline extends HTMLElement {} // Container only

/* ── plan-badge ───────────────────────────────────────── */
class PlanBadge extends HTMLElement {
  connectedCallback() {
    const type = this.getAttribute('type') || 'open';
    const labels = {
      decided: 'Decided', open: 'Open', deferred: 'Deferred',
      high: 'High', medium: 'Medium', low: 'Low'
    };
    if (!this.textContent.trim()) {
      this.textContent = labels[type] || type;
    }
  }
}

/* ── plan-table ───────────────────────────────────────── */
class PlanTable extends HTMLElement {} // Pure CSS wrapper

/* ── Helpers ──────────────────────────────────────────── */
// Human labels for the section/subsection `status` attribute. Unknown values
// pass through verbatim so a new status shows *something* rather than nothing.
function _statusLabel(status) {
  const labels = { 'todo': 'To Do', 'in-progress': 'In Progress', 'done': 'Done', 'blocked': 'Blocked' };
  return labels[status] || status;
}

// Section-like = a <plan-section> or its <plan-subsection> alias.
function _isSectionTag(n) {
  return !!n && (n.tagName === 'PLAN-SECTION' || n.tagName === 'PLAN-SUBSECTION');
}
// Dotted number from document position: index among section-like siblings,
// joined down the ancestor chain. A present `num` attribute overrides its level.
function _sectionNumber(el) {
  const parts = [];
  for (let n = el; _isSectionTag(n); n = n.parentElement && n.parentElement.closest('plan-section, plan-subsection')) {
    const override = n.getAttribute('num');
    if (override != null) parts.unshift(override);
    else parts.unshift(Array.from(n.parentElement.children).filter(_isSectionTag).indexOf(n) + 1);
    if (!n.parentElement) break;
  }
  return parts.join('.');
}

function _escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Trim the blank leading/trailing lines that come from authoring a
// component across multiple HTML lines, WITHOUT touching the indentation
// of the first real content line. (Plain .trim() strips the first line's
// leading whitespace, flushing indented code to the left.)
function _trimEdgeBlankLines(s) {
  const lines = s.split('\n');
  while (lines.length && lines[0].trim() === '') lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.join('\n');
}

const _extLangMap = {
  py: 'python', js: 'javascript', ts: 'typescript', tsx: 'typescript',
  jsx: 'javascript', sh: 'bash', yml: 'yaml', yaml: 'yaml',
  json: 'json', html: 'html', css: 'css', sql: 'sql', md: 'markdown',
  rb: 'ruby', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin',
};

/* ── plan-file ───────────────────────────────────────── */
class PlanFile extends HTMLElement {
  connectedCallback() {
    const path = this.getAttribute('path') || '';
    const lines = this.getAttribute('lines') || '';
    const lang = this.getAttribute('lang') || '';
    const isNew = this.hasAttribute('new');
    const isAdd = this.hasAttribute('add');

    // Only treat `lines` as a range if it parses to a real number.
    const parsedStart = parseInt((lines.split('-')[0] || '').trim(), 10);
    const hasRange = !isNaN(parsedStart);
    const startLine = hasRange ? parsedStart : 1;

    // Grab raw text before any transformation. Use _trimEdgeBlankLines (not
    // .trim()) so the first content line keeps its leading indentation.
    const raw = _trimEdgeBlankLines(this.textContent);

    // Detect language from extension or explicit attr
    const ext = path.split('.').pop();
    const langId = lang || _extLangMap[ext] || ext;
    const canHighlight = typeof hljs !== 'undefined' && langId && hljs.getLanguage(langId);

    // Render each source line as its own [gutter][code] row (like plan-diff)
    // so the line number stays aligned with its code even when the line
    // soft-wraps. Gutter shows "+N" for additions, else the line number.
    const bodyLines = raw.split('\n').map((line, i) => {
      const numCls = isAdd ? 'line-num line-add' : 'line-num';
      const label = isAdd ? `+${startLine + i}` : `${startLine + i}`;
      const highlighted = canHighlight
        ? hljs.highlight(line, { language: langId, ignoreIllegals: true }).value
        : _escapeHtml(line);
      return `<div class="file-line"><span class="${numCls}">${label}</span><span class="file-line-text">${highlighted}</span></div>`;
    }).join('');

    // Header badge: NEW > ADD > a valid line range.
    let badge = '';
    if (isNew) {
      badge = `<span class="file-badge file-new">NEW</span>`;
    } else if (isAdd) {
      badge = `<span class="file-badge file-add">ADD</span>`;
    } else if (hasRange) {
      badge = `<span class="file-lines">L${_escapeHtml(lines)}</span>`;
    }

    this.innerHTML = `
      <div class="file-header">
        <span class="file-path">${_escapeHtml(path)}</span>
        ${badge}
      </div>
      <div class="file-body"><div class="file-inner">${bodyLines}</div></div>
    `;
  }
}

/* ── plan-diff ───────────────────────────────────────── */
class PlanDiff extends HTMLElement {
  connectedCallback() {
    const path = this.getAttribute('path') || '';
    const lang = this.getAttribute('lang') || '';
    const raw = _trimEdgeBlankLines(this.textContent);
    const diffLines = raw.split('\n');

    // Detect language from extension or explicit attr
    const ext = path.split('.').pop();
    const langId = lang || _extLangMap[ext] || ext;
    const canHighlight = typeof hljs !== 'undefined' && langId && hljs.getLanguage(langId);

    let oldNum = parseInt(this.getAttribute('old-start') || '1', 10);
    let newNum = parseInt(this.getAttribute('new-start') || '1', 10);

    // Strict gutter: column 0 is always the marker and is always stripped —
    // ' ' = context, '+' = added, '-' = removed. This is what lets a code line
    // that genuinely begins with '-'/'+' survive (author it as ` -x`). A line
    // with no gutter char is rendered as context WITHOUT stripping and flagged,
    // so the authoring slip is loud instead of silently mis-colored/truncated.
    let lintCount = 0;
    const bodyLines = diffLines.map(line => {
      let cls = 'diff-ctx';
      let oldCol = '';
      let newCol = '';
      let unguttered = false;

      if (line === '') {
        // Blank context line — advance both gutters; no marker to strip.
        oldCol = oldNum++;
        newCol = newNum++;
      } else if (line.startsWith('+')) {
        cls = 'diff-add';
        newCol = newNum++;
        line = line.substring(1);
      } else if (line.startsWith('-')) {
        cls = 'diff-del';
        oldCol = oldNum++;
        line = line.substring(1);
      } else if (line.startsWith(' ')) {
        // Context line — strip the gutter space.
        oldCol = oldNum++;
        newCol = newNum++;
        line = line.substring(1);
      } else {
        // Missing gutter — render as context, keep the full line intact, flag it.
        cls = 'diff-ctx diff-ungutter';
        oldCol = oldNum++;
        newCol = newNum++;
        unguttered = true;
        lintCount++;
      }

      const highlighted = canHighlight
        ? hljs.highlight(line, { language: langId, ignoreIllegals: true }).value
        : _escapeHtml(line);

      const title = unguttered
        ? ' title="No diff gutter on this line. Prefix every line with a space (context), \'+\' (added), or \'-\' (removed); the first character is always consumed as the marker."'
        : '';

      return `<div class="${cls}"${title}><span class="diff-num">${oldCol}</span><span class="diff-num">${newCol}</span><span class="diff-text">${highlighted}</span></div>`;
    }).join('');

    if (lintCount > 0 && typeof console !== 'undefined') {
      console.warn(`<plan-diff${path ? ` path="${path}"` : ''}>: ${lintCount} line(s) have no diff gutter and were rendered as context. Prefix every line with ' ', '+', or '-'.`);
    }

    this.innerHTML = `
      <div class="file-header">
        <span class="file-path">${_escapeHtml(path)}</span>
      </div>
      <div class="diff-body"><div class="diff-inner">${bodyLines}</div></div>
    `;
  }
}

/* ── plan-diagram (Mermaid) ──────────────────────────── */
// Mermaid is heavy (~1MB), so it is lazy-loaded from cdnjs the first time a
// <plan-diagram> appears — plans without diagrams pull nothing, and existing
// skeletons gain the feature with no generator change. _ensureMermaid()
// injects + initialises the library once and caches the promise.
const MERMAID_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/mermaid/11.12.0/mermaid.min.js';
let _mermaidPromise = null;
let _diagramSeq = 0;

function _ensureMermaid() {
  if (_mermaidPromise) return _mermaidPromise;
  _mermaidPromise = new Promise((resolve, reject) => {
    const init = () => {
      if (!window.mermaid) { reject(new Error('mermaid unavailable')); return; }
      // Theme the diagrams from the plan's own CSS custom properties so they
      // match the design system instead of mermaid's stock palette.
      const css = getComputedStyle(document.documentElement);
      const v = (name, fallback) => (css.getPropertyValue(name).trim() || fallback);
      window.mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        themeVariables: {
          darkMode: true,
          // Canvas matches the panel; nodes use a distinctly *elevated* gray
          // with a bright border so boxes clearly stand off the dark surface
          // (the design-system surfaces are all near-black and don't separate).
          background: v('--surface', '#161b22'),
          mainBkg: '#2d333b',
          primaryColor: '#2d333b',
          primaryBorderColor: '#6e7681',
          primaryTextColor: v('--text', '#e6edf3'),
          secondaryColor: '#3a414b',
          secondaryBorderColor: '#6e7681',
          tertiaryColor: '#262c34',
          tertiaryBorderColor: '#6e7681',
          lineColor: v('--text-muted', '#8b949e'),
          fontFamily: v('--font', 'sans-serif'),
          fontSize: '14px',
        },
      });
      resolve(window.mermaid);
    };
    if (window.mermaid) { init(); return; }
    const s = document.createElement('script');
    s.src = MERMAID_SRC;
    s.onload = init;
    s.onerror = () => reject(new Error('mermaid failed to load'));
    document.head.appendChild(s);
  });
  return _mermaidPromise;
}

class PlanDiagram extends HTMLElement {
  connectedCallback() {
    const caption = this.getAttribute('caption') || '';
    // Mermaid source is whitespace-sensitive; strip only the authoring blank
    // edge lines (like the code components) and hand the raw text to mermaid.
    const src = _trimEdgeBlankLines(this.textContent);

    this.innerHTML = `
      <div class="diagram-body"><div class="diagram-render" aria-busy="true"></div></div>
      ${caption ? `<div class="diagram-caption">${caption}</div>` : ''}
    `;
    const target = this.querySelector('.diagram-render');

    const fail = (msg) => {
      target.removeAttribute('aria-busy');
      target.innerHTML =
        `<div class="diagram-error">${_escapeHtml(msg)}</div>` +
        `<pre class="diagram-source">${_escapeHtml(src)}</pre>`;
    };

    _ensureMermaid().then((mermaid) => {
      mermaid.render('plan-mmd-' + (_diagramSeq++), src)
        .then(({ svg }) => {
          target.removeAttribute('aria-busy');
          target.innerHTML = svg;
        })
        .catch((err) => fail('Diagram failed to render: ' + (err && err.message || err)));
    }).catch(() => fail('Could not load the diagram library (offline?).'));
  }
}

/* ── Register all components ──────────────────────────── */
const components = {
  'plan-header':     PlanHeader,
  'plan-nav':        PlanNav,
  'plan-section':    PlanSection,
  'plan-subsection': PlanSubsection,
  'plan-tabs':       PlanTabs,
  'plan-tab':        PlanTab,
  'plan-cards':      PlanCards,
  'plan-card':       PlanCard,
  'plan-callout':    PlanCallout,
  'plan-formula':    PlanFormula,
  'plan-principles': PlanPrinciples,
  'plan-principle':  PlanPrinciple,
  'plan-timeline':   PlanTimeline,
  'plan-phase':      PlanPhase,
  'plan-badge':      PlanBadge,
  'plan-table':      PlanTable,
  'plan-file':       PlanFile,
  'plan-diff':       PlanDiff,
  'plan-diagram':    PlanDiagram,
};

Object.entries(components).forEach(([tag, cls]) => {
  if (!customElements.get(tag)) {
    customElements.define(tag, cls);
  }
});

/* ── Syntax highlighting (highlight.js) ──────────────── */
// This script is dynamically injected, so DOMContentLoaded has already fired.
// Just defer one frame to let Web Components transform their innerHTML first.
requestAnimationFrame(() => {
  if (typeof hljs !== 'undefined') {
    hljs.highlightAll();
  }
});
requestAnimationFrame(() => _initPlanTree());

/* ── View: side-panel navigation tree ────────────────── */
// Runtime-injected full-depth section tree (like the settings gear). Hidden by
// default; the `.plan-sidebar` gear toggle reveals it and swaps out the top nav.
function _initPlanTree() {
  const build = (container) => {
    const kids = container.querySelectorAll(':scope > plan-section[id], :scope > plan-subsection[id]');
    if (!kids.length) return null;
    const ul = document.createElement('ul');
    kids.forEach(sec => {
      const li = document.createElement('li');
      const row = document.createElement('div');
      row.className = 'tree-row';
      const sub = build(sec);
      const a = document.createElement('a');
      a.href = '#' + sec.id; a.dataset.tree = sec.id;
      a.innerHTML = `<span class="tree-num">${_sectionNumber(sec)}</span> ${sec.getAttribute('title') || sec.id}`;
      row.appendChild(a);
      li.appendChild(row);
      if (sub) li.appendChild(sub);
      ul.appendChild(li);
    });
    return ul;
  };
  const tree = build(document.querySelector('main'));
  if (!tree) return;
  const aside = document.createElement('aside');
  aside.className = 'plan-tree';
  aside.appendChild(tree);
  document.body.appendChild(aside);
  _initTreePanel(aside);   // collapse/expand + resize (steps 3-4)
}

function _readView() {
  try { return JSON.parse(localStorage.getItem(PLAN_SETTINGS_KEY)) || {}; } catch (e) { return {}; }
}
function _writeView(patch) {
  const s = Object.assign(_readView(), patch);
  try { localStorage.setItem(PLAN_SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
}

function _initTreePanel(aside) {
  const doc = document.documentElement;
  if (_readView().treeCollapsed) doc.classList.add('tree-collapsed');

  // Icons mirror the gear's stroke style so the panel chrome feels of a piece.
  const COLLAPSE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>';
  const PANEL_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>';

  const head = document.createElement('div');
  head.className = 'tree-head';
  head.innerHTML = `<span class="tree-head-title">Contents</span><button class="tree-toggle" aria-label="Collapse panel" title="Collapse panel">${COLLAPSE_SVG}</button>`;
  aside.prepend(head);
  head.querySelector('.tree-toggle').addEventListener('click', () => {
    _writeView({ treeCollapsed: doc.classList.toggle('tree-collapsed') });
  });

  const opener = document.createElement('button');   // shows while collapsed
  opener.className = 'tree-opener';
  opener.setAttribute('aria-label', 'Open panel');
  opener.setAttribute('title', 'Open panel');
  opener.innerHTML = PANEL_SVG;
  opener.addEventListener('click', () => {
    doc.classList.remove('tree-collapsed'); _writeView({ treeCollapsed: false });
  });
  document.body.appendChild(opener);

  _initTreeResize(aside);   // step 4
}

function _initTreeResize(aside) {
  const doc = document.documentElement;
  const w = _readView().treeWidth;
  if (w) doc.style.setProperty('--tree-width', w + 'px');

  const handle = document.createElement('div');
  handle.className = 'tree-resize';
  aside.appendChild(handle);
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const move = (ev) => doc.style.setProperty('--tree-width', Math.min(480, Math.max(200, ev.clientX)) + 'px');
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      _writeView({ treeWidth: parseInt(getComputedStyle(doc).getPropertyValue('--tree-width'), 10) });
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}

/* ── View settings (floating gear) ───────────────────── */
// A small, extensible control panel for runtime view preferences. The first
// setting is line wrapping; toggling it flips the `.plan-wrap` class on
// <html> (CSS does the rest) and persists the choice to localStorage so it
// sticks across reloads and other plans on the same origin.
const PLAN_SETTINGS_KEY = 'plan-view-settings';
const PLAN_SETTINGS = [
  {
    key: 'wrap',
    label: 'Wrap long lines',
    apply: (on) => document.documentElement.classList.toggle('plan-wrap', !!on),
  },
  {
    key: 'sidebar',
    label: 'Side-panel navigation',
    apply: (on) => document.documentElement.classList.toggle('plan-sidebar', !!on),
  },
  {
    key: 'fullWidth',
    label: 'Full-width content',
    apply: (on) => document.documentElement.classList.toggle('plan-full-width', !!on),
  },
];

function _initPlanSettings() {
  if (document.querySelector('.plan-settings')) return; // guard double-init

  const saved = _readView();
  const persist = () => _writeView(saved);

  // Apply persisted values up front (before any UI) so there's no flash.
  PLAN_SETTINGS.forEach(s => s.apply(saved[s.key]));

  const GEAR_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';

  const rows = PLAN_SETTINGS.map(s =>
    `<label class="plan-settings-row">
       <input type="checkbox" data-setting="${s.key}"${saved[s.key] ? ' checked' : ''}>
       <span>${s.label}</span>
     </label>`
  ).join('');

  const root = document.createElement('div');
  root.className = 'plan-settings';
  root.innerHTML = `
    <button class="plan-settings-gear" aria-label="View settings" aria-expanded="false" title="View settings">${GEAR_SVG}</button>
    <div class="plan-settings-panel" role="menu" hidden>
      <div class="plan-settings-title">View</div>
      ${rows}
    </div>`;
  document.body.appendChild(root);

  const gear = root.querySelector('.plan-settings-gear');
  const panel = root.querySelector('.plan-settings-panel');

  const setOpen = (open) => {
    panel.hidden = !open;
    root.dataset.open = String(open);
    gear.setAttribute('aria-expanded', String(open));
  };
  setOpen(false);

  gear.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(panel.hidden);
  });
  root.querySelectorAll('input[data-setting]').forEach(input => {
    input.addEventListener('change', () => {
      const key = input.dataset.setting;
      const setting = PLAN_SETTINGS.find(s => s.key === key);
      saved[key] = input.checked;
      if (setting) setting.apply(input.checked);
      persist();
    });
  });
  document.addEventListener('click', (e) => {
    if (!root.contains(e.target)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });

  // Vertically center the gear within the sticky nav (when present). The nav
  // has no fixed height and populates its links a frame later, so we measure
  // its real height with a ResizeObserver rather than guessing. Falls back to
  // the CSS `top` when there's no nav.
  const nav = document.querySelector('plan-nav');
  if (nav) {
    const centerInNav = () => {
      const navH = nav.getBoundingClientRect().height;
      const gearH = gear.offsetHeight || 36;
      if (navH > gearH) root.style.top = ((navH - gearH) / 2) + 'px';
      else root.style.top = '';   // nav hidden (sidebar mode) → CSS top
    };
    centerInNav();
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(centerInNav).observe(nav);
    }
    window.addEventListener('resize', centerInNav);
  }
}

_initPlanSettings();
