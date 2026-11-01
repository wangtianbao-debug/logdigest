/**
 * Renders a parsed access log as one self-contained HTML page.
 * No scripts, no fonts to download, no network requests: the file works
 * offline and prints sensibly.
 */

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatNumber(value) {
  return String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1000) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB', 'TB'];
  let size = bytes / 1000;
  let unit = 0;
  while (size >= 1000 && unit < units.length - 1) {
    size /= 1000;
    unit++;
  }
  return `${size >= 100 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

export function formatPercent(share, digits = 1) {
  const value = (Number(share) || 0) * 100;
  if (value === 0) return '0%';
  if (value < 0.1) return '<0.1%';
  return `${value.toFixed(value >= 10 ? 0 : digits)}%`;
}

function isoDateShort(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

const STYLE = `
:root {
  --paper: #f8f5ef;
  --ink: #16150f;
  --muted: #6d6659;
  --rule: #ddd5c6;
  --accent: #23594a;
  --accent-soft: #cfdfd8;
  --good: #3d6b45;
  --warn: #9a6a26;
  --bad: #8c3a2f;
  --measure: 940px;
  --serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --mono: "SF Mono", "Cascadia Mono", "JetBrains Mono", Consolas, monospace;
}
* { box-sizing: border-box; }
html { overflow-x: clip; }
body {
  margin: 0;
  padding: 56px 32px 96px;
  background: var(--paper);
  color: var(--ink);
  font: 15px/1.55 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  -webkit-font-smoothing: antialiased;
}
main { max-width: var(--measure); margin: 0 auto; }
h1, h2 { font-family: var(--serif); font-weight: 600; letter-spacing: -0.01em; }
h1 { font-size: clamp(1.9rem, 4.4vw, 2.9rem); margin: 0 0 8px; line-height: 1.1; }
h2 { font-size: 1.06rem; margin: 0; }
a { color: var(--accent); text-decoration-thickness: 1px; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.masthead { border-bottom: 2px solid var(--ink); padding-bottom: 18px; }
.sub { color: var(--muted); font-size: .86rem; display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 0; }
.sub span { white-space: nowrap; }
.sub span + span::before { content: "·"; color: var(--rule); margin-right: 12px; }

.strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 0;
  margin: 26px 0 40px;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}
.metric { padding: 16px 16px 16px 0; border-right: 1px solid var(--rule); }
.metric:last-child { border-right: 0; }
.metric b { display: block; font: 600 1.55rem/1.15 var(--mono); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.metric span { display: block; color: var(--muted); font-size: .78rem; text-transform: uppercase; letter-spacing: .06em; margin-top: 6px; }
.metric.is-bad b { color: var(--bad); }
.metric.is-warn b { color: var(--warn); }
.metric.is-good b { color: var(--good); }

section { margin: 0 0 42px; }
.head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--rule); padding-bottom: 8px; margin-bottom: 16px; }
.head p { margin: 0; color: var(--muted); font-size: .8rem; }

.daybars { display: flex; align-items: flex-end; gap: 2px; height: 116px; }
.daybars i { flex: 1 1 0; min-width: 1px; background: var(--accent); border-radius: 1px 1px 0 0; opacity: .82; }
.daybars i:hover { opacity: 1; }
.axis { display: flex; justify-content: space-between; color: var(--muted); font: .74rem/1 var(--mono); margin-top: 8px; }

.hours { display: flex; align-items: flex-end; gap: 4px; height: 72px; margin-bottom: 6px; }
.hours i { flex: 1 1 0; min-height: 2px; background: var(--accent-soft); border-top: 2px solid var(--accent); }
.hours i:hover { background: var(--accent); }
.hourscale { display: flex; justify-content: space-between; color: var(--muted); font: .72rem/1 var(--mono); }

