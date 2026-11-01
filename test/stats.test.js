import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, agentFamily, isBot, stripQuery, statusClass, isoDay } from '../src/stats.js';
import { parseLine } from '../src/parse.js';

function line(ip, path, status = 200, bytes = 100, extra = '"-" "-"', hour = 12, day = 10) {
  const stamp = `${String(day).padStart(2, '0')}/Oct/2024:${String(hour).padStart(2, '0')}:00:00 +0000`;
  return parseLine(`${ip} - - [${stamp}] "GET ${path} HTTP/1.1" ${status} ${bytes} ${extra}`);
}

const ENTRIES = [
  line('10.0.0.1', '/', 200, 1000),
  line('10.0.0.1', '/?utm=x', 200, 1000),
  line('10.0.0.2', '/api/items?page=2', 200, 500, '"-" "curl/8.4.0"'),
  line('10.0.0.3', '/missing', 404, 90, '"https://ref.example/" "Mozilla/5.0 Chrome/120"'),
  line('10.0.0.4', '/api/items', 500, 120, '"-" "Googlebot/2.1"', 3, 11),
];

test('totals and rates', () => {
  const stats = computeStats(ENTRIES);
  assert.equal(stats.total, 5);
  assert.equal(stats.uniqueIps, 4);
  assert.equal(stats.bytes, 2710);
  assert.equal(stats.errors, 1);
  assert.equal(stats.errorRate, 0.2);
  assert.equal(stats.notFound, 1);
  assert.equal(stats.botHits, 2);
  assert.equal(stats.botRate, 0.4);
});

test('day and hour histograms', () => {
  const stats = computeStats(ENTRIES);
  assert.deepEqual(stats.byDay.map((d) => d.date), ['2024-10-10', '2024-10-11']);
  assert.deepEqual(stats.byDay.map((d) => d.count), [4, 1]);
  assert.equal(stats.peakDay.date, '2024-10-10');
  assert.equal(stats.byHour[12], 4);
  assert.equal(stats.byHour[3], 1);
  assert.equal(stats.byHour.length, 24);
  assert.equal(stats.spanDays, 2);
});

test('paths are grouped without query strings', () => {
  const stats = computeStats(ENTRIES);
  assert.equal(stats.topPaths[0].path, '/');
  assert.equal(stats.topPaths[0].hits, 2);
  assert.equal(stats.topPaths[0].share, 0.4);
  assert.equal(stats.topPaths[0].bytes, 2000);

  const api = stats.topPaths.find((p) => p.path === '/api/items');
  assert.equal(api.hits, 2);
  assert.equal(api.errors, 1);
});

test('top paths respect the top limit', () => {
  const stats = computeStats(ENTRIES, { top: 1 });
  assert.equal(stats.topPaths.length, 1);
  assert.equal(stats.topIps.length, 1);
  assert.equal(stats.topAgents.length, 1);
});

test('visitors are ranked by request count', () => {
  const stats = computeStats(ENTRIES);
  assert.deepEqual(stats.topIps[0], { ip: '10.0.0.1', hits: 2, share: 0.4 });
  assert.equal(stats.topIps.length, 4);
});

test('statuses, methods and clients', () => {
  const stats = computeStats(ENTRIES);
  assert.equal(stats.statuses[0].status, 200);
  assert.equal(stats.statuses[0].hits, 3);
  assert.deepEqual(stats.methods, [{ method: 'GET', hits: 5 }]);
  assert.equal(stats.topAgents[0].agent, 'Chrome');
  assert.equal(stats.topReferrers[0].referer, 'https://ref.example/');
});

test('agentFamily recognises common clients', () => {
  assert.equal(agentFamily('Mozilla/5.0 (Windows NT 10.0) Chrome/121 Safari/537.36'), 'Chrome');
  assert.equal(agentFamily('Mozilla/5.0 Firefox/121.0'), 'Firefox');
  assert.equal(agentFamily('Mozilla/5.0 Chrome/120 Safari/537.36 Edg/120.0'), 'Edge');
  assert.equal(agentFamily('curl/8.4.0'), 'curl');
  assert.equal(agentFamily('python-requests/2.31'), 'python-requests');
  assert.equal(agentFamily('some-unknown-thing/1.0'), 'some-unknown-thing/1.0');
  assert.equal(agentFamily(''), 'unknown');
});

test('isBot spots automation', () => {
  assert.equal(isBot('Mozilla/5.0 (compatible; Googlebot/2.1)'), true);
  assert.equal(isBot('curl/8.4.0'), true);
  assert.equal(isBot('python-requests/2.31'), true);
  assert.equal(isBot('Mozilla/5.0 Chrome/120 Safari/537.36'), false);
});

test('helpers normalise paths, status classes and days', () => {
  assert.equal(stripQuery('/a?b=1'), '/a');
  assert.equal(stripQuery('/a'), '/a');
  assert.equal(stripQuery(''), '/');
  assert.equal(statusClass(503), '5xx');
  assert.equal(isoDay(new Date('2024-03-09T23:00:00Z')), '2024-03-09');
});

test('an empty log produces zeroed stats', () => {
  const stats = computeStats([]);
  assert.equal(stats.total, 0);
  assert.equal(stats.errorRate, 0);
  assert.equal(stats.peakDay, null);
  assert.deepEqual(stats.topPaths, []);
});
