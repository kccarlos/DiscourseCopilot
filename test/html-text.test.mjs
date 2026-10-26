import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeEntities, htmlToText } from '../src/shared/html-text.mjs';

test('entities decode once: named, decimal and hex, unknown ones stay', () => {
  assert.equal(decodeEntities('Chase Sapphire &#038; Freedom'), 'Chase Sapphire & Freedom');
  assert.equal(decodeEntities('Let the games&#8230; begin &rsquo; &#x2019; &amp;#038;'), 'Let the games… begin ’ ’ &#038;');
  assert.equal(decodeEntities('&bogus; &#0; &#xD800; &#99999999;'), '&bogus; &#0; &#xD800; &#99999999;');
  assert.equal(decodeEntities(null), '');
});

test('paragraphs, breaks and lists keep their line structure', () => {
  assert.equal(htmlToText('<p>One</p><p>Two<br/>three</p><ul><li>a</li><li>b</li></ul>'), 'One\n\nTwo\nthree\n\n- a\n- b');
});

test('blank-line runs never reach three newlines, which would split a post', () => {
  const text = htmlToText('<p>one</p>\n\n\n\n<p></p><p></p><p>two</p><div><div><p>three</p></div></div>');
  assert.doesNotMatch(text, /\n{3,}/);
  assert.equal(text, 'one\n\ntwo\n\nthree');
});

test('links keep their address unless the text already is the address', () => {
  assert.equal(htmlToText('<a href="https://x.example/a?b=1&amp;c=2">this deal</a>'), 'this deal (https://x.example/a?b=1&c=2)');
  assert.equal(htmlToText('<a href="https://x.example/">https://x.example/</a>'), 'https://x.example/');
  assert.equal(htmlToText('<a href="javascript:alert(1)">click</a>'), 'click');
  assert.equal(htmlToText('<a href="#comment-5">earlier</a>'), 'earlier');
});

test('quotes are prefixed, images named, scripts and comments dropped', () => {
  assert.equal(htmlToText('<blockquote><p>quoted</p><p>more</p></blockquote><p>reply</p>'), '> quoted\n>\n> more\n\nreply');
  assert.equal(htmlToText('<blockquote><p>I &lt;3 this -&gt; that</p></blockquote>'), '> I <3 this -> that');
  assert.equal(htmlToText('<img src="a.png" alt="the card"><img src="b.png">'), '[image: the card][image]');
  assert.equal(htmlToText('a<script>evil()</script><style>p{}</style><!-- hidden -->b'), 'ab');
});

test('text that is not markup passes through, and empty input is empty', () => {
  assert.equal(htmlToText('plain 1 < 2 text'), 'plain 1 < 2 text');
  assert.equal(htmlToText(''), '');
  assert.equal(htmlToText(undefined), '');
});
