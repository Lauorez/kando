import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../store.js';
import { isDay, localDay, shiftDay } from '../public/dates.js';

test('unfinished daily tasks carry forward while completed and future tasks stay on their day', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kando-daily-'));
  let day = '2026-11-13';
  let store = createStore(join(dir, 'tasks.sqlite'), { today: () => day });
  try {
    const open = store.create({ title: 'Open', priority: 'high', dueDate: '2026-11-12' });
    const doing = store.create({ title: 'In progress', status: 'doing' });
    const done = store.create({ title: 'Finished', status: 'done' });
    const future = store.create({ title: 'Future', scheduledFor: '2026-11-20' });
    assert.equal(open.scheduledFor, day);
    day = '2026-11-16';
    const moved = store.list().find((task) => task.id === open.id);
    assert.equal(moved.scheduledFor, day);
    assert.equal(moved.priority, 'high');
    assert.equal(moved.dueDate, '2026-11-12');
    assert.equal(store.get(doing.id).scheduledFor, day);
    assert.equal(store.get(done.id).scheduledFor, '2026-11-13');
    assert.equal(store.get(future.id).scheduledFor, '2026-11-20');
    const timestamp = moved.updatedAt;
    assert.equal(store.get(open.id).updatedAt, timestamp); // No repeated rollover writes.
    store.update(open.id, { status: 'done' });
    day = '2026-11-17';
    assert.equal(store.get(open.id).scheduledFor, '2026-11-16');
    assert.equal(store.update(done.id, { status: 'todo' }).scheduledFor, day);
    assert.equal(store.create({ title: 'Past unfinished', scheduledFor: '2026-11-01' }).scheduledFor, day);
    assert.equal(store.create({ title: 'Past completed', status: 'done', scheduledFor: '2026-11-01' }).scheduledFor, '2026-11-01');
    assert.throws(() => store.create({ title: 'Bad day', scheduledFor: '2026-02-30' }), { code: 'DAY_INVALID' });
    assert.throws(() => store.update(future.id, { scheduledFor: '' }), { code: 'DAY_INVALID' });
    store.close();
    store = createStore(join(dir, 'tasks.sqlite'), { today: () => day });
    assert.equal(store.get(open.id).status, 'done');
    assert.equal(store.get(open.id).scheduledFor, '2026-11-16');
  } finally { store.close(); await rm(dir, { recursive: true, force: true }); }
});

test('upgrading the original database preserves tasks and deadlines and migrates only once', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kando-migration-'));
  const path = join(dir, 'tasks.sqlite');
  const old = new DatabaseSync(path);
  old.exec("CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, description TEXT, status TEXT, priority TEXT, dueDate TEXT, createdAt TEXT, updatedAt TEXT)");
  const insert = old.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  insert.run('old-open', 'Original task', 'Keep this', 'todo', 'high', '2026-11-10', 'original', 'original');
  insert.run('old-done', 'Finished task', '', 'done', 'low', '2026-11-09', 'original', 'original');
  insert.run('old-unscheduled', 'Unscheduled', '', 'backlog', 'medium', '', 'original', 'original');
  old.close();
  let store = createStore(path, { today: () => '2026-11-13' });
  try {
    assert.equal(store.list().length, 3);
    const open = store.get('old-open');
    assert.equal(open.scheduledFor, '2026-11-13');
    assert.equal(open.dueDate, '2026-11-10');
    assert.equal(open.description, 'Keep this');
    assert.equal(store.get('old-done').scheduledFor, '2026-11-09');
    assert.equal(store.get('old-done').updatedAt, 'original');
    assert.equal(store.get('old-unscheduled').scheduledFor, '2026-11-13');
    store.update('old-open', { scheduledFor: '2026-11-22' });
    store.close(); store = createStore(path, { today: () => '2026-11-14' });
    assert.equal(store.get('old-open').scheduledFor, '2026-11-22');
    assert.equal(store.get('old-done').scheduledFor, '2026-11-09');
  } finally { store.close(); await rm(dir, { recursive: true, force: true }); }
});

test('calendar navigation handles month boundaries and leap days', () => {
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDay('2028-02-28', 1), '2028-02-29');
  assert.equal(shiftDay('2028-03-01', -1), '2028-02-29');
  assert.equal(shiftDay('0001-01-01', -1), '0001-01-01');
  assert.equal(isDay('2026-02-30'), false);
  assert.equal(localDay(new Date(2026, 10, 13, 23, 59)), '2026-11-13');
});
