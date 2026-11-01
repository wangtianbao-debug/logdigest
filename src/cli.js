import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { basename, extname, resolve } from 'node:path';
import { parseLog } from './parse.js';
import { computeStats } from './stats.js';
import { renderHtml } from './render.js';

export const VERSION = '0.1.0';

const HELP = `logdigest — turn an access log into one HTML report

  logdigest <file.log>            write <file>.html next to the log
  logdigest <file.log> -o out.html
  cat access.log | logdigest -    read the log from stdin

Options
  -o, --out <path>     output file, or - for stdout
      --top <n>        rows per table (default 10)
      --json           print the computed numbers as JSON instead of HTML
      --title <name>   report title (default: the log file name)
      --since <date>   ignore entries before YYYY-MM-DD (UTC)
      --until <date>   ignore entries after YYYY-MM-DD (UTC)
  -q, --quiet          print nothing on success
  -h, --help           show this help
  -v, --version        print the version

Exit codes
  0  report written
  1  the log could not be read or held no usable entries
  2  bad usage
`;

export function parseArgs(argv) {
  const opts = { file: null, out: null, top: 10, json: false, title: null, since: null, until: null, quiet: false, help: false, version: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      return value;
    };
    switch (arg) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '-v':
      case '--version':
        opts.version = true;
        break;
      case '-q':
      case '--quiet':
        opts.quiet = true;
        break;
      case '--json':
        opts.json = true;
        break;
      case '-o':
      case '--out':
        opts.out = next();
        break;
      case '--top': {
        const raw = next();
        if (!/^\d+$/.test(raw) || Number(raw) < 1) throw new Error('--top expects a positive integer');
        opts.top = Number(raw);
        break;
      }
      case '--title':
        opts.title = next();
        break;
      case '--since':
        opts.since = parseDate(next());
        break;
      case '--until':
        opts.until = new Date(parseDate(next()).getTime() + 86399999);
        break;
      default:
        if (arg.startsWith('-') && arg !== '-') throw new Error(`unknown option ${arg}`);
        rest.push(arg);
    }
  }
  if (rest.length > 1) throw new Error(`expected one log file, got ${rest.length}`);
  opts.file = rest[0] ?? null;
  return opts;
}

function parseDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) throw new Error(`expected a date as YYYY-MM-DD, got "${value}"`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function defaultOut(file) {
  if (!file || file === '-') return 'logdigest.html';
  const name = basename(file).replace(/\.gz$/i, '');
  const base = extname(name) ? name.slice(0, -extname(name).length) : name;
  return `${base}.html`;
}

/** Decode a log buffer, transparently un-gzipping rotated logs. */
export function readLogBuffer(buffer) {
  const isGzip = buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  const text = isGzip ? gunzipSync(buffer).toString('utf8') : buffer.toString('utf8');
  return text.replace(/^\uFEFF/, '');
}

/**
 * @param {string[]} argv
 * @param {{stdout: object, stderr: object}} io
 * @param {{readFile?: (p: string) => Buffer, writeFile?: (p: string, data: string) => void}} [deps]
 */
export function run(argv, io = process, deps = {}) {
  const readFile = deps.readFile ?? ((path) => readFileSync(path));
  const writeFile = deps.writeFile ?? ((path, data) => writeFileSync(path, data, 'utf8'));

  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    io.stderr.write(`logdigest: ${error.message}\n`);
    return 2;
  }
  if (opts.help) {
    io.stdout.write(HELP);
    return 0;
  }
  if (opts.version) {
    io.stdout.write(`${VERSION}\n`);
    return 0;
  }

  let raw;
  try {
    raw = opts.file && opts.file !== '-' ? readFile(opts.file) : readFileSync(0);
  } catch (error) {
    io.stderr.write(`logdigest: cannot read ${opts.file ?? 'stdin'}: ${error.code ?? error.message}\n`);
    return 1;
  }

  const text = readLogBuffer(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)));
  const { entries, skipped: unparsed } = parseLog(text);
  if (!entries.length) {
    io.stderr.write(`logdigest: no access-log entries found in ${opts.file ?? 'stdin'}\n`);
    return 1;
  }

  const filtered = entries.filter((entry) => {
    if (opts.since && entry.time < opts.since) return false;
    if (opts.until && entry.time > opts.until) return false;
    return true;
  });
  if (!filtered.length) {
    io.stderr.write('logdigest: every entry fell outside the requested date range\n');
    return 1;
  }

  const skipped = unparsed + (entries.length - filtered.length);
  const stats = computeStats(filtered, { top: opts.top });
  const name = opts.title ?? (opts.file && opts.file !== '-' ? basename(opts.file).replace(/\.gz$/i, '') : 'access log');

  if (opts.json) {
    const payload = JSON.stringify({ name, skipped, stats: serialize(stats) }, null, 2);
    if (opts.out && opts.out !== '-') writeFile(opts.out, `${payload}\n`);
    else io.stdout.write(`${payload}\n`);
    return 0;
  }

  const html = renderHtml({ name, stats, skipped });
  const out = opts.out ?? defaultOut(opts.file);
  if (out === '-') {
    io.stdout.write(html);
    return 0;
  }
  writeFile(out, html);
  if (!opts.quiet) {
    io.stdout.write(
      `${formatCount(stats.total)} request${stats.total === 1 ? '' : 's'} from ${formatCount(stats.uniqueIps)} address${stats.uniqueIps === 1 ? '' : 'es'} → ${resolve(out)}\n`,
    );
  }
  return 0;
}

function formatCount(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function serialize(stats) {
  return {
    ...stats,
    first: stats.first ? stats.first.toISOString() : null,
    last: stats.last ? stats.last.toISOString() : null,
  };
}
