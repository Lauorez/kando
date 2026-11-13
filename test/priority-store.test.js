import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../store.js';
import { isDay, localDay } from '../public/dates.js';

test('single-board tasks persist regardless of deadlines and completion status', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kando-priority-'));
  const path = join(dir, 'tasks.sqlite');
  let store = createStore(path);
  try {
    const past = store.create({ title: 'Past deadline', priority: 'high', dueDate: '2000-01-01' });
    const future = store.create({ title: 'Future deadline', dueDate: '2099-01-01' });
    const done = store.create({ title: 'Finished', status: 'done' });
    const noDate = store.create({ title: 'No deadline' });
    assert.equal(store.list().length, 4);
    assert.equal(store.get(past.id).updatedAt, past.updatedAt);
    assert.equal(Object.hasOwn(past, 'scheduledFor'), false);
    assert.equal(noDate.dueDate, '');
    assert.equal(store.update(done.id, { status: 'todo' }).status, 'todo');
    assert.equal(store.update(future.id, { priority: 'low' }).dueDate, '2099-01-01');
    store.close(); store = createStore(path);
    assert.equal(store.list().length, 4);
    assert.equal(store.get(past.id).dueDate, '2000-01-01');
    assert.equal(store.get(past.id).updatedAt, past.updatedAt);
    assert.throws(() => store.create({ title: 'Bad deadline', dueDate: '2026-02-30' }), { code: 'DATE_INVALID' });
  } finally { store.close(); await rm(dir, { recursive: true, force: true }); }
});

test('original and daily-planner databases expose every task without modifying stored data', async () => {
  for (const scheduled of [false, true]) {
    const dir = await mkdtemp(join(tmpdir(), 'kando-legacy-'));
    const path = join(dir, 'tasks.sqlite');
    const old = new DatabaseSync(path);
    old.exec("CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, description TEXT, status TEXT, priority TEXT, dueDate TEXT, createdAt TEXT, updatedAt TEXT)");
    if (scheduled) old.exec("ALTER TABLE tasks ADD COLUMN scheduledFor TEXT NOT NULL DEFAULT ''");
    const insert = old.prepare('INSERT INTO tasks (id, title, description, status, priority, dueDate, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    insert.run('past', 'Keep past task', 'Original description', 'todo', 'high', '2000-01-01', 'original', 'original');
    insert.run('future', 'Keep future task', '', 'todo', 'medium', '2099-01-01', 'original', 'original');
    insert.run('done', 'Keep finished task', '', 'done', 'low', '', 'original', 'original');
    if (scheduled) {
      old.prepare('UPDATE tasks SET scheduledFor = ? WHERE id = ?').run('2000-01-01', 'past');
      old.prepare('UPDATE tasks SET scheduledFor = ? WHERE id = ?').run('2099-01-01', 'future');
    }
    const before = old.prepare('SELECT * FROM tasks ORDER BY id').all();
    old.close();
    const store = createStore(path);
    try {
      assert.equal(store.list().length, 3);
      assert.equal(store.get('past').description, 'Original description');
      assert.equal(store.get('past').updatedAt, 'original');
      assert.equal(Object.hasOwn(store.get('future'), 'scheduledFor'), false);
      const raw = new DatabaseSync(path);
      assert.deepEqual(raw.prepare('SELECT * FROM tasks ORDER BY id').all(), before);
      store.update('past', { priority: 'low' });
      if (scheduled) assert.equal(raw.prepare('SELECT scheduledFor FROM tasks WHERE id = ?').get('past').scheduledFor, '2000-01-01');
      raw.close();
      assert.ok(store.create({ title: 'New task after upgrade' }).id);
    } finally { store.close(); await rm(dir, { recursive: true, force: true }); }
  }
});

test('optional deadlines validate real calendar dates', () => {
  assert.equal(isDay('2028-02-29'), true);
  assert.equal(isDay('2026-02-29'), false);
  assert.equal(isDay('2026-02-30'), false);
  assert.equal(localDay(new Date(2026, 10, 13, 23, 59)), '2026-11-13');
});
