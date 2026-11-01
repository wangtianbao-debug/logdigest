import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLogTime, parseRequest, parseLine, parseLog } from '../src/parse.js';

const COMBINED =
  '203.0.113.7 - frank [10/Oct/2024:13:55:36 +0000] "GET /index.html HTTP/1.1" 200 2326 "https://example.com/start" "Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0 Safari/537.36"';

test('parseLogTime reads the CLF stamp in UTC', () => {
  const date = parseLogTime('10/Oct/2024:13:55:36 +0000');
  assert.equal(date.toISOString(), '2024-10-10T13:55:36.000Z');
});

test('parseLogTime applies the offset', () => {
  assert.equal(parseLogTime('01/Jan/2020:00:30:00 +0200').toISOString(), '2019-12-31T22:30:00.000Z');
  assert.equal(parseLogTime('01/Jan/2020:23:30:00 -0500').toISOString(), '2020-01-02T04:30:00.000Z');
});

test('parseLogTime rejects noise', () => {
  assert.equal(parseLogTime('not a date'), null);
  assert.equal(parseLogTime('10/Xxx/2024:13:55:36 +0000'), null);
});

test('parseRequest splits the request line', () => {
  assert.deepEqual(parseRequest('GET /a/b?c=1 HTTP/1.1'), { method: 'GET', path: '/a/b?c=1', protocol: 'HTTP/1.1' });
  assert.deepEqual(parseRequest('get / HTTP/2.0'), { method: 'GET', path: '/', protocol: 'HTTP/2.0' });
  assert.deepEqual(parseRequest('OPTIONS *'), { method: 'OPTIONS', path: '*', protocol: '' });
  assert.equal(parseRequest('   '), null);
});

test('parseLine handles the combined format', () => {
  const entry = parseLine(COMBINED);
  assert.equal(entry.ip, '203.0.113.7');
  assert.equal(entry.user, 'frank');
  assert.equal(entry.method, 'GET');
  assert.equal(entry.path, '/index.html');
  assert.equal(entry.status, 200);
  assert.equal(entry.bytes, 2326);
  assert.equal(entry.referer, 'https://example.com/start');
  assert.match(entry.agent, /Chrome\/120/);
  assert.equal(entry.time.toISOString(), '2024-10-10T13:55:36.000Z');
});

test('parseLine handles the common format', () => {
  const entry = parseLine('198.51.100.2 - - [10/Oct/2024:00:00:01 -0700] "POST /api/items HTTP/1.1" 201 512');
  assert.equal(entry.referer, '');
  assert.equal(entry.agent, '');
  assert.equal(entry.status, 201);
  assert.equal(entry.bytes, 512);
});

test('parseLine tolerates extra trailing fields and dash bytes', () => {
  const line = `${COMBINED} 0.042 10.0.0.9:8080`;
  const entry = parseLine(line);
  assert.equal(entry.bytes, 2326);

  const dash = parseLine('198.51.100.2 - - [10/Oct/2024:00:00:01 +0000] "GET /health HTTP/1.1" 204 -');
  assert.equal(dash.bytes, 0);
});

test('parseLine lowercases the method and keeps IPv6 addresses', () => {
  const entry = parseLine('2001:db8::1 - - [10/Oct/2024:00:00:01 +0000] "get /x HTTP/1.1" 304 0');
  assert.equal(entry.ip, '2001:db8::1');
  assert.equal(entry.method, 'GET');
});

test('parseLine returns null for non-access-log lines', () => {
  assert.equal(parseLine(''), null);
  assert.equal(parseLine('# comment'), null);
  assert.equal(parseLine('198.51.100.2 - - [nonsense] "GET / HTTP/1.1" 200 1'), null);
});

test('parseLog counts skipped lines and keeps order', () => {
  const text = [COMBINED, 'garbage line', '', COMBINED].join('\n');
  const { entries, skipped } = parseLog(text);
  assert.equal(entries.length, 2);
  assert.equal(skipped, 1);
  assert.equal(entries[0].ip, '203.0.113.7');
});
