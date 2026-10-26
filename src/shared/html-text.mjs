// Turns the HTML a WordPress site returns for posts and comments into the
// plain text the models read. The service worker has no DOM, so this is a
// small tag stripper: block tags become line breaks, list items bullets,
// quotes "> " lines, links "text (url)" and images "[image: alt]".

const NAMED_ENTITIES = Object.freeze({
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  euro: '€',
  pound: '£',
  cent: '¢',
  times: '×',
  bull: '•'
});

function fromCodePoint(code) {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
}

/** Decodes named and numeric HTML entities (`&amp;`, `&#038;`, `&#x2019;`). */
export function decodeEntities(value) {
  return String(value ?? '').replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return fromCodePoint(code) || match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

function attribute(tag, name) {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return match ? decodeEntities(match[2] ?? match[3] ?? match[4] ?? '') : '';
}

function tidy(text) {
  return text
    .replace(/[\t\f\v\u00a0 ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Tags become text structure; entities stay encoded so a literal "<" (as
// "&lt;") is never mistaken for a tag by a later pass.
function convert(html) {
  let text = String(html ?? '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '');
  text = text.replace(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi, (match, inner) => {
    const href = attribute(match.slice(0, match.indexOf('>') + 1), 'href');
    const label = inner.replace(/<[^>]*>/g, '').trim();
    if (!/^https?:\/\//i.test(href) || !label || decodeEntities(label) === href) {
      return inner;
    }
    return `${inner} (${href})`;
  });
  text = text.replace(/<img\b[^>]*>/gi, tag => {
    const alt = attribute(tag, 'alt');
    return alt ? `[image: ${alt}]` : '[image]';
  });
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<li\b[^>]*>/gi, '\n- ');
  text = text.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote\s*>/gi, (_match, inner) => {
    const quoted = tidy(convert(inner).replace(/<[^>]*>/g, ''))
      .split('\n')
      .map(line => (line ? `> ${line}` : '>'))
      .join('\n');
    return `\n\n${quoted}\n\n`;
  });
  text = text.replace(/<\/(p|div|h[1-6]|ul|ol|table|tr|pre|figure|section|article)\s*>/gi, '\n\n');
  text = text.replace(/<(p|div|h[1-6]|ul|ol|table|tr|pre|figure|section|article)\b[^>]*>/gi, '\n\n');
  text = text.replace(/<\/(td|th)\s*>/gi, ' | ');
  return text.replace(/<[^>]*>/g, '');
}

/** Plain text of an HTML fragment. Blank-line runs are capped at one blank line. */
export function htmlToText(html) {
  return tidy(decodeEntities(convert(html)));
}
