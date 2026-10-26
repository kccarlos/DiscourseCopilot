// The kinds of site the extension can read. A site's type travels with the
// page state and the tasks queued from it, and picks the site adapter that
// reads it (background/sites/index.mjs). Anything else counts as Discourse,
// which is what every page and task saved before site types existed was.

export const SITE_TYPE = Object.freeze({
  DISCOURSE: 'discourse',
  WORDPRESS: 'wordpress'
});

export const DEFAULT_SITE_TYPE = SITE_TYPE.DISCOURSE;

const KNOWN_SITE_TYPES = new Set(Object.values(SITE_TYPE));

export function normalizeSiteType(value) {
  return KNOWN_SITE_TYPES.has(value) ? value : DEFAULT_SITE_TYPE;
}

// Which site types the Agent can research. A type is added here when its
// adapter (background/sites/) has real Agent tools.
const AGENT_SITE_TYPES = new Set([SITE_TYPE.DISCOURSE]);

export function siteTypeSupportsAgent(value) {
  return AGENT_SITE_TYPES.has(value);
}
