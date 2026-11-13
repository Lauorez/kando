import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDay } from './public/dates.js';

export function createStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL, priority TEXT NOT NULL, dueDate TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );`);
  // Explicit projections keep legacy scheduling metadata dormant without changing task data.
  const columns = 'id, title, description, status, priority, dueDate, createdAt, updatedAt';
  return {
    list() {
      return db.prepare(`SELECT ${columns} FROM tasks ORDER BY createdAt DESC, id`).all();
    },
    get(id) {
      const task = db.prepare(`SELECT ${columns} FROM tasks WHERE id = ?`).get(id);
      if (!task) throw Object.assign(Error('Task not found.'), { status: 404, code: 'TASK_NOT_FOUND' });
      return task;
    },
    create(input) {
      const now = new Date().toISOString();
      const task = { id: randomUUID(), ...validate(input), createdAt: now, updatedAt: now };
      db.prepare('INSERT INTO tasks (id, title, description, status, priority, dueDate, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(task.id, task.title, task.description, task.status, task.priority, task.dueDate, task.createdAt, task.updatedAt);
      return task;
    },
    update(id, input) {
      const existing = this.get(id);
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(Error('Invalid task.'), { code: 'TASK_INVALID' });
      const task = { ...existing, ...validate({ ...existing, ...input }), updatedAt: new Date().toISOString() };
      db.prepare('UPDATE tasks SET title=?, description=?, status=?, priority=?, dueDate=?, updatedAt=? WHERE id=?').run(task.title, task.description, task.status, task.priority, task.dueDate, task.updatedAt, task.id);
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
function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(Error('Invalid task.'), { code: 'TASK_INVALID' });
  const { title, description = '', status = 'todo', priority = 'medium', dueDate = '' } = input;
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 160) throw Object.assign(Error('The title must contain between 1 and 160 characters.'), { code: 'TITLE_INVALID' });
  if (typeof description !== 'string' || description.length > 10000) throw Object.assign(Error('The description must not exceed 10,000 characters.'), { code: 'DESCRIPTION_INVALID' });
  if (!statuses.includes(status) || !priorities.includes(priority)) throw Object.assign(Error('Invalid status or priority.'), { code: 'STATUS_INVALID' });
  if (typeof dueDate !== 'string' || (dueDate && !isDay(dueDate))) throw Object.assign(Error('Invalid date.'), { code: 'DATE_INVALID' });
  return { title: title.trim(), description: description.trim(), status, priority, dueDate };
}
