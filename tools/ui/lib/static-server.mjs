// Tiny static file server for the UI runners. `mounts` maps URL prefixes to
// directories; the longest matching prefix wins.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

export async function startServer(mounts) {
  const entries = Object.entries(mounts)
    .map(([prefix, dir]) => [prefix.endsWith('/') ? prefix : `${prefix}/`, path.resolve(dir)])
    .sort((a, b) => b[0].length - a[0].length);

  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const mount = entries.find(([prefix]) => urlPath.startsWith(prefix));
    const file = mount && path.join(mount[1], urlPath.slice(mount[0].length));
    if (!file?.startsWith(mount[1])) {
      res.writeHead(404);
      res.end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });

  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  return { base, close: () => new Promise(resolve => server.close(resolve)) };
}
