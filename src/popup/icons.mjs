// Inline line icons for buttons built in JavaScript (popup.html carries its
// own copies of the same shapes). 24×24 viewBox, stroke only; the size and
// stroke come from the `.btn-icon` rule in popup.css.
const ICON_PATHS = {
  search: ['M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z', 'm20 20-4.2-4.2'],
  summary: ['M7 3h8l4 4v14H7V3Z', 'M15 3v5h4M10 12h6M10 16h6'],
  copy: ['M11 9h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z', 'M5 15V6a2 2 0 0 1 2-2h8'],
  post: ['M8 4h8l3 3v13H8z', 'M16 4v3h3M11 12h5M11 16h5'],
  download: ['M12 4v11', 'm7.5 11 4.5 4.5 4.5-4.5', 'M5 20h14'],
  bookmark: ['M7 4h10v16l-5-3.5L7 20z'],
  activity: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z', 'M12 7v5l3 2'],
  chat: ['M4 5h16v12H9l-5 4V5Z', 'M8 9h8M8 13h5'],
  chevron: ['m6 9 6 6 6-6'],
  plus: ['M12 5v14M5 12h14'],
  trash: ['M5 7h14', 'M10 4h4', 'M7 7l1 13h8l1-13'],
  open: ['M14 5h5v5', 'm19 5-8 8', 'M18 14v5H5V6h5'],
  check: ['m5 12.5 4.2 4.2L19 7'],
  close: ['M6 6l12 12M18 6 6 18'],
  stop: ['M8.5 7h7A1.5 1.5 0 0 1 17 8.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 15.5v-7A1.5 1.5 0 0 1 8.5 7Z'],
  retry: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 4v7h-7'],
  play: ['M8 5v14l11-7z'],
  send: ['M12 19V5', 'm5 12 7-7 7 7']
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/** An icon as an SVG element; `name` is a key of ICON_PATHS. */
export function createIcon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'btn-icon');
  for (const definition of ICON_PATHS[name] || []) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', definition);
    svg.appendChild(path);
  }
  return svg;
}

/** The text of a button, kept apart from its icon so updates leave the icon alone. */
export function setButtonLabel(button, text) {
  const label = button.querySelector('.btn-label');
  if (label) {
    label.textContent = text;
  } else {
    button.textContent = text;
  }
}

export function getButtonLabel(button) {
  return (button.querySelector('.btn-label') || button).textContent;
}

/**
 * Fills a button with an icon and a visible label. `aria-label` and `title`
 * are set by the caller so the name stays accessible when the label is
 * hidden on narrow panels (`.btn-label` is dropped under 400px for toolbars).
 */
export function setIconButton(button, { icon, label }) {
  const text = document.createElement('span');
  text.className = 'btn-label';
  text.textContent = label;
  button.classList.add('has-icon');
  button.replaceChildren(createIcon(icon), text);
}
