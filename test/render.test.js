import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHtml, formatBytes, formatNumber, formatPercent, escapeHtml } from '../src/render.js';
import { parseLog } from '../src/parse.js';
import { computeStats } from '../src/stats.js';

function statsFrom(lines) {
  return computeStats(parseLog(lines.join('\n')).entries);
}

const LINES = [
  '10.0.0.1 - - [10/Oct/2024:10:00:00 +0000] "GET / HTTP/1.1" 200 1024 "-" "Mozilla/5.0 Chrome/120"',
  '10.0.0.2 - - [10/Oct/2024:11:00:00 +0000] "GET /a?x=1 HTTP/1.1" 200 2048 "-" "curl/8.4.0"',
  '10.0.0.3 - - [11/Oct/2024:11:00:00 +0000] "GET /a HTTP/1.1" 500 64 "https://ref.example/" "Mozilla/5.0 Firefox/121"',
  '10.0.0.4 - - [11/Oct/2024:12:00:00 +0000] "GET /gone HTTP/1.1" 404 32 "-" "bingbot/2.0"',
];

test('formatters are human sized', () => {
  assert.equal(formatNumber(2741), '2,741');
  assert.equal(formatNumber(0), '0');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1500), '1.5 kB');
  assert.equal(formatBytes(2_500_000), '2.5 MB');
  assert.equal(formatPercent(0), '0%');
  assert.equal(formatPercent(0.0002), '<0.1%');
  assert.equal(formatPercent(0.5), '50%');
  assert.equal(formatPercent(0.0123), '1.2%');
});

test('escapeHtml neutralises markup', () => {
  assert.equal(escapeHtml('<script>&"'), '&lt;script&gt;&amp;&quot;');
});

test('the report carries the numbers and no scripts', () => {
  const html = renderHtml({ name: 'shop.example.com', stats: statsFrom(LINES), generatedAt: new Date('2024-10-12T00:00:00Z'), skipped: 2 });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /shop\.example\.com/);
  assert.match(html, /2,741|4 requests/);
  assert.match(html, /2024-10-10 → 2024-10-11/);
  assert.match(html, /Most requested paths/);
  assert.doesNotMatch(html, /<script/i);
  assert.equal((html.match(/<section/g) ?? []).length >= 5, true);
});

test('sections for every part of the report are present', () => {
  const html = renderHtml({ stats: statsFrom(LINES), generatedAt: new Date('2024-10-12T00:00:00Z') });
  for (const heading of ['Requests per day', 'Requests by hour', 'Status codes', 'Most requested paths', 'Busiest addresses', 'Clients', 'Referrers']) {
    assert.ok(html.includes(heading), `missing ${heading}`);
  }
});

test('untrusted paths and user agents are escaped', () => {
  const evil = [
    '10.0.0.1 - - [10/Oct/2024:10:00:00 +0000] "GET /<script>alert(1)</script> HTTP/1.1" 200 1 "-" "Evil <b>Bot</b>"',
  ];
  const html = renderHtml({ stats: statsFrom(evil) });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<b>Bot<\/b>/);
  assert.match(html, /<td>Evil<\/td>/);
});

test('the hour chart labels each bar', () => {
  const html = renderHtml({ stats: statsFrom(LINES) });
  assert.match(html, /title="10:00 · 1 requests"/);
  assert.match(html, /title="11:00 · 2 requests"/);
});

test('day bars scale to the busiest day', () => {
  const html = renderHtml({ stats: statsFrom(LINES) });
  assert.match(html, /height:100%/);
  assert.match(html, /title="2024-10-11 · 2 requests"/);
});

test('empty-but-valid data still renders', () => {
  const stats = computeStats([]);
  const html = renderHtml({ stats });
  assert.match(html, /no entries/);
  assert.match(html, /No user agents recorded/);
});
