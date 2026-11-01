/**
 * Parsers for web-server access logs.
 *
 * Handles the two formats almost every server emits:
 *
 *   combined: 127.0.0.1 - - [10/Oct/2024:13:55:36 +0000] "GET /a HTTP/1.1" 200 2326 "-" "curl/8.4"
 *   common:   127.0.0.1 - - [10/Oct/2024:13:55:36 +0000] "GET /a HTTP/1.1" 200 2326
 *
 * Extra trailing fields (nginx `$request_time`, `$upstream_addr`, …) are
 * ignored, and a `-` byte count becomes 0.
 */

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

const LINE = /^(\S+) (\S+) (\S+) \[([^\]]+)\] "([^"]*)" (\d{3}) (\S+)(?: "([^"]*)" "([^"]*)")?/;

/** `10/Oct/2024:13:55:36 +0000` → Date (UTC). Returns null when malformed. */
export function parseLogTime(value) {
  const m = /^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/.exec(String(value));
  if (!m) return null;
  const month = MONTHS[m[2]];
  if (month === undefined) return null;
  const [, dd, , yyyy, hh, mm, ss, sign, oh, om] = m;
  const offset = (sign === '-' ? -1 : 1) * (Number(oh) * 60 + Number(om));
  const utc = Date.UTC(Number(yyyy), month, Number(dd), Number(hh), Number(mm), Number(ss)) - offset * 60000;
  return new Date(utc);
}

/** Split `GET /path?x=1 HTTP/1.1` into its parts. */
export function parseRequest(value) {
  const text = String(value).trim();
  if (!text) return null;
  const parts = text.split(/\s+/);
  if (parts.length === 1) return { method: parts[0].toUpperCase(), path: '', protocol: '' };
  const [method, path, protocol] = parts;
  return { method: method.toUpperCase(), path, protocol: protocol ?? '' };
}

export function parseLine(line) {
  const m = LINE.exec(String(line).trim());
  if (!m) return null;

  const [, ip, ident, user, time, request, status, bytes, referer, agent] = m;
  const when = parseLogTime(time);
  if (!when) return null;
  const req = parseRequest(request);
  if (!req) return null;

  const size = /^\d+$/.test(bytes) ? Number(bytes) : 0;
  return {
    ip,
    ident: ident === '-' ? '' : ident,
    user: user === '-' ? '' : user,
    time: when,
    method: req.method,
    path: req.path,
    protocol: req.protocol,
    status: Number(status),
    bytes: size,
    referer: referer && referer !== '-' ? referer : '',
    agent: agent && agent !== '-' ? agent : '',
  };
}

/** Parse a whole log body, skipping lines that are not access-log entries. */
export function parseLog(text) {
  const entries = [];
  let skipped = 0;
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const entry = parseLine(line);
    if (entry) entries.push(entry);
    else skipped++;
  }
  return { entries, skipped };
}
