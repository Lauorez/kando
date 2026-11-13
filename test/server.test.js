import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { start } from '../test-support/server.js';

test('task lifecycle, validation, isolation and persistence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kando-test-'));
  let server;
  try {
    server = await start(join(dir, 'tasks.sqlite'));
    const request = (path = '/api/tasks', method = 'GET', body, headers = {}) => fetch(server.url + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.deepEqual(await (await request()).json(), []);
    const page = await request('/');
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Kanban board/);
    assert.match(html, /<html lang="en">/);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal((await request('/style.css')).status, 200);
    assert.equal((await request('/app.js')).status, 200);
    assert.equal((await request('/i18n.js')).status, 200);
    const invalidTitle = await (await request('/api/tasks', 'POST', { title: '' })).json();
    assert.equal(invalidTitle.code, 'TITLE_INVALID');
    assert.match(invalidTitle.error, /title must contain/);
    assert.equal((await request('/api/tasks', 'POST', { title: 'Abgewiesen' }, { Origin: 'https://example.com' })).status, 403);
    for (const invalid of [{ title: '' }, { title: 'x', status: 'unknown' }, { title: 'x', priority: 'urgent' }, { title: 'x', dueDate: '2026-02-30' }, { title: 'x', description: 'x'.repeat(10001) }, null, []]) {
      assert.equal((await request('/api/tasks', 'POST', invalid)).status, 400);
    }
    const create = await request('/api/tasks', 'POST', { title: '  KanDo testen  ', description: '<script>alert(1)</script>', dueDate: '2026-12-01' });
    assert.equal(create.status, 201);
    const task = await create.json();
    assert.equal(task.title, 'KanDo testen');
    assert.equal(task.status, 'todo');
    assert.equal(task.priority, 'medium');
    const updated = await (await request(`/api/tasks/${task.id}`, 'PATCH', { status: 'doing', priority: 'high', id: 'tampered' })).json();
    assert.equal(updated.id, task.id);
    assert.equal(updated.status, 'doing');
    assert.equal(updated.title, task.title);
    assert.equal((await request(`/api/tasks/${task.id}`, 'PATCH', null)).status, 400);
    await server.stop(); server = null;
    server = await start(join(dir, 'tasks.sqlite'));
    const persisted = await (await request()).json();
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].status, 'doing');
    assert.equal(persisted[0].priority, 'high');
    assert.equal((await request(`/api/tasks/${task.id}`, 'DELETE')).status, 200);
    assert.deepEqual(await (await request()).json(), []);
    assert.equal((await request(`/api/tasks/${task.id}`, 'DELETE')).status, 404);
    assert.equal((await request('/server.js')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
