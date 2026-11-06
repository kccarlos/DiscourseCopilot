export const SITE_CSS = `/* Forumind Design System (Matches src/popup/popup.css & src/settings/settings.html) */
:root {
  color-scheme: light dark;
  --dc-font: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "PingFang SC", "Microsoft YaHei", sans-serif;
  --dc-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --dc-bg: #ffffff;
  --dc-sunken: #f5f5f7;
  --dc-hover: #f2f2f5;
  --dc-ink: #18181b;
  --dc-ink2: #3f3f46;
  --dc-muted: #5e5e68;
  --dc-line: #e4e4e7;
  --dc-line2: #d4d4d8;
  --dc-fill: #4f46e5;
  --dc-fill-hover: #4338ca;
  --dc-onfill: #ffffff;
  --dc-aink: #4338ca;
  --dc-asoft: #eef0ff;
  --dc-asoft-hover: #e2e5ff;
  --dc-ok: #15803d;
  --dc-oksoft: #ecfdf3;
  --dc-warn: #9a5b00;
  --dc-warnsoft: #fff6e5;
  --dc-bad: #b42318;
  --dc-badsoft: #fef3f2;
  --dc-focus: color-mix(in srgb, var(--dc-fill) 45%, transparent);
  --dc-forum-sat: 44%;
  --dc-forum-light: 36%;
}

:root:lang(zh-TW) {
  --dc-font: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "PingFang TC", "Microsoft JhengHei", sans-serif;
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --dc-bg: #18181b;
  --dc-sunken: #111113;
  --dc-hover: #26262b;
  --dc-ink: #f4f4f5;
  --dc-ink2: #d4d4d8;
  --dc-muted: #a1a1aa;
  --dc-line: #2c2c31;
  --dc-line2: #3f3f46;
  --dc-fill: #4f46e5;
  --dc-fill-hover: #5b53ee;
  --dc-onfill: #ffffff;
  --dc-aink: #a5b4fc;
  --dc-asoft: #262451;
  --dc-asoft-hover: #2f2d63;
  --dc-ok: #4ade80;
  --dc-oksoft: #132a1c;
  --dc-warn: #f5c26b;
  --dc-warnsoft: #2a2213;
  --dc-bad: #fda29b;
  --dc-badsoft: #2b1614;
  --dc-focus: color-mix(in srgb, #a5b4fc 55%, transparent);
  --dc-forum-sat: 40%;
  --dc-forum-light: 38%;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --dc-bg: #18181b;
    --dc-sunken: #111113;
    --dc-hover: #26262b;
    --dc-ink: #f4f4f5;
    --dc-ink2: #d4d4d8;
    --dc-muted: #a1a1aa;
    --dc-line: #2c2c31;
    --dc-line2: #3f3f46;
    --dc-fill: #4f46e5;
    --dc-fill-hover: #5b53ee;
    --dc-onfill: #ffffff;
    --dc-aink: #a5b4fc;
    --dc-asoft: #262451;
    --dc-asoft-hover: #2f2d63;
    --dc-ok: #4ade80;
    --dc-oksoft: #132a1c;
    --dc-warn: #f5c26b;
    --dc-warnsoft: #2a2213;
    --dc-bad: #fda29b;
    --dc-badsoft: #2b1614;
    --dc-focus: color-mix(in srgb, #a5b4fc 55%, transparent);
    --dc-forum-sat: 40%;
    --dc-forum-light: 38%;
  }
}

* {
  box-sizing: border-box;
}

html {
  background: var(--dc-sunken);
  scroll-behavior: smooth;
  scroll-padding-top: 76px;
}

body {
  margin: 0;
  background: var(--dc-sunken);
  color: var(--dc-ink);
  font-family: var(--dc-font);
  font-size: 14px;
  line-height: 22px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex: 0 0 auto;
}

a {
  color: var(--dc-aink);
  text-underline-offset: 2px;
}

button, input, select {
  font: inherit;
}

button:focus-visible,
a:focus-visible,
input:focus-visible,
select:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--dc-fill);
  outline-offset: 2px;
}

code {
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--dc-sunken);
  border: 1px solid var(--dc-line);
  font-family: var(--dc-mono);
  font-size: 12px;
}

.hidden {
  display: none !important;
}

/* ---------- Top Sticky Navigation Bar ---------- */
.site-header {
  position: sticky;
  top: 0;
  z-index: 40;
  background: var(--dc-bg);
  border-bottom: 1px solid var(--dc-line);
}

.site-header-inner {
  max-width: 1040px;
  margin: 0 auto;
  height: 54px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.brand-link {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--dc-ink);
  font-weight: 700;
  font-size: 15px;
  letter-spacing: -0.015em;
}

.brand-glyph {
  display: flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--dc-fill);
  color: var(--dc-onfill);
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px;
  border-radius: 999px;
  background: var(--dc-sunken);
  border: 1px solid var(--dc-line);
}

.nav-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 13px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--dc-ink2);
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
  transition: background-color 0.14s, color 0.14s;
}

.nav-pill:hover {
  color: var(--dc-ink);
}

.nav-pill[aria-current="page"] {
  background: var(--dc-bg);
  color: var(--dc-aink);
  font-weight: 650;
  box-shadow: 0 0 0 1px var(--dc-line);
}

.nav-count {
  font-size: 11px;
  font-weight: 650;
  padding: 0 6px;
  height: 18px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  background: var(--dc-asoft);
  color: var(--dc-aink);
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.lang-select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.lang-globe {
  position: absolute;
  left: 9px;
  width: 13px;
  height: 13px;
  color: var(--dc-muted);
  pointer-events: none;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.lang-select {
  appearance: none;
  -webkit-appearance: none;
  height: 30px;
  padding: 0 24px 0 26px;
  border: 1px solid var(--dc-line);
  border-radius: 8px;
  background: var(--dc-bg);
  color: var(--dc-ink);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.14s, border-color 0.14s;
}

.lang-select:hover {
  background: var(--dc-hover);
}

.lang-caret {
  position: absolute;
  right: 8px;
  width: 11px;
  height: 11px;
  color: var(--dc-muted);
  pointer-events: none;
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.icon-btn {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--dc-line);
  border-radius: 8px;
  background: var(--dc-bg);
  color: var(--dc-ink2);
  cursor: pointer;
  transition: background-color 0.14s, color 0.14s;
}

.icon-btn:hover {
  background: var(--dc-hover);
  color: var(--dc-ink);
}

/* ---------- Main Container & Cards ---------- */
.page-wrap {
  max-width: 1040px;
  margin: 0 auto;
  padding: 22px 20px 56px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.surface-card {
  background: var(--dc-bg);
  border: 1px solid var(--dc-line);
  border-radius: 16px;
  overflow: clip;
}

.section-header {
  padding: 22px 26px 18px;
  border-bottom: 1px solid var(--dc-line);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.eyebrow {
  display: block;
  color: var(--dc-muted);
  font-size: 11.5px;
  font-weight: 600;
  line-height: 16px;
  margin-bottom: 2px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.section-title {
  margin: 0;
  color: var(--dc-ink);
  font-size: 20px;
  font-weight: 700;
  line-height: 26px;
  letter-spacing: -0.015em;
}

.section-lede {
  margin: 4px 0 0;
  color: var(--dc-muted);
  font-size: 13.5px;
  line-height: 20px;
  max-width: 680px;
}

/* ---------- Buttons & Badges ---------- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 38px;
  padding: 0 15px;
  border-radius: 8px;
  font-size: 13.5px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.14s, border-color 0.14s, color 0.14s;
}

.btn-primary {
  border: 1px solid var(--dc-fill);
  background: var(--dc-fill);
  color: var(--dc-onfill);
}

.btn-primary:hover {
  background: var(--dc-fill-hover);
  border-color: var(--dc-fill-hover);
  color: var(--dc-onfill);
}

.btn-outline {
  border: 1px solid var(--dc-line2);
  background: var(--dc-bg);
  color: var(--dc-ink);
}

.btn-outline:hover {
  background: var(--dc-hover);
  color: var(--dc-ink);
}

.badge {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--dc-sunken);
  color: var(--dc-muted);
  font-size: 11px;
  font-weight: 650;
  line-height: 1;
  white-space: nowrap;
  text-decoration: none;
}

.badge-ok {
  background: var(--dc-oksoft);
  color: var(--dc-ok);
}

.badge-accent {
  background: var(--dc-asoft);
  color: var(--dc-aink);
}

.badge-warn {
  background: var(--dc-warnsoft);
  color: var(--dc-warn);
}

/* ---------- Page 1: Overview ---------- */
.hero-card {
  padding: 32px 28px 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.wordmark-wrap {
  height: 58px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}

.wordmark-svg {
  height: 54px;
  width: auto;
  max-width: 100%;
}

.wordmark-text-main {
  fill: #17132B;
}

:root[data-theme="dark"] .wordmark-text-main {
  fill: #FFFFFF;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .wordmark-text-main {
    fill: #FFFFFF;
  }
}

.hero-tagline {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 30px;
  letter-spacing: -0.02em;
  color: var(--dc-ink);
}

.hero-description {
  margin: 8px auto 0;
  max-width: 580px;
  color: var(--dc-muted);
  font-size: 14.5px;
  line-height: 22px;
}

.hero-cta-row {
  margin-top: 18px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.trust-pill-row {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--dc-line);
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px 18px;
}

.trust-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--dc-ink2);
}

.trust-pill svg {
  color: var(--dc-aink);
}

.walkthrough-layout {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
}

.walkthrough-nav {
  padding: 18px;
  border-right: 1px solid var(--dc-line);
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--dc-sunken);
  justify-content: center;
}

.feature-tab-btn {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--dc-line);
  border-radius: 11px;
  background: var(--dc-bg);
  color: var(--dc-ink);
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 3px;
  transition: background-color 0.14s, border-color 0.14s;
}

.feature-tab-btn:hover {
  background: var(--dc-hover);
}

.feature-tab-btn[aria-selected="true"] {
  border-color: var(--dc-fill);
  background: var(--dc-asoft);
}

.feature-tab-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13.5px;
  font-weight: 650;
  color: var(--dc-ink);
}

.feature-tab-btn[aria-selected="true"] .feature-tab-title {
  color: var(--dc-aink);
}

.feature-tab-desc {
  font-size: 12px;
  line-height: 16px;
  color: var(--dc-muted);
}

.walkthrough-stage {
  padding: 20px;
  background: var(--dc-bg);
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.sim-frame {
  border: 1px solid var(--dc-line2);
  border-radius: 12px;
  background: var(--dc-bg);
  overflow: hidden;
}

.sim-header {
  min-height: 48px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--dc-line);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: var(--dc-bg);
}

.sim-forum-bar {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.sim-forum-meta strong {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 16px;
  color: var(--dc-ink);
}

.sim-forum-meta span {
  display: block;
  font-size: 11px;
  line-height: 14px;
  color: var(--dc-muted);
}

.sim-body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 290px;
}

.sim-topic-title {
  font-size: 14px;
  font-weight: 650;
  line-height: 20px;
  color: var(--dc-ink);
  margin: 0;
}

.sim-panel-card {
  border: 1px solid var(--dc-line);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--dc-bg);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sim-panel-card h3 {
  margin: 0;
  font-size: 12.5px;
  font-weight: 650;
  color: var(--dc-ink);
}

.sim-panel-card ul {
  margin: 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12.5px;
  line-height: 19px;
  color: var(--dc-ink2);
}

.cite-pill {
  display: inline-flex;
  align-items: center;
  padding: 0 5px;
  height: 17px;
  border-radius: 4px;
  background: var(--dc-asoft);
  color: var(--dc-aink);
  font-size: 11px;
  font-weight: 650;
  text-decoration: none;
}

.sim-trace {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 11px;
  border-radius: 8px;
  background: var(--dc-sunken);
  font-size: 11.5px;
  color: var(--dc-ink2);
}

.sim-composer {
  margin-top: auto;
  padding: 8px 11px;
  border: 1px solid var(--dc-line2);
  border-radius: 9px;
  background: var(--dc-sunken);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--dc-muted);
}

.sim-composer-chips {
  display: flex;
  align-items: center;
  gap: 5px;
}

.preview-strip {
  padding: 16px 22px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.preview-strip-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.preview-strip-label {
  font-size: 12.5px;
  font-weight: 650;
  color: var(--dc-ink);
  margin-right: 4px;
}

.mini-site-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--dc-sunken);
  border: 1px solid var(--dc-line);
  color: var(--dc-ink2);
  font-size: 12px;
  font-weight: 500;
  text-decoration: none;
  transition: background-color 0.14s, border-color 0.14s;
}

.mini-site-chip:hover {
  background: var(--dc-hover);
  border-color: var(--dc-line2);
  color: var(--dc-ink);
}

.mini-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: hsl(var(--forum-hue, 230) var(--dc-forum-sat) var(--dc-forum-light));
}

.quickstart-bar {
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.quickstart-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.quickstart-title {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
  color: var(--dc-ink);
}

.quickstart-links {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 12.5px;
  font-weight: 600;
}

.link-btn {
  border: 0;
  background: transparent;
  color: var(--dc-aink);
  font-size: 12.5px;
  font-weight: 600;
  padding: 0;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.link-btn:hover {
  text-decoration: underline;
}

.quickstart-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.qs-card {
  padding: 12px 14px;
  border-radius: 11px;
  background: var(--dc-sunken);
  border: 1px solid var(--dc-line);
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.qs-num {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--dc-asoft);
  color: var(--dc-aink);
  font-size: 12px;
  font-weight: 700;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}

.qs-text {
  font-size: 12.5px;
  line-height: 18px;
  color: var(--dc-ink2);
}

/* ---------- Page 2: Supported Sites ---------- */
.directory-toolbar {
  padding: 14px 22px;
  background: var(--dc-sunken);
  border-bottom: 1px solid var(--dc-line);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.filter-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 11px;
  border: 1px solid var(--dc-line2);
  border-radius: 999px;
  background: var(--dc-bg);
  color: var(--dc-ink2);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.14s, border-color 0.14s, color 0.14s;
}

.filter-chip:hover {
  background: var(--dc-hover);
  color: var(--dc-ink);
}

.filter-chip[aria-pressed="true"] {
  border-color: var(--dc-fill);
  background: var(--dc-asoft);
  color: var(--dc-aink);
  font-weight: 600;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 240px;
  flex: 0 1 280px;
}

.search-box svg {
  position: absolute;
  left: 10px;
  width: 14px;
  height: 14px;
  color: var(--dc-muted);
  pointer-events: none;
}

.search-input {
  width: 100%;
  height: 32px;
  padding: 0 10px 0 30px;
  border: 1px solid var(--dc-line2);
  border-radius: 8px;
  background: var(--dc-bg);
  color: var(--dc-ink);
  font-size: 12.5px;
}

.search-input:focus {
  outline: none;
  border-color: var(--dc-fill);
  box-shadow: 0 0 0 1px var(--dc-fill);
}

.usecase-grid {
  padding: 16px 22px;
  border-bottom: 1px solid var(--dc-line);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  background: var(--dc-bg);
}

.usecase-card {
  padding: 11px 14px;
  border: 1px solid var(--dc-line);
  border-radius: 10px;
  background: var(--dc-sunken);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.usecase-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.usecase-card strong {
  font-size: 12.5px;
  font-weight: 650;
  color: var(--dc-ink);
}

.usecase-card p {
  margin: 0;
  font-size: 12px;
  line-height: 17px;
  color: var(--dc-ink2);
}

.sites-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(248px, 1fr));
  gap: 1px;
  background: var(--dc-line);
}

.site-card {
  background: var(--dc-bg);
  padding: 13px 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  text-decoration: none;
  color: inherit;
  transition: background-color 0.14s;
}

.site-card:hover {
  background: var(--dc-hover);
}

.site-card-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.forum-avatar {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  background: hsl(var(--forum-hue, 250) var(--dc-forum-sat) var(--dc-forum-light));
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
}

.site-card-title-wrap {
  min-width: 0;
  flex: 1;
}

.site-card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  font-size: 13px;
  font-weight: 650;
  line-height: 17px;
  color: var(--dc-ink);
}

.site-card-ext {
  color: var(--dc-muted);
  font-size: 11.5px;
  font-weight: 400;
}

.site-card-host {
  display: block;
  color: var(--dc-muted);
  font-size: 11.5px;
  line-height: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-card-desc {
  margin: 0;
  color: var(--dc-ink2);
  font-size: 12px;
  line-height: 16.5px;
}

.site-card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.empty-filter-msg {
  padding: 28px 22px;
  text-align: center;
  color: var(--dc-muted);
  font-size: 13px;
  background: var(--dc-bg);
}

.platform-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid var(--dc-line);
  background: var(--dc-sunken);
}

.platform-col {
  padding: 14px 20px;
  border-right: 1px solid var(--dc-line);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.platform-col:last-child {
  border-right: 0;
}

.platform-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.platform-title {
  font-size: 13px;
  font-weight: 650;
  color: var(--dc-ink);
}

.platform-desc {
  margin: 0;
  color: var(--dc-muted);
  font-size: 12px;
  line-height: 17px;
}

.directory-footer {
  padding: 12px 22px;
  border-top: 1px solid var(--dc-line);
  background: var(--dc-bg);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: var(--dc-muted);
}

/* ---------- Page 3: Guide ---------- */
.docs-grid {
  padding: 20px 24px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.doc-block {
  min-width: 0;
  border: 1px solid var(--dc-line);
  border-radius: 12px;
  padding: 16px 18px;
  background: var(--dc-bg);
  display: flex;
  flex-direction: column;
  gap: 8px;
  scroll-margin-top: 76px;
}

.doc-block-wide {
  grid-column: 1 / -1;
}

.doc-block h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: var(--dc-ink);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.doc-block p {
  margin: 0;
  color: var(--dc-ink2);
  font-size: 12.5px;
  line-height: 19px;
}

.doc-list {
  margin: 0;
  padding-left: 17px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--dc-ink2);
  font-size: 12.5px;
  line-height: 19px;
}

.icon-feature-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 2px;
}

.icon-feature-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.feat-icon-box {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--dc-asoft);
  color: var(--dc-aink);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  margin-top: 1px;
}

.feat-icon-box svg {
  width: 15px;
  height: 15px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.feat-item-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.feat-item-text strong {
  font-size: 12.5px;
  font-weight: 650;
  color: var(--dc-ink);
  line-height: 17px;
}

.feat-item-text span {
  font-size: 12px;
  color: var(--dc-ink2);
  line-height: 17px;
}

.install-split {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.install-option {
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--dc-line);
  background: var(--dc-sunken);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.install-option-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.install-option-head strong {
  font-size: 13px;
  font-weight: 650;
  color: var(--dc-ink);
}

.store-btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.usecase-title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.usecase-title-wrap svg {
  width: 15px;
  height: 15px;
  color: var(--dc-aink);
  stroke: currentColor;
  fill: none;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex: 0 0 auto;
}

.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--dc-line);
  border-radius: 10px;
}

table.dc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
  text-align: left;
}

.dc-table th,
.dc-table td {
  padding: 9px 13px;
  border-bottom: 1px solid var(--dc-line);
}

.dc-table th {
  background: var(--dc-sunken);
  color: var(--dc-ink);
  font-weight: 600;
  font-size: 12px;
}

.dc-table tr:last-child td {
  border-bottom: 0;
}

/* ---------- Page 4: FAQ ---------- */
.faq-list {
  padding: 16px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

details.faq-item {
  border: 1px solid var(--dc-line);
  border-radius: 11px;
  background: var(--dc-bg);
  overflow: hidden;
  scroll-margin-top: 76px;
}

details.faq-item summary {
  padding: 13px 16px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--dc-ink);
  cursor: pointer;
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  transition: background-color 0.14s;
}

details.faq-item summary::-webkit-details-marker {
  display: none;
}

details.faq-item summary:hover {
  background: var(--dc-hover);
}

.faq-chevron {
  width: 8px;
  height: 8px;
  border-right: 1.75px solid var(--dc-muted);
  border-bottom: 1.75px solid var(--dc-muted);
  transform: rotate(45deg);
  transition: transform 0.16s ease;
  flex: 0 0 auto;
}

details.faq-item[open] summary .faq-chevron {
  transform: rotate(225deg);
}

.faq-answer {
  padding: 11px 16px 14px;
  color: var(--dc-ink2);
  font-size: 12.5px;
  line-height: 20px;
  border-top: 1px solid var(--dc-line);
}

/* ---------- Page 5 & 6: Support & Privacy Policy ---------- */
.support-section {
  padding: 20px 24px 24px;
  border-top: 1px solid var(--dc-line);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.support-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.support-head h2 {
  font-size: 15px;
  font-weight: 650;
  color: var(--dc-ink);
  display: flex;
  align-items: center;
  gap: 8px;
}

.support-head p {
  font-size: 12.5px;
  color: var(--dc-ink2);
}

.support-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.form-field-wide {
  grid-column: 1 / -1;
}

.form-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--dc-ink);
}

.form-input,
.form-select,
.form-textarea {
  width: 100%;
  border: 1px solid var(--dc-line);
  border-radius: 9px;
  background: var(--dc-bg);
  color: var(--dc-ink);
  font-family: inherit;
  font-size: 12.5px;
  padding: 8px 11px;
  transition: border-color 0.14s, background-color 0.14s;
}

.form-input::placeholder,
.form-textarea::placeholder {
  color: var(--dc-muted);
}

.form-input:focus-visible,
.form-select:focus-visible,
.form-textarea:focus-visible {
  outline: 2px solid var(--dc-fill);
  outline-offset: 1px;
  border-color: var(--dc-fill);
}

.form-input[aria-invalid="true"] {
  border-color: var(--dc-bad);
}

.form-textarea {
  min-height: 92px;
  resize: vertical;
  line-height: 18px;
}

.support-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding-top: 2px;
}

.privacy-body-wrap {
  padding: 20px 24px 28px;
  border-top: 1px solid var(--dc-line);
}

.markdown-prose {
  color: var(--dc-ink2);
  font-size: 13px;
  line-height: 21px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.markdown-prose h1 {
  font-size: 18px;
  font-weight: 700;
  color: var(--dc-ink);
  margin-top: 4px;
}

.markdown-prose h2 {
  font-size: 15px;
  font-weight: 650;
  color: var(--dc-ink);
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--dc-line);
}

.markdown-prose h3 {
  font-size: 13.5px;
  font-weight: 650;
  color: var(--dc-ink);
  margin-top: 6px;
}

.markdown-prose ul {
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.markdown-prose ul ul {
  margin-top: 4px;
  padding-left: 18px;
}

.markdown-prose strong {
  color: var(--dc-ink);
  font-weight: 600;
}

/* ---------- Footer ---------- */
.site-footer {
  max-width: 1040px;
  margin: 0 auto;
  padding: 0 20px 44px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--dc-muted);
  font-size: 12px;
}

.footer-links {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

@media (max-width: 820px) {
  .walkthrough-layout,
  .quickstart-grid,
  .usecase-grid,
  .platform-grid,
  .docs-grid,
  .support-form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .walkthrough-nav {
    border-right: 0;
    border-bottom: 1px solid var(--dc-line);
  }
  .platform-col {
    border-right: 0;
    border-bottom: 1px solid var(--dc-line);
  }
  .platform-col:last-child {
    border-bottom: 0;
  }
  .site-header-inner {
    height: auto;
    padding: 10px 14px;
    flex-wrap: wrap;
    gap: 8px;
  }
  .nav-links {
    order: 3;
    width: 100%;
    flex-wrap: wrap;
    justify-content: center;
    border-radius: 14px;
    gap: 3px;
    padding: 4px;
  }
  .nav-pill {
    height: 28px;
    padding: 0 9px;
    font-size: 12px;
    gap: 4px;
  }
  .nav-count {
    padding: 0 5px;
  }
}

@media (max-width: 440px) {
  .nav-count {
    display: none;
  }
  .nav-pill {
    padding: 0 8px;
    font-size: 11.5px;
  }
}
`;
