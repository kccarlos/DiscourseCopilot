// Builds GitHub release notes for one version from CHANGELOG.md: the
// version's section, an install footer and changelog links.
// Usage: node tools/release-notes.mjs <version> [changelogPath]

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO_URL = 'https://github.com/kccarlos/DiscourseCopilot';
const STORE_URL = 'https://chromewebstore.google.com/detail/discoursecopilot/dpngnaiiofobfjleabbhnfmdflddnhac';

const HEADING = /^## \[([^\]]+)\](?:\s+-\s+(\S+))?\s*$/;

/** Returns { version, date, body, previous } for the version's section, or null. */
export function findSection(changelog, version) {
  const lines = changelog.split('\n');
  const start = lines.findIndex(line => HEADING.exec(line)?.[1] === version);
  if (start === -1) {
    return null;
  }
  const [, , date = ''] = HEADING.exec(lines[start]);
  let end = lines.length;
  let previous = '';
  for (let i = start + 1; i < lines.length; i++) {
    const match = HEADING.exec(lines[i]);
    if (match) {
      end = i;
      previous = match[1];
      break;
    }
    // Link reference definitions at the end of the file close the section.
    if (/^\[[^\]]+\]:\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const body = lines
    .slice(start + 1, end)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { version, date, body, previous };
}

/** GitHub's anchor for a heading such as "## [2.2.1] - 2026-10-03". */
export function changelogAnchor(version, date) {
  const text = date ? `[${version}] - ${date}` : `[${version}]`;
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/ /g, '-');
}

export function buildReleaseNotes(changelog, version) {
  const section = findSection(changelog, version);
  if (!section || !section.body) {
    throw new Error(`CHANGELOG.md has no entries for ${version}. Add a "## [${version}] - YYYY-MM-DD" section before tagging.`);
  }
  const links = [`[CHANGELOG.md](${REPO_URL}/blob/main/CHANGELOG.md#${changelogAnchor(version, section.date)})`];
  if (section.previous && section.previous !== 'Unreleased') {
    links.push(`[compare v${section.previous}...v${version}](${REPO_URL}/compare/v${section.previous}...v${version})`);
  }
  return `${section.body}

## Install

- **Chrome Web Store (recommended):** [Add DiscourseCopilot to Chrome](${STORE_URL}). Store updates appear only after Google's review, which can take from a few hours to several days.
- **From this release:** download the zip below, unzip it, open \`chrome://extensions\`, turn on **Developer mode** and click **Load unpacked**. Disable the store copy first if you have it, so the two don't conflict.

**Full changelog:** ${links.join(' · ')}
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [version, changelogPath = 'CHANGELOG.md'] = process.argv.slice(2);
  if (!version) {
    console.error('Usage: node tools/release-notes.mjs <version> [changelogPath]');
    process.exit(2);
  }
  try {
    process.stdout.write(buildReleaseNotes(readFileSync(changelogPath, 'utf8'), version.replace(/^v/, '')));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
