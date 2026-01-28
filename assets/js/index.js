// Dark mode support (existing behavior from theme build output)
if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.body.classList.add('dark');
}

function computeCollapsedMaxHeight(gridEl, rows) {
  const cards = Array.from(gridEl.querySelectorAll('.skill-card'));
  if (cards.length === 0) return null;

  const rowTops = Array.from(new Set(cards.map((c) => c.offsetTop))).sort((a, b) => a - b);
  if (rowTops.length <= rows) return null;

  const lastRowTop = rowTops[rows - 1];
  const lastRowCards = cards.filter((c) => c.offsetTop === lastRowTop);
  const lastRowBottom = Math.max(...lastRowCards.map((c) => c.offsetTop + c.offsetHeight));

  return lastRowBottom;
}

function getRowIndexMap(cards) {
  const tops = cards
    .map((c) => c.getBoundingClientRect().top)
    .map((t) => Math.round(t));
  const uniqueTops = Array.from(new Set(tops)).sort((a, b) => a - b);
  const idxByTop = new Map(uniqueTops.map((t, i) => [t, i]));
  return { tops, idxByTop, rowCount: uniqueTops.length };
}

function applyCollapsedByHiding(grid, rows) {
  const cards = Array.from(grid.querySelectorAll('.skill-card'));
  if (cards.length === 0) return { fits: true };

  // Ensure all cards are measurable
  for (const c of cards) c.hidden = false;

  const { tops, idxByTop, rowCount } = getRowIndexMap(cards);
  if (rowCount <= rows) {
    return { fits: true };
  }

  for (let i = 0; i < cards.length; i++) {
    const rowIdx = idxByTop.get(tops[i]);
    if (rowIdx === undefined) throw new Error('Row index map invariant violated');
    cards[i].hidden = rowIdx >= rows;
  }

  return { fits: false };
}

function initCollapsibleSkillsGrids() {
  const grids = document.querySelectorAll('.skills-grid--collapsible[data-collapsed-rows]');
  for (const grid of grids) {
    const controls = grid.parentElement?.querySelector('.skills-grid-controls');
    const toggleBtn = controls?.querySelector('.skills-grid-toggle');

    if (!controls || !toggleBtn) {
      throw new Error('Collapsible skills grid is missing `.skills-grid-controls` / `.skills-grid-toggle`');
    }

    const rows = Number(grid.dataset.collapsedRows);
    if (!Number.isFinite(rows) || rows <= 0) {
      throw new Error('Invalid `data-collapsed-rows` value on `.skills-grid--collapsible`');
    }

    const sync = () => {
      const isCollapsed = grid.classList.contains('skills-grid--collapsed');

      if (isCollapsed) {
        const { fits } = applyCollapsedByHiding(grid, rows);
        if (fits) {
          grid.classList.remove('skills-grid--collapsed');
          controls.hidden = true;
          return;
        }

        controls.hidden = false;
        toggleBtn.textContent = 'Show more';
        toggleBtn.setAttribute('aria-expanded', 'false');
      } else {
        const cards = Array.from(grid.querySelectorAll('.skill-card'));
        for (const c of cards) c.hidden = false;
        controls.hidden = false;
        toggleBtn.textContent = 'Show less';
        toggleBtn.setAttribute('aria-expanded', 'true');
      }
    };

    // Initial layout pass
    sync();

    toggleBtn.addEventListener('click', () => {
      grid.classList.toggle('skills-grid--collapsed');
      sync();
    });

    // Recompute on resize (wrapping changes row counts)
    window.addEventListener('resize', () => {
      sync();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initCollapsibleSkillsGrids();
});
