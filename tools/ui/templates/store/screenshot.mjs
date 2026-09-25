// HTML for one Chrome Web Store screenshot (1280x800): a browser window with a
// mock Discourse page on the left, a caption over it, and a side-panel capture
// on the right. Styles: screenshot.css next to this file.

const ICON = {
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'
};

const header =
  f => `<div class="d-header"><div class="d-logo" style="background:${f.color}">${f.letter}</div><div class="d-site">${f.name}</div><div class="d-spacer"></div>
  <div class="d-icon">${ICON.search}</div><div class="d-icon">${ICON.bell}</div><div class="d-icon">${ICON.menu}</div><div class="d-me" style="background:${f.me}">K</div></div>`;

const post = p => `<div class="d-post"><div class="d-av" style="background:${p.color}">${p.user[0].toUpperCase()}</div><div class="d-body">
  <div class="d-meta"><span class="d-user">${p.user}</span>${p.badge ? `<span class="d-badge">${p.badge}</span>` : ''}<span class="d-time">${p.time}</span></div>
  ${p.body.map(t => `<p>${t}</p>`).join('')}
  <div class="d-actions"><span>♡ ${p.likes}</span><span>Share</span><span>Reply</span></div></div></div>`;

// A topic page: title, category and tags, posts, and the timeline on the right.
export const topicView = (f, t) => `${header(f)}<div class="withtl"><div class="d-main">
  <h2 class="d-title">${t.title}</h2>
  <div class="d-sub"><span class="d-cat"><i style="background:${t.catColor}"></i>${t.cat}</span>${(t.tags || []).map(x => `<span class="d-tag">${x}</span>`).join('')}</div>
  ${t.posts.map(post).join('')}
</div></div>
<div class="d-timeline"><div>${t.started}</div><div class="track"><div class="handle"></div><div class="pos">1 / ${t.count}</div></div><div>${t.latest}</div></div>`;

// The "Latest" topic list.
export const topicList = (f, rows, navColor) => `${header(f)}
<div class="d-nav"><span class="on" style="background:${navColor}">Latest</span><span>Top</span><span>Categories</span><span>Bookmarks</span></div>
<div class="d-list"><div class="d-row h"><div>Topic</div><div></div><div class="n">Replies</div><div class="n">Activity</div></div>
${rows
  .map(
    r => `<div class="d-row"><div class="t">${r.title}<div><span class="d-cat"><i style="background:${r.catColor}"></i>${r.cat}</span></div></div>
<div class="d-avs">${r.avs.map(([l, c]) => `<b style="background:${c}">${l}</b>`).join('')}</div><div class="n${r.hot ? ' hot' : ''}">${r.replies}</div><div class="n">${r.act}</div></div>`
  )
  .join('')}</div>`;

// The whole screenshot. `panel` names a capture served from /panels/.
export const screenshotPage = ({ theme = 'light', url, forumHtml, panel, title, sub }) => {
  const host = url.split('/')[0];
  const rest = url.slice(host.length);
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/templates/store/screenshot.css"></head><body class="${theme}">
<div class="stage"><div class="window">
  <div class="bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
    <div class="url"><span class="lock">${ICON.lock}</span><span><span class="host">${host}</span>${rest}</span></div>
    <div class="ext"><img src="/brand/icon/discoursecopilot-icon-on-light.svg" alt=""></div></div>
  <div class="content"><div class="forum">${forumHtml}<div class="veil"></div>
    <div class="caption"><h1>${title}</h1><p>${sub}</p></div></div>
    <div class="divider"></div><div class="panel"><img src="/panels/${panel}.png" alt=""></div></div>
</div></div></body></html>`;
};
