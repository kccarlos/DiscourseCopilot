import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildReleaseNotes, changelogAnchor, findSection } from '../tools/release-notes.mjs';

const SAMPLE = `# Changelog

## [Unreleased]

## [1.2.0] - 2026-10-03

### Fixed
- Fixed a thing.


### Added
- Added a thing.

## [1.1.0] - 2026-09-01

### Changed
- Older change.

[Unreleased]: https://example.com/compare/v1.2.0...HEAD
[1.2.0]: https://example.com/compare/v1.1.0...v1.2.0
`;

test('takes only the requested section and its previous version', () => {
  const section = findSection(SAMPLE, '1.2.0');
  assert.equal(section.date, '2026-10-03');
  assert.equal(section.previous, '1.1.0');
  assert.equal(section.body, '### Fixed\n- Fixed a thing.\n\n### Added\n- Added a thing.');
});

test('the last section stops at the link definitions', () => {
  assert.equal(findSection(SAMPLE, '1.1.0').body, '### Changed\n- Older change.');
});

test('matches GitHub heading anchors', () => {
  assert.equal(changelogAnchor('2.2.1', '2026-10-03'), '221---2026-10-03');
});

test('notes include the section, install steps and links', () => {
  const notes = buildReleaseNotes(SAMPLE, '1.2.0');
  assert.match(notes, /^### Fixed/);
  assert.match(notes, /## Install/);
  assert.match(notes, /Chrome Web Store \(recommended\)/);
  assert.match(notes, /CHANGELOG\.md#120---2026-10-03/);
  assert.match(notes, /compare\/v1\.1\.0\.\.\.v1\.2\.0/);
});

test('fails clearly when the version has no entries', () => {
  assert.throws(() => buildReleaseNotes(SAMPLE, '9.9.9'), /no entries for 9\.9\.9/);
  assert.throws(() => buildReleaseNotes(SAMPLE, 'Unreleased'), /no entries for Unreleased/);
});

test('every released version in the real changelog builds notes', () => {
  const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const versions = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map(match => match[1]);
  assert.ok(versions.length > 0);
  for (const version of versions) {
    assert.match(buildReleaseNotes(changelog, version), /## Install/);
  }
});
