import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

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
  return {
    list() { return db.prepare('SELECT * FROM tasks ORDER BY createdAt DESC, id').all(); },
    get(id) {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      if (!task) throw Object.assign(Error('Aufgabe nicht gefunden.'), { status: 404 });
      return task;
    },
    create(input) {
      const now = new Date().toISOString();
      const task = { id: randomUUID(), ...validate(input), createdAt: now, updatedAt: now };
      db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(task.id, task.title, task.description, task.status, task.priority, task.dueDate, task.createdAt, task.updatedAt);
      return task;
    },
    update(id, input) {
      const existing = this.get(id);
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Ungültige Aufgabe.');
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
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Ungültige Aufgabe.');
  const { title, description = '', status = 'todo', priority = 'medium', dueDate = '' } = input;
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 160) throw Error('Der Titel muss zwischen 1 und 160 Zeichen lang sein.');
  if (typeof description !== 'string' || description.length > 10000) throw Error('Die Beschreibung darf höchstens 10.000 Zeichen lang sein.');
  if (!statuses.includes(status) || !priorities.includes(priority)) throw Error('Ungültiger Status oder ungültige Priorität.');
  if (typeof dueDate !== 'string' || (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0, 10) !== dueDate))) throw Error('Ungültiges Datum.');
  return { title: title.trim(), description: description.trim(), status, priority, dueDate };
}
