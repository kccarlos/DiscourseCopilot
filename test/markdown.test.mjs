// marked output for the markdown the AI answers use, and the link policy the
// side panel's sanitizer applies to it. The sanitizer itself needs a DOM; the
// UI flows (tools/ui/flows.mjs, popup-summary) check it in Chromium.
import assert from 'node:assert/strict';
import test from 'node:test';

import { isAllowedHref, linkifyCitations, markdownToHtml } from '../src/popup/markdown.mjs';

const hrefs = html => [...html.matchAll(/href="([^"]*)"/g)].map(match => match[1]);

test('headings, including emoji section headings from the summary prompts', () => {
  const html = markdownToHtml('# Title\n\n## 📝 Original Post Summary\nThe OP asks about X.\n\n### Sub\n\n###### H6');
  assert.equal(html, '<h1>Title</h1>\n<h2>📝 Original Post Summary</h2>\n<p>The OP asks about X.</p>\n<h3>Sub</h3>\n<h6>H6</h6>\n');
});

test('tight, nested, ordered and loose lists', () => {
  assert.equal(
    markdownToHtml('- one\n- two\n  - nested\n- three\n\n1. first\n2. second'),
    '<ul>\n<li>one</li>\n<li>two<ul>\n<li>nested</li>\n</ul>\n</li>\n<li>three</li>\n</ul>\n<ol>\n<li>first</li>\n<li>second</li>\n</ol>\n'
  );
  assert.equal(markdownToHtml('- loose a\n\n- loose b'), '<ul>\n<li><p>loose a</p>\n</li>\n<li><p>loose b</p>\n</li>\n</ul>\n');
  assert.equal(
    markdownToHtml('* **Point:** detail\n  continued line\n* Another with `code`'),
    '<ul>\n<li><strong>Point:</strong> detail\ncontinued line</li>\n<li>Another with <code>code</code></li>\n</ul>\n'
  );
});

test('inline and fenced code are escaped, not rendered', () => {
  assert.equal(
    markdownToHtml('Inline `x < y`\n\n```js\nconst a = 1 < 2 && "<b>";\n```'),
    '<p>Inline <code>x &lt; y</code></p>\n<pre><code class="language-js">const a = 1 &lt; 2 &amp;&amp; &quot;&lt;b&gt;&quot;;\n</code></pre>\n'
  );
});

test('GFM tables with alignment', () => {
  assert.equal(
    markdownToHtml('| Option | Default |\n| --- | :---: |\n| A | `1` |\n| B | **2** |\n\nAfter table.'),
    '<table>\n<thead>\n<tr>\n<th>Option</th>\n<th align="center">Default</th>\n</tr>\n</thead>\n'
      + '<tbody><tr>\n<td>A</td>\n<td align="center"><code>1</code></td>\n</tr>\n'
      + '<tr>\n<td>B</td>\n<td align="center"><strong>2</strong></td>\n</tr>\n</tbody></table>\n'
      + '<p>After table.</p>\n'
  );
});

test('quotes, rules, strikethrough and no soft line breaks', () => {
  assert.equal(
    markdownToHtml('> quote\n\n---\n\n~~gone~~ *em* one\ntwo'),
    '<blockquote>\n<p>quote</p>\n</blockquote>\n<hr>\n<p><del>gone</del> <em>em</em> one\ntwo</p>\n'
  );
});

test('links: only web, mail and anchor hrefs survive the link policy', () => {
  const html = markdownToHtml(
    '[ok](https://example.com "t") [mail](mailto:a@b.c) [hash](#x) '
      + '[js](javascript:alert(1)) [JS2](JaVaScRiPt:alert(1)) [data](data:text/html,x) '
      + '<https://auto.example.com> <a href="javascript:alert(2)" onclick="x()">raw</a>'
  );
  const found = hrefs(html);
  // marked passes unsafe URLs and raw HTML through; the sanitizer is the guard.
  assert.ok(
    found.some(href => /^javascript:/i.test(href)),
    found.join(' ')
  );
  assert.deepEqual(found.filter(isAllowedHref), ['https://example.com', 'mailto:a@b.c', '#x', 'https://auto.example.com']);
});

test('isAllowedHref rejects script-like and relative URLs', () => {
  for (const href of [
    'javascript:alert(1)',
    ' JavaScript:alert(1)',
    '\tjavascript:x',
    'data:text/html,x',
    'vbscript:x',
    'file:///etc/passwd',
    'chrome://settings',
    '/relative',
    '//evil.example',
    '',
    null
  ]) {
    assert.equal(isAllowedHref(href), false, String(href));
  }
  for (const href of ['https://a.example', 'HTTP://a.example', ' mailto:a@b.c', '#S1']) {
    assert.equal(isAllowedHref(href), true, href);
  }
});

test('Agent citations are linked in text but not inside code', () => {
  const html = linkifyCitations(markdownToHtml('Enable caching [S1]. See [S2, S9] and `[S1]`.\n\n```\n[S1] in code\n```'), ['S1', 'S2']);
  assert.equal((html.match(/class="agent-citation"/g) || []).length, 2);
  assert.match(html, /data-citation="S1"/);
  assert.match(html, /data-citation="S2"[^>]*>S2<\/a> \[S9\]/);
  assert.match(html, /<code>\[S1\]<\/code>/);
  assert.match(html, /<pre><code>\[S1\] in code/);
});

test('empty and missing markdown render nothing', () => {
  assert.equal(markdownToHtml(''), '');
  assert.equal(markdownToHtml(undefined), '');
});
