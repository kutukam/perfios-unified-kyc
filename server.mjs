// Optional local static server. No dependencies, backend, or API endpoints.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const port = Number(process.env.PORT || 3000);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method not allowed');
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400);
    response.end('Invalid URL');
    return;
  }
  const target = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!target.startsWith(resolve(root) + sep)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  try {
    let body = await readFile(target);
    // Flow authoring only. The page's Content-Security-Policy names the managed
    // co-browse service, which is correct everywhere except when a journey is being
    // recorded against a worker running on this machine — there the socket is blocked
    // and assistance silently never starts. COBROWSE_DEV=1 widens connect-src to
    // localhost for THIS local server; the shipped file is never changed.
    if (process.env.COBROWSE_DEV === '1' && extname(target) === '.html') {
      body = Buffer.from(String(body).replace(
        /connect-src ([^;]*);/,
        "connect-src $1 http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*;",
      ));
    }
    response.writeHead(200, {
      'Content-Type': mime[extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404);
    response.end('File not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Unified KYC is ready at http://localhost:${port}`);
});
