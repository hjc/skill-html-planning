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
    const sections = document.querySelectorAll('plan-section[id]');
    if (!sections.length) return;

    sections.forEach((sec, i) => {
      const subs = sec.querySelectorAll('plan-subsection[id]');

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
      const tag = target.tagName.toLowerCase();
      this.querySelectorAll('a').forEach(a => a.classList.remove('active'));

      if (tag === 'plan-subsection') {
        const subLink = this.querySelector(`a[data-subsection="${id}"]`);
        if (subLink) {
          subLink.classList.add('active');
          const parentLink = this.querySelector(`a[data-section="${subLink.dataset.parent}"]`);
          if (parentLink) parentLink.classList.add('active');
        }
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
    const num = this.getAttribute('num');
    const title = this.getAttribute('title');
    if (!title) return;

    const h2 = document.createElement('h2');
    h2.innerHTML = `${num != null ? `<span class="section-num">${num}</span> ` : ''}${title}`;
    this.prepend(h2);
  }
}

/* ── plan-subsection ─────────────────────────────────── */
class PlanSubsection extends HTMLElement {
  connectedCallback() {
    const num = this.getAttribute('num');
    const title = this.getAttribute('title');
    if (!title) return;

    // Prefix the badge with the parent section's number (e.g. "5.1")
    const parent = this.closest('plan-section');
    const parentNum = parent ? parent.getAttribute('num') : null;
    const displayNum = (num != null && parentNum != null) ? `${parentNum}.${num}` : num;

    const h3 = document.createElement('h3');
    h3.className = 'subsection-title';
    h3.innerHTML = `${displayNum != null ? `<span class="subsection-num">${displayNum}</span> ` : ''}${title}`;
    this.prepend(h3);
  }
}

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
    const langClass = lang || _extLangMap[ext] || ext;

    // Build gutter: "+N" markers for additions (numbered within the chunk),
    // else plain line numbers.
    const codeLines = raw.split('\n');
    const gutterHtml = codeLines
      .map((_, i) => isAdd
        ? `<span class="line-num line-add">+${startLine + i}</span>`
        : `<span class="line-num">${startLine + i}</span>`)
      .join('');

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
      <div class="file-body">
        <div class="file-gutter"><pre>${gutterHtml}</pre></div>
        <div class="file-code"><pre><code class="language-${langClass}">${_escapeHtml(raw)}</code></pre></div>
      </div>
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

    const bodyLines = diffLines.map(line => {
      let cls = 'diff-ctx';
      let oldCol = '';
      let newCol = '';

      if (line.startsWith('+')) {
        cls = 'diff-add';
        newCol = newNum++;
        line = line.substring(1);
      } else if (line.startsWith('-')) {
        cls = 'diff-del';
        oldCol = oldNum++;
        line = line.substring(1);
      } else {
        // Context line — strip leading space if present
        oldCol = oldNum++;
        newCol = newNum++;
        if (line.startsWith(' ')) line = line.substring(1);
      }

      const highlighted = canHighlight
        ? hljs.highlight(line, { language: langId, ignoreIllegals: true }).value
        : _escapeHtml(line);

      return `<div class="${cls}"><span class="diff-num">${oldCol}</span><span class="diff-num">${newCol}</span><span class="diff-text">${highlighted}</span></div>`;
    }).join('');

    this.innerHTML = `
      <div class="file-header">
        <span class="file-path">${_escapeHtml(path)}</span>
      </div>
      <div class="diff-body"><div class="diff-inner">${bodyLines}</div></div>
    `;
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
