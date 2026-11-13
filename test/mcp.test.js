import http from 'node:http';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { start } from '../test-support/server.js';

test('HTTP and stdio MCP share tasks with the app, enforce validation and protect HTTP access', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kando-mcp-'));
  const database = join(dir, 'tasks.sqlite');
  let server;
  const httpClient = new Client({ name: 'kando-test', version: '1.0.0' });
  const stdioClient = new Client({ name: 'kando-stdio-test', version: '1.0.0' });
  try {
    server = await start(database, { MCP_TOKEN: 'integration-test-token' });
    const url = `${server.url}/mcp`;
    assert.equal((await fetch(url, { method: 'POST' })).status, 401);
    assert.equal((await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer wrong' } })).status, 401);
    assert.equal((await fetch(url, { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403);
    const hostileHostStatus = await new Promise((resolve, reject) => {
      const req = http.request(url, { method: 'POST', headers: { Host: 'evil.example' } }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(hostileHostStatus, 403);
    assert.equal((await fetch(url, { headers: { Authorization: 'Bearer integration-test-token' } })).status, 405);
    await httpClient.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: 'Bearer integration-test-token' } } }));
    const { tools } = await httpClient.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ['create_task', 'delete_task', 'get_task', 'list_tasks', 'move_task', 'update_task']);
    assert.equal(tools.find((t) => t.name === 'delete_task').annotations.destructiveHint, true);
    const call = (name, args = {}) => httpClient.callTool({ name, arguments: args });
    assert.equal((await call('create_task', { title: '' })).isError, true);
    assert.equal((await call('create_task', { title: 'Ungültig', dueDate: '2026-02-30' })).isError, true);
    const created = await call('create_task', { title: 'MCP testen', description: 'Gemeinsame Daten', priority: 'high' });
    assert.ok(!created.isError);
    const task = created.structuredContent.task;
    assert.equal(Object.hasOwn(task, 'scheduledFor'), false);
    assert.equal(Object.hasOwn(tools.find((tool) => tool.name === 'list_tasks').inputSchema.properties, 'day'), false);
    assert.equal(Object.hasOwn(tools.find((tool) => tool.name === 'create_task').inputSchema.properties, 'scheduledFor'), false);
    const apiTasks = await (await fetch(`${server.url}/api/tasks`)).json();
    assert.equal(apiTasks[0].id, task.id);
    assert.equal((await call('list_tasks', { query: 'gemeinsame', priority: 'high' })).structuredContent.tasks.length, 1);
    assert.equal((await call('list_tasks', { status: 'done' })).structuredContent.tasks.length, 0);
    const moved = await call('move_task', { id: task.id, priority: 'low' });
    assert.equal(moved.structuredContent.task.priority, 'low');
    assert.equal((await call('list_tasks', { priority: 'low' })).structuredContent.tasks.length, 1);
    assert.equal((await call('move_task', { id: task.id })).isError, true);
    assert.equal((await call('move_task', { id: task.id, status: 'doing' })).structuredContent.task.status, 'doing');
    assert.equal((await call('update_task', { id: task.id, title: 'Geändert', dueDate: '2026-12-01' })).structuredContent.task.title, 'Geändert');
    await stdioClient.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('mcp-stdio.js')], cwd: tmpdir(), env: { ...process.env, DATABASE_PATH: database }, stderr: 'pipe' }));
    const fromStdio = await stdioClient.callTool({ name: 'get_task', arguments: { id: task.id } });
    assert.equal(fromStdio.structuredContent.task.status, 'doing');
    assert.equal(fromStdio.structuredContent.task.title, 'Geändert');
    await stdioClient.callTool({ name: 'move_task', arguments: { id: task.id, status: 'done' } });
    assert.equal((await call('get_task', { id: task.id })).structuredContent.task.status, 'done');
    assert.ok(!(await call('delete_task', { id: task.id })).isError);
    assert.equal((await call('get_task', { id: task.id })).isError, true);
    assert.deepEqual(await (await fetch(`${server.url}/api/tasks`)).json(), []);
  } finally {
    await stdioClient.close();
    await httpClient.close();
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
