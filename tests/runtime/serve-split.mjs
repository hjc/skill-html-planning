// Serves a directory over HTTP. For the one page named on the command line,
// the response is flushed in two chunks split just past the start tag of the
// first <plan-diagram>, with a pause between them, so plan-runtime.js loads
// and registers while the parser is still inside that element. This is what
// reproduces the parse race; a file:// load never does.
//
//   node serve-split.mjs <root> <page-relative-to-root> [port] [delayMs] [ttlSeconds]
//
// Port 0 picks a free port. Prints the page URL once listening. Exits by
// itself after ttlSeconds (default 120), so nothing is left running.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const [root, page, port = '8765', delay = '800', ttl = '120'] = process.argv.slice(2);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

const server = createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  const file = join(root, rel);
  if (rel.includes('..') || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  const body = readFileSync(file, 'utf8');
  if (rel !== page) { res.end(body); return; }
  const cut = body.indexOf('>', body.indexOf('<plan-diagram')) + 1;
  res.write(body.slice(0, cut));
  setTimeout(() => res.end(body.slice(cut)), Number(delay));
});
server.listen(Number(port), () => console.log(`http://localhost:${server.address().port}/${page}`));
setTimeout(() => process.exit(0), Number(ttl) * 1000);
