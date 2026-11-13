import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { handleMcp } from './mcp.js';
import { createMcpAccess } from './mcp-access.js';

const root = dirname(fileURLToPath(import.meta.url));
const mcpAccess = createMcpAccess();
const store = createStore(process.env.DATABASE_PATH || resolve(root, 'data/kando.sqlite'));
async function body(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > 32768) throw Object.assign(Error('The request is too large.'), { code: 'BODY_TOO_LARGE' });
  }
  try { return JSON.parse(text); } catch { throw Object.assign(Error('Invalid JSON request.'), { code: 'JSON_INVALID' }); }
}
const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/i18n.js': ['i18n.js', 'text/javascript'], '/dates.js': ['dates.js', 'text/javascript'], '/theme.js': ['theme.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/icon.svg': ['../assets/icon.svg', 'image/svg+xml'] };
const server = http.createServer(async (req, res) => {
  const send = (code, value) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
  };
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/mcp') return await handleMcp(req, res, store, mcpAccess);
    if (path.startsWith('/api/')) {
      if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return send(403, { error: 'Requests from another origin are not allowed.', code: 'ORIGIN_INVALID' });
      if (path === '/api/tasks' && req.method === 'GET') return send(200, store.list());
      if (path === '/api/tasks' && req.method === 'POST') return send(201, store.create(await body(req)));
      const match = path.match(/^\/api\/tasks\/([a-f0-9-]+)$/);
      if (match && req.method === 'PATCH') return send(200, store.update(match[1], await body(req)));
      if (match && req.method === 'DELETE') return send(200, store.delete(match[1]));
      return send(404, { error: 'Endpoint not found.' });
    }
    if (!files[path] || !['GET', 'HEAD'].includes(req.method)) return send(404, { error: 'Page not found.' });
    const [file, type] = files[path];
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : readFileSync(resolve(root, 'public', file)));
  } catch (error) {
    if (error.code?.startsWith('ERR_SQLITE') || error.code === 'ENOENT') { console.error(error); return send(500, { error: 'Internal server error.', code: 'INTERNAL_ERROR' }); }
    send(error.status || 400, { error: error.message || 'Invalid request.', code: error.code || 'TASK_INVALID' });
  }
});
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => console.log(`KanDo is running at http://${process.env.HOST || '127.0.0.1'}:${server.address().port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
