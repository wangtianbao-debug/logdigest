const BOT = /bot\b|crawler|spider|slurp|bingpreview|curl\/|wget\/|python-requests|go-http-client|java\/|libwww|headless|monitor|uptime|scrapy|httpclient/i;

const AGENT_FAMILIES = [
  [/Edg\//i, 'Edge'],
  [/OPR\/|Opera/i, 'Opera'],
  [/Firefox\//i, 'Firefox'],
  [/Chrome\//i, 'Chrome'],
  [/Safari\//i, 'Safari'],
  [/curl\//i, 'curl'],
  [/Wget\//i, 'wget'],
  [/python-requests/i, 'python-requests'],
  [/Go-http-client/i, 'Go http client'],
  [/Googlebot/i, 'Googlebot'],
  [/bingbot/i, 'bingbot'],
  [/YandexBot/i, 'YandexBot'],
  [/AhrefsBot/i, 'AhrefsBot'],
];

export function isBot(agent) {
  return BOT.test(String(agent));
}

/** Collapse a full user agent to something readable in a table. */
export function agentFamily(agent) {
  const text = String(agent || '').trim();
  if (!text) return 'unknown';
  for (const [re, name] of AGENT_FAMILIES) if (re.test(text)) return name;
  const token = text.split(/[\s;(]/)[0];
  return token.length > 24 ? `${token.slice(0, 24)}…` : token || 'unknown';
}

export function stripQuery(path) {
  const text = String(path || '');
  const q = text.indexOf('?');
  const clean = q === -1 ? text : text.slice(0, q);
  return clean || '/';
}

export function statusClass(status) {
  return `${Math.floor(Number(status) / 100)}xx`;
}

export function isoDay(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function tally(map, key, weight = 1) {
  map.set(key, (map.get(key) ?? 0) + weight);
}

function topEntries(map, limit) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([key, hits]) => ({ key, hits }));
}

/**
 * Turn parsed access-log entries into the numbers a report needs.
 *
 * @param {object[]} entries
 * @param {{top?: number}} [opts]
 */
export function computeStats(entries, { top = 10 } = {}) {
  const total = entries.length;
  const ips = new Set();
  const days = new Map();
  const hours = new Array(24).fill(0);
  const ipHits = new Map();
  const paths = new Map();
  const pathBytes = new Map();
  const pathErrors = new Map();
  const agents = new Map();
  const referrers = new Map();
  const methods = new Map();
  const statuses = new Map();

  let bytes = 0;
  let errors = 0;
  let notFound = 0;
  let botHits = 0;
  let first = null;
  let last = null;
  let withAgent = 0;

  for (const entry of entries) {
    ips.add(entry.ip);
    tally(ipHits, entry.ip);
    bytes += entry.bytes;

    const day = isoDay(entry.time);
    tally(days, day);
    hours[entry.time.getUTCHours()] += 1;

    const path = stripQuery(entry.path);
    tally(paths, path);
    tally(pathBytes, path, entry.bytes);

    const isError = entry.status >= 500;
    if (isError) {
      errors++;
      tally(pathErrors, path);
    }
    if (entry.status === 404) notFound++;

    tally(statuses, entry.status);
    tally(methods, entry.method);

    if (entry.agent) {
      withAgent++;
      if (isBot(entry.agent)) botHits++;
      tally(agents, agentFamily(entry.agent));
    }
    if (entry.referer) tally(referrers, entry.referer);

    if (!first || entry.time < first) first = entry.time;
    if (!last || entry.time > last) last = entry.time;
  }

  const dayList = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count }));
  const peakDay = dayList.reduce((best, d) => (best === null || d.count > best.count ? d : best), null);

  return {
    total,
    uniqueIps: ips.size,
    bytes,
    errors,
    errorRate: total ? errors / total : 0,
    notFound,
    botHits,
    botRate: total ? botHits / total : 0,
    first,
    last,
    spanDays: dayList.length,
    byDay: dayList,
    peakDay,
    byHour: hours,
    topPaths: topEntries(paths, top).map((p) => ({
      path: p.key,
      hits: p.hits,
      share: total ? p.hits / total : 0,
      bytes: pathBytes.get(p.key) ?? 0,
      errors: pathErrors.get(p.key) ?? 0,
    })),
    topIps: topEntries(ipHits, top).map((entry) => ({
      ip: entry.key,
      hits: entry.hits,
      share: total ? entry.hits / total : 0,
    })),
    statuses: topEntries(statuses, 20).map((s) => ({ status: Number(s.key), hits: s.hits, share: total ? s.hits / total : 0 })),
    methods: topEntries(methods, 8).map((m) => ({ method: m.key, hits: m.hits })),
    topAgents: topEntries(agents, top).map((a) => ({ agent: a.key, hits: a.hits, share: withAgent ? a.hits / withAgent : 0 })),
    topReferrers: topEntries(referrers, top).map((r) => ({ referer: r.key, hits: r.hits })),
  };
}
