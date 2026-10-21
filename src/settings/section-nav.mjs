// The sticky section nav: marks the link of the section being read with
// aria-current="true" (shown as the filled pill) and keeps it in view in the
// horizontally scrolling row.

export function trackSectionNav(nav = document.querySelector('.section-nav')) {
  if (!nav) return;
  const entries = [...nav.querySelectorAll('a[href^="#"]')]
    .map(link => ({ link, section: document.getElementById(link.hash.slice(1))?.closest('.section') }))
    .filter(entry => entry.section);
  if (!entries.length) return;

  let current = null;
  let frame = 0;

  const update = () => {
    frame = 0;
    // A section counts once its top passes just under the sticky nav.
    const line = nav.getBoundingClientRect().bottom + 24;
    let next = entries[0];
    for (const entry of entries) {
      if (entry.section.getBoundingClientRect().top <= line) next = entry;
    }
    const root = document.scrollingElement || document.documentElement;
    if (root.scrollTop > 0 && root.scrollTop + window.innerHeight >= root.scrollHeight - 2) {
      next = entries.at(-1);
    }
    if (next === current) return;
    current?.link.removeAttribute('aria-current');
    current = next;
    current.link.setAttribute('aria-current', 'true');
    const { link } = current;
    const start = link.offsetLeft - nav.offsetLeft;
    if (start < nav.scrollLeft || start + link.offsetWidth > nav.scrollLeft + nav.clientWidth) {
      nav.scrollLeft = Math.max(0, start - 16);
    }
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();
}
