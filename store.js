import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDay, localDay } from './public/dates.js';

export function createStore(dbPath, { today = localDay } = {}) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL, priority TEXT NOT NULL, dueDate TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, scheduledFor TEXT NOT NULL DEFAULT ''
    );`);
  // Serialize the migration when the web server and stdio clients start together.
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!db.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'scheduledFor')) {
      db.exec("ALTER TABLE tasks ADD COLUMN scheduledFor TEXT NOT NULL DEFAULT ''");
    }
    db.prepare("UPDATE tasks SET scheduledFor = CASE WHEN dueDate != '' THEN dueDate ELSE ? END WHERE scheduledFor = ''").run(today());
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK'); db.close(); throw error;
  }

  function rollover() {
    const day = today();
    db.prepare("UPDATE tasks SET scheduledFor = ?, updatedAt = ? WHERE scheduledFor < ? AND status != 'done'").run(day, new Date().toISOString(), day);
  }
  function normalize(input) {
    const day = today();
    const task = validate(input, day);
    if (task.status !== 'done' && task.scheduledFor < day) task.scheduledFor = day;
    return task;
  }
  return {
    list() {
      rollover();
      return db.prepare('SELECT * FROM tasks ORDER BY createdAt DESC, id').all();
    },
    get(id) {
      rollover();
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      if (!task) throw Object.assign(Error('Task not found.'), { status: 404, code: 'TASK_NOT_FOUND' });
      return task;
    },
    create(input) {
      const now = new Date().toISOString();
      const task = { id: randomUUID(), ...normalize(input), createdAt: now, updatedAt: now };
      db.prepare('INSERT INTO tasks (id, title, description, status, priority, dueDate, createdAt, updatedAt, scheduledFor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(task.id, task.title, task.description, task.status, task.priority, task.dueDate, task.createdAt, task.updatedAt, task.scheduledFor);
      return task;
    },
    update(id, input) {
      const existing = this.get(id);
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(Error('Invalid task.'), { code: 'TASK_INVALID' });
      const task = { ...existing, ...normalize({ ...existing, ...input }), updatedAt: new Date().toISOString() };
      db.prepare('UPDATE tasks SET title=?, description=?, status=?, priority=?, dueDate=?, updatedAt=?, scheduledFor=? WHERE id=?').run(task.title, task.description, task.status, task.priority, task.dueDate, task.updatedAt, task.scheduledFor, task.id);
      return task;
    },
    delete(id) {
      this.get(id);
      db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
      return { ok: true };
    },
    close() { db.close(); },
  };
}

const statuses = ['backlog', 'todo', 'doing', 'done'];
const priorities = ['low', 'medium', 'high'];
function validate(input, today) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(Error('Invalid task.'), { code: 'TASK_INVALID' });
  const { title, description = '', status = 'todo', priority = 'medium', dueDate = '', scheduledFor = today } = input;
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 160) throw Object.assign(Error('The title must contain between 1 and 160 characters.'), { code: 'TITLE_INVALID' });
  if (typeof description !== 'string' || description.length > 10000) throw Object.assign(Error('The description must not exceed 10,000 characters.'), { code: 'DESCRIPTION_INVALID' });
  if (!statuses.includes(status) || !priorities.includes(priority)) throw Object.assign(Error('Invalid status or priority.'), { code: 'STATUS_INVALID' });
  if (typeof dueDate !== 'string' || (dueDate && !isDay(dueDate))) throw Object.assign(Error('Invalid date.'), { code: 'DATE_INVALID' });
  if (!isDay(scheduledFor)) throw Object.assign(Error('Choose a valid day for this task.'), { code: 'DAY_INVALID' });
  return { title: title.trim(), description: description.trim(), status, priority, dueDate, scheduledFor };
}
