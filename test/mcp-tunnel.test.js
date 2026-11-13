import http from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { start } from '../test-support/server.js';

test('MCP handshake and tool calls work through a tunnel with public or rewritten Host', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kando-tunnel-'));
  let server;
  let proxy;
  const clients = [];
  try {
    server = await start(join(dir, 'tasks.sqlite'), { MCP_PUBLIC_URL: 'https://kando.example.org/mcp', MCP_TOKEN: 'tunnel-test-token' });
    let upstreamHost = 'kando.example.org';
    // Simulates the HTTP hop after TLS termination by a tunnel/proxy.
    proxy = http.createServer((req, res) => {
      const upstream = http.request(new URL(req.url, server.url), { method: req.method, headers: { ...req.headers, host: upstreamHost } }, (response) => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      });
      upstream.on('error', () => { res.writeHead(502); res.end(); });
      req.pipe(upstream);
    });
    proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
    const url = `http://127.0.0.1:${proxy.address().port}/mcp`;
    for (const host of ['kando.example.org', '127.0.0.1:3000']) {
      upstreamHost = host;
      const client = new Client({ name: 'tunnel-test', version: '1.0.0' });
      clients.push(client);
      await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: 'Bearer tunnel-test-token', Origin: 'https://kando.example.org' } } }));
      assert.equal((await client.listTools()).tools.length, 6);
      const created = await client.callTool({ name: 'create_task', arguments: { title: `Tunnel: ${host}` } });
      assert.ok(!created.isError);
      const tasks = await (await fetch(`${server.url}/api/tasks`)).json();
      assert.ok(tasks.some((task) => task.id === created.structuredContent.task.id));
      await client.close();
    }
    assert.equal((await fetch(url, { method: 'POST' })).status, 401);
    assert.equal((await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer tunnel-test-token', Origin: 'https://evil.example' } })).status, 403);
  } finally {
    for (const client of clients) await client.close();
    if (proxy) { proxy.closeAllConnections(); await new Promise((resolve) => proxy.close(resolve)); }
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
