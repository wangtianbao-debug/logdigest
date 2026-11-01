// Deterministic demo log generator: no Date.now, no Math.random, same bytes every run.
import { writeFileSync } from 'node:fs';

const OUT = new URL('../demo.log', import.meta.url);

let seed = 20241010;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
function pick(list) {
  let roll = rand() * list.reduce((sum, item) => sum + item.weight, 0);
  for (const item of list) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return list[list.length - 1];
}
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));

const PATHS = [
  { value: '/', weight: 16, size: [8000, 24000] },
  { value: '/pricing', weight: 7, size: [9000, 21000] },
  { value: '/docs/getting-started', weight: 6, size: [11000, 26000] },
  { value: '/docs/api-reference', weight: 5, size: [16000, 42000] },
  { value: '/blog/2024-09-release-notes', weight: 4, size: [12000, 30000] },
  { value: '/blog/2024-08-search-rewrite', weight: 3, size: [12000, 30000] },
  { value: '/api/items', weight: 12, size: [400, 9000] },
  { value: '/api/items/search', weight: 8, size: [600, 14000] },
  { value: '/api/session', weight: 5, size: [120, 400] },
  { value: '/assets/app.css', weight: 6, size: [28000, 41000] },
  { value: '/assets/app.js', weight: 6, size: [90000, 180000] },
  { value: '/assets/fonts/inter.woff2', weight: 4, size: [24000, 32000] },
  { value: '/favicon.ico', weight: 4, size: [1100, 1500] },
  { value: '/health', weight: 5, size: [40, 90] },
  { value: '/old-dashboard', weight: 1, size: [0, 400] },
];

const AGENTS = [
  {
    value:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    weight: 44,
  },
  {
    value:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    weight: 18,
  },
  { value: 'Mozilla/5.0 (X11; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0', weight: 9 },
  {
    value:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91',
    weight: 7,
  },
  { value: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', weight: 6 },
  { value: 'curl/8.4.0', weight: 5 },
  { value: 'python-requests/2.31.0', weight: 4 },
  { value: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)', weight: 3 },
  { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', weight: 4 },
];

const REFERRERS = [
  { value: 'https://www.google.com/', weight: 14 },
  { value: 'https://news.ycombinator.com/', weight: 4 },
  { value: 'https://twitter.com/', weight: 3 },
  { value: 'https://github.com/', weight: 3 },
  { value: 'https://blog.example.com/posts/launch', weight: 2 },
];

const STATUS = [
  { value: 200, weight: 855 },
  { value: 304, weight: 85 },
  { value: 301, weight: 22 },
  { value: 404, weight: 26 },
  { value: 500, weight: 8 },
  { value: 429, weight: 4 },
];

const VISITORS = Array.from({ length: 900 }, (_, i) => {
  const block = i % 3;
  const base = block === 0 ? '203.0.113.' : block === 1 ? '198.51.100.' : '192.0.2.';
  const isV6 = i % 37 === 0;
  return {
    ip: isV6 ? `2001:db8:${(i % 256).toString(16)}::${(i % 97) + 1}` : `${base}${(i % 254) + 1}`,
    // Pareto-ish: most visitors are light, a handful are heavy (monitors, crawlers).
    weight: 1 + Math.round(420 * Math.pow(rand(), 7)),
  };
});
const totalWeight = VISITORS.reduce((sum, v) => sum + v.weight, 0);

// Traffic follows a plain working-hours curve; the sum is normalised by pickHour.
const HOUR_WEIGHTS = [14, 10, 8, 6, 5, 6, 10, 20, 34, 46, 52, 54, 56, 58, 60, 58, 54, 50, 46, 42, 36, 30, 24, 18];

function pickHour() {
  let roll = rand() * HOUR_WEIGHTS.reduce((sum, value) => sum + value, 0);
  for (let hour = 0; hour < 24; hour++) {
    roll -= HOUR_WEIGHTS[hour];
    if (roll <= 0) return hour;
  }
  return 23;
}

const DAYS = 61;
const START = Date.UTC(2024, 7, 12); // 2024-08-12
const MONTH = ['Aug', 'Sep', 'Oct'];
const LINES = [];

// A release-day spike keeps the daily chart from being flat.
const SPIKE = { day: 33, multiplier: 2.6 };

for (let day = 0; day < DAYS; day++) {
  const boost = day === SPIKE.day ? SPIKE.multiplier : 1;
  const weekday = new Date(START + day * 86400000).getUTCDay();
  const weekend = weekday === 0 || weekday === 6 ? 0.62 : 1;
  const count = Math.round((230 + rand() * 90) * boost * weekend);

  for (let i = 0; i < count; i++) {
    const hour = pickHour();
    const minute = int(0, 59);
    const second = int(0, 59);
    const date = new Date(START + day * 86400000);
    const stamp = `${String(date.getUTCDate()).padStart(2, '0')}/${MONTH[date.getUTCMonth() - 7]}/${date.getUTCFullYear()}:${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')} +0000`;

    let roll = rand() * totalWeight;
    let visitor = VISITORS[0];
    for (const candidate of VISITORS) {
      roll -= candidate.weight;
      if (roll <= 0) {
        visitor = candidate;
        break;
      }
    }

    const path = pick(PATHS);
    const status = statusFor(path.value);
    const agent = pick(AGENTS).value;
    const referer = rand() < 0.62 ? '-' : pick(REFERRERS).value;
    const bytes =
      status === 304 || status === 301
        ? 0
        : status >= 400
          ? int(120, 900)
          : int(path.size[0], path.size[1]);

    LINES.push(
      `${visitor.ip} - - [${stamp}] "GET ${path.value} HTTP/1.1" ${status} ${bytes ? bytes : '-'} "${referer}" "${agent}"`,
    );
  }
}

function statusFor(path) {
  if (path === '/health') return rand() < 0.02 ? 500 : 200;
  if (path === '/old-dashboard') return rand() < 0.72 ? 404 : 301;
  if (path.startsWith('/api/') && rand() < 0.035) return 500;
  if (rand() < 0.012) return 500;
  return pick(STATUS).value;
}

writeFileSync(OUT, `${LINES.join('\n')}\n`, 'utf8');
console.log(`${LINES.length} lines → demo.log`);
