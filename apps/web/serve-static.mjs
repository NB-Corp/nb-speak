#!/usr/bin/env node
import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

export function startDocsStaticServer(port = 0, host = '127.0.0.1') {
  const server = createServer((req, res) => {
    const rawUrl = decodeURIComponent((req.url || '/').split('?', 1)[0] || '/');
    const rel = rawUrl.endsWith('/') ? `${rawUrl}index.html` : rawUrl;
    const candidate = path.resolve(DOCS_ROOT, `.${rel}`);
    if (!candidate.startsWith(DOCS_ROOT) || !fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) {
      const idxFallback = path.join(candidate, 'index.html');
      if (candidate.startsWith(DOCS_ROOT) && fs.existsSync(idxFallback)) {
        res.writeHead(200, { 'content-type': MIME['.html'] });
        res.end(fs.readFileSync(idxFallback));
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(candidate).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(candidate));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        server,
        url: `http://${host}:${actualPort}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] || 4173);
  const srv = await startDocsStaticServer(port);
  console.log(`Serving docs/ at ${srv.url}`);
}