table { width: 100%; border-collapse: collapse; font-size: .87rem; }
thead th {
  text-align: left;
  font-weight: 500;
  font-size: .72rem;
  letter-spacing: .07em;
  text-transform: uppercase;
  color: var(--muted);
  padding: 0 8px 8px 0;
  border-bottom: 1px solid var(--rule);
}
tbody td { padding: 8px 8px 8px 0; border-bottom: 1px solid color-mix(in srgb, var(--rule) 55%, transparent); vertical-align: baseline; }
tbody tr:last-child td { border-bottom: 0; }
td.num, th.num { text-align: right; font-family: var(--mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
td.path { font-family: var(--mono); font-size: .82rem; word-break: break-all; max-width: 34ch; }
td.muted { color: var(--muted); }
th.col-code { width: 8ch; }
th.col-hits { width: 12ch; }
th.col-share { width: 10ch; }
th.col-bar { width: 30%; }
td.bar-col .share { margin-top: 0; height: 4px; }
.bad { color: var(--bad); }
.warn { color: var(--warn); }
.good { color: var(--good); }

.share { display: block; height: 3px; background: color-mix(in srgb, var(--accent) 14%, transparent); margin-top: 6px; position: relative; }
.share u { position: absolute; inset: 0 auto 0 0; background: var(--accent); text-decoration: none; }

.split { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 0 40px; }
.split section { margin-bottom: 42px; }

footer { border-top: 1px solid var(--rule); padding-top: 14px; color: var(--muted); font-size: .78rem; display: flex; flex-wrap: wrap; gap: 6px 16px; }

@media (max-width: 640px) {
  body { padding: 32px 18px 64px; }
}
@media print {
  body { padding: 0; background: #fff; }
  section { break-inside: avoid; }
}
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
`.trim();

function renderDayChart(stats) {
  const days = stats.byDay;
  if (!days.length) return '';
  const peak = Math.max(...days.map((d) => d.count)) || 1;
  const bars = days
    .map((day) => {
      const height = Math.max(1, Math.round((day.count / peak) * 100));
      return `<i style="height:${height}%" title="${escapeHtml(day.date)} · ${formatNumber(day.count)} requests"></i>`;
    })
    .join('');
  return `
    <section>
      <div class="head"><h2>Requests per day</h2><p>${formatNumber(days.length)} day${days.length === 1 ? '' : 's'}, peak ${formatNumber(peak)}</p></div>
      <div class="daybars">${bars}</div>
      <div class="axis"><span>${escapeHtml(days[0].date)}</span><span>${escapeHtml(days[days.length - 1].date)}</span></div>
    </section>`;
}

function renderHourChart(stats) {
  const peak = Math.max(...stats.byHour) || 1;
  const bars = stats.byHour
    .map((count, hour) => {
      const height = count ? Math.max(4, Math.round((count / peak) * 100)) : 2;
      return `<i style="height:${height}%" title="${String(hour).padStart(2, '0')}:00 · ${formatNumber(count)} requests"></i>`;
    })
    .join('');
  return `
    <section>
      <div class="head"><h2>Requests by hour</h2><p>UTC, whole period</p></div>
      <div class="hours">${bars}</div>
      <div class="hourscale"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
    </section>`;
}

function renderStatuses(stats) {
  const rows = stats.statuses
    .map((entry) => {
      const cls = entry.status >= 500 ? 'bad' : entry.status >= 400 ? 'warn' : entry.status >= 300 ? 'muted' : 'good';
      return `<tr>
        <td class="num"><span class="${cls}">${entry.status}</span></td>
        <td class="num">${formatNumber(entry.hits)}</td>
        <td class="num muted">${formatPercent(entry.share)}</td>
        <td class="bar-col"><span class="share"><u style="width:${Math.max(1, Math.round(entry.share * 100))}%"></u></span></td>
      </tr>`;
    })
    .join('');
  return `
    <section>
      <div class="head"><h2>Status codes</h2><p>${formatPercent(stats.errorRate)} server errors</p></div>
      <table>
        <thead><tr><th class="num col-code">Code</th><th class="num col-hits">Requests</th><th class="num col-share">Share</th><th class="col-bar"></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function renderPaths(stats) {
  const rows = stats.topPaths
    .map(
      (entry) => `<tr>
        <td class="path">${escapeHtml(entry.path)}</td>
        <td class="num">${formatNumber(entry.hits)}</td>
        <td class="num muted">${formatPercent(entry.share)}</td>
        <td class="num">${formatBytes(entry.bytes)}</td>
        <td class="num ${entry.errors ? 'bad' : 'muted'}">${entry.errors ? formatNumber(entry.errors) : '–'}</td>
      </tr>`,
    )
    .join('');
  return `
    <section>
      <div class="head"><h2>Most requested paths</h2><p>query strings collapsed</p></div>
      <table>
        <thead><tr><th>Path</th><th class="num">Hits</th><th class="num">Share</th><th class="num">Bytes</th><th class="num">5xx</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function renderVisitors(stats) {
  return `
    <section>
      <div class="head"><h2>Busiest addresses</h2><p>${formatNumber(stats.uniqueIps)} unique</p></div>
      <table>
        <thead><tr><th>Address</th><th class="num">Requests</th><th class="num">Share</th></tr></thead>
        <tbody>${stats.topIps
          .map(
            (entry) => `<tr>
              <td class="path">${escapeHtml(entry.ip)}</td>
              <td class="num">${formatNumber(entry.hits)}</td>
              <td class="num muted">${formatPercent(entry.share)}</td>
            </tr>`,
          )
          .join('')}</tbody>
      </table>
    </section>`;
}

function renderAgents(stats) {
  const rows = stats.topAgents
    .map(
      (entry) => `<tr>
        <td>${escapeHtml(entry.agent)}</td>
        <td class="num">${formatNumber(entry.hits)}</td>
        <td class="num muted">${formatPercent(entry.share)}</td>
      </tr>`,
    )
    .join('');
  const referrers = stats.topReferrers.length
    ? stats.topReferrers
        .map(
          (entry) => `<tr>
            <td class="path">${escapeHtml(entry.referer)}</td>
            <td class="num">${formatNumber(entry.hits)}</td>
          </tr>`,
        )
        .join('')
    : '<tr><td class="muted" colspan="2">No referrers recorded.</td></tr>';
  return `
    <div class="split">
      <section>
        <div class="head"><h2>Clients</h2><p>${formatPercent(stats.botRate)} automated</p></div>
        <table>
          <thead><tr><th>User agent</th><th class="num">Requests</th><th class="num">Share</th></tr></thead>
          <tbody>${rows || '<tr><td class="muted" colspan="3">No user agents recorded.</td></tr>'}</tbody>
        </table>
      </section>
      <section>
        <div class="head"><h2>Referrers</h2><p>where visitors came from</p></div>
        <table>
          <thead><tr><th>URL</th><th class="num">Requests</th></tr></thead>
          <tbody>${referrers}</tbody>
        </table>
      </section>
    </div>`;
}

/**
 * @param {{name?: string, stats: object, generatedAt?: Date, skipped?: number}} input
 * @returns {string} complete HTML document
 */
export function renderHtml({ name = 'access log', stats, generatedAt = new Date(), skipped = 0 }) {
  const range = stats.first && stats.last ? `${isoDateShort(stats.first)} → ${isoDateShort(stats.last)}` : 'no entries';
  const generated = `${isoDateShort(generatedAt)} ${String(generatedAt.getUTCHours()).padStart(2, '0')}:${String(generatedAt.getUTCMinutes()).padStart(2, '0')} UTC`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(name)} — access log report</title>
<style>
${STYLE}
</style>
</head>
<body>
<main>
  <header class="masthead">
    <h1>${escapeHtml(name)}</h1>
    <p class="sub">
      <span>${escapeHtml(range)}</span>
      <span>${formatNumber(stats.total)} request${stats.total === 1 ? '' : 's'}</span>
      <span>${formatNumber(stats.uniqueIps)} address${stats.uniqueIps === 1 ? '' : 'es'}</span>
    </p>
  </header>

  <div class="strip">
    <div class="metric"><b>${formatNumber(stats.total)}</b><span>requests</span></div>
    <div class="metric"><b>${formatNumber(stats.uniqueIps)}</b><span>unique visitors</span></div>
    <div class="metric"><b>${formatBytes(stats.bytes)}</b><span>bytes served</span></div>
    <div class="metric is-warn"><b>${formatPercent(stats.errorRate)}</b><span>5xx errors</span></div>
    <div class="metric"><b>${formatNumber(stats.notFound)}</b><span>not found</span></div>
    <div class="metric"><b>${formatPercent(stats.botRate)}</b><span>automated</span></div>
  </div>

  ${renderDayChart(stats)}
  ${renderHourChart(stats)}
  ${renderStatuses(stats)}
  ${renderPaths(stats)}
  ${renderVisitors(stats)}
  ${renderAgents(stats)}

  <footer>
    <span>logdigest · generated ${escapeHtml(generated)}</span>
    <span>${formatNumber(skipped)} line${skipped === 1 ? '' : 's'} skipped</span>
    <span>runs locally, nothing uploaded</span>
  </footer>
</main>
</body>
</html>
`;
}
