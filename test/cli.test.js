import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { parseArgs, run, readLogBuffer } from '../src/cli.js';

const LOG = [
  '10.0.0.1 - - [10/Oct/2024:10:00:00 +0000] "GET / HTTP/1.1" 200 1024 "-" "curl/8.4.0"',
  '10.0.0.2 - - [11/Oct/2024:11:00:00 +0000] "GET /a HTTP/1.1" 404 64 "-" "curl/8.4.0"',
  '',
  'not a log line',
].join('\n');

function io() {
  const out = [];
  const err = [];
  return {
    stdout: { write: (chunk) => out.push(chunk), isTTY: false },
    stderr: { write: (chunk) => err.push(chunk) },
    out: () => out.join(''),
    err: () => err.join(''),
  };
}

function deps(text, files = {}) {
  const written = [];
  return {
    written,
    readFile: (path) => {
      if (path in files) return Buffer.from(files[path]);
      return Buffer.from(text);
    },
    writeFile: (path, data) => written.push({ path, data }),
  };
}

test('parseArgs accepts the common shapes', () => {
  assert.deepEqual(parseArgs(['access.log']).file, 'access.log');
  const opts = parseArgs(['access.log', '-o', 'out.html', '--top', '5', '--json', '--title', 'site', '-q']);
  assert.equal(opts.out, 'out.html');
  assert.equal(opts.top, 5);
  assert.equal(opts.json, true);
  assert.equal(opts.title, 'site');
  assert.equal(opts.quiet, true);
});

test('parseArgs rejects bad usage', () => {
  assert.throws(() => parseArgs(['--top', '0']), /positive integer/);
  assert.throws(() => parseArgs(['--top']), /needs a value/);
  assert.throws(() => parseArgs(['--nope']), /unknown option/);
  assert.throws(() => parseArgs(['a.log', 'b.log']), /one log file/);
  assert.throws(() => parseArgs(['--since', '10/10/2024']), /YYYY-MM-DD/);
});

test('--version and --help exit 0', () => {
  const a = io();
  assert.equal(run(['--version'], a), 0);
  assert.match(a.out(), /^0\.1\.0\n$/);

  const b = io();
  assert.equal(run(['--help'], b), 0);
  assert.match(b.out(), /logdigest — turn an access log/);
});

test('writes a report next to the log by default', () => {
  const stream = io();
  const store = deps(LOG);
  assert.equal(run(['access.log'], stream, store), 0);
  assert.equal(store.written.length, 1);
  assert.equal(store.written[0].path, 'access.html');
  assert.match(store.written[0].data, /^<!doctype html>/);
  assert.match(store.written[0].data, /2 requests/);
  assert.match(stream.out(), /2 requests from 2 addresses/);
  assert.match(stream.out(), /access\.html/);
});

test('-o writes where it is told, and -q stays silent', () => {
  const stream = io();
  const store = deps(LOG);
  assert.equal(run(['access.log', '-o', 'report.html', '-q'], stream, store), 0);
  assert.equal(store.written[0].path, 'report.html');
  assert.equal(stream.out(), '');
});

test('-o - streams the html to stdout', () => {
  const stream = io();
  const store = deps(LOG);
  assert.equal(run(['access.log', '-o', '-'], stream, store), 0);
  assert.equal(store.written.length, 0);
  assert.match(stream.out(), /^<!doctype html>/);
});

test('--json prints machine-readable numbers', () => {
  const stream = io();
  const store = deps(LOG);
  assert.equal(run(['access.log', '--json'], stream, store), 0);
  const payload = JSON.parse(stream.out());
  assert.equal(payload.stats.total, 2);
  assert.equal(payload.stats.uniqueIps, 2);
  assert.equal(payload.stats.byDay[0].date, '2024-10-10');
  assert.equal(payload.skipped, 1);
  assert.match(payload.stats.first, /^2024-10-10T10:00:00\.000Z$/);
});

test('--since and --until narrow the window', () => {
  const stream = io();
  const store = deps(LOG);
  assert.equal(run(['access.log', '--json', '--since', '2024-10-10', '--until', '2024-10-10'], stream, store), 0);
  assert.equal(JSON.parse(stream.out()).stats.total, 1);

  const none = io();
  assert.equal(run(['access.log', '--since', '2025-01-01'], none, deps(LOG)), 1);
  assert.match(none.err(), /outside the requested date range/);
});

test('a missing file exits 1', () => {
  const stream = io();
  assert.equal(
    run(['nope.log'], stream, {
      readFile: () => {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      },
      writeFile: () => {},
    }),
    1,
  );
  assert.match(stream.err(), /cannot read nope\.log: ENOENT/);
});

test('a log with no entries exits 1', () => {
  const stream = io();
  const store = deps('garbage\nmore garbage\n');
  assert.equal(run(['access.log'], stream, store), 1);
  assert.match(stream.err(), /no access-log entries found/);
});

test('gzipped logs are decompressed automatically', () => {
  const gz = gzipSync(Buffer.from(LOG));
  const store = deps('', { 'access.log.gz': gz });
  const stream = io();
  assert.equal(run(['access.log.gz', '-o', '-'], stream, store), 0);
  assert.match(stream.out(), /2 requests/);
});

test('readLogBuffer strips a BOM and passes plain text through', () => {
  assert.equal(readLogBuffer(Buffer.from('\uFEFFhello')), 'hello');
  assert.equal(readLogBuffer(gzipSync(Buffer.from('hi'))), 'hi');
});

test('--title renames the report', () => {
  const stream = io();
  const store = deps(LOG);
  run(['access.log', '--title', 'shop.example.com', '-o', '-'], stream, store);
  assert.match(stream.out(), /<h1>shop\.example\.com<\/h1>/);
});
