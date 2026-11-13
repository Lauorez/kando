import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

test('daily priority boards support completion, reprioritization, date planning, and filtering', async () => {
  const dom = new JSDOM(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'), { url: 'http://localhost' });
  const { window } = dom;
  const doc = window.document;
  const original = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, FormData: globalThis.FormData };
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  Object.assign(globalThis, { window, document: doc, FormData: window.FormData });
  let date = '2026-11-13';
  const next = '2026-11-14';
  const make = (id, scheduledFor, priority = 'medium', status = 'todo') => ({ id, title: id, description: '', priority, status, dueDate: '', scheduledFor });
  let tasks = [make('today-high', date, 'high'), make('today-low', date, 'low'), make('tomorrow', next), make('past-done', '2026-11-12', 'low', 'done')];
  globalThis.fetch = async (path, options) => {
    let data;
    if (options.method === 'PATCH') {
      const id = path.split('/').at(-1);
      const task = tasks.find((task) => task.id === id);
      Object.assign(task, JSON.parse(options.body)); data = { ...task };
    } else if (options.method === 'POST') {
      data = { ...make('new-task', date), ...JSON.parse(options.body) }; tasks.push(data);
    } else {
      for (const task of tasks) if (task.status !== 'done' && task.scheduledFor < date) task.scheduledFor = date;
      data = tasks.map((task) => ({ ...task }));
    }
    return Response.json(data, { headers: { 'X-KanDo-Today': date } });
  };
  const change = (element, type = 'change') => element.dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true }));
  const flush = () => new Promise(setImmediate);
  try {
    await import('../public/app.js');
    assert.equal(doc.querySelector('#selected-day').value, date);
    assert.equal(doc.querySelectorAll('.column').length, 3);
    assert.equal(doc.querySelectorAll('.task-card').length, 2);
    assert.equal(doc.querySelector('.column[data-priority="high"] .card-title').textContent, 'today-high');
    const check = doc.querySelector('[data-id="today-high"] .complete-task');
    check.click(); await flush();
    assert.equal(tasks[0].status, 'done');
    assert.equal(doc.querySelector('#task-dialog').open, false);
    assert.equal(doc.querySelector('[data-id="today-high"]').classList.contains('is-done'), true);
    assert.equal(doc.querySelector('#daily-progress').value, 1);
    assert.equal(doc.querySelector('#daily-progress').max, 2);
    doc.querySelector('#show-completed').click();
    assert.equal(doc.querySelectorAll('.task-card').length, 1);
    const select = doc.querySelector('[data-id="today-low"] .priority-select');
    select.value = 'high'; change(select); await flush();
    assert.equal(tasks[1].priority, 'high');
    assert.equal(doc.querySelector('.column[data-priority="high"] .card-title').textContent, 'today-low');
    const drag = new window.Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(drag, 'dataTransfer', { value: { setData() {}, effectAllowed: '' } });
    doc.querySelector('[data-id="today-low"]').dispatchEvent(drag);
    change(doc.querySelector('.column[data-priority="low"]'), 'drop'); await flush();
    assert.equal(tasks[1].priority, 'low');
    assert.equal(tasks[1].status, 'todo');
    doc.querySelector('#next-day').click();
    assert.equal(doc.querySelector('#selected-day').value, next);
    assert.equal(doc.querySelectorAll('.task-card').length, 1);
    doc.querySelector('.column[data-priority="high"] .add-task').click();
    assert.equal(doc.querySelector('[name="priority"]').value, 'high');
    assert.equal(doc.querySelector('[name="scheduledFor"]').value, next);
    doc.querySelector('[name="title"]').value = 'Plan tomorrow';
    change(doc.querySelector('#task-form'), 'submit'); await flush();
    assert.equal(tasks.at(-1).scheduledFor, next);
    assert.equal(tasks.at(-1).priority, 'high');
    assert.equal(doc.querySelectorAll('.task-card').length, 2);
    doc.querySelector('#today').click();
    assert.equal(doc.querySelector('#selected-day').value, date);
    assert.equal(doc.querySelectorAll('.task-card').length, 1);
    doc.querySelector('#all-view').click();
    assert.equal(doc.querySelectorAll('.task-card').length, 3);
    assert.equal(doc.querySelector('#day-navigation').hidden, true);
    assert.match(doc.querySelector('.planned-day').textContent, /Planned:/);
    doc.querySelector('#show-completed').click();
    assert.equal(doc.querySelectorAll('.task-card').length, 5);
    const language = doc.querySelector('#language'); language.value = 'de'; change(language);
    assert.equal(doc.querySelector('#board-title').textContent, 'Alle Aufgaben');
    assert.deepEqual([...doc.querySelectorAll('.column-heading h2')].map((heading) => heading.textContent), ['Hoch', 'Mittel', 'Niedrig']);
    doc.querySelector('#daily-view').click();
    assert.equal(doc.querySelector('#board-title').textContent, 'Heute');
    date = next;
    doc.querySelector('#refresh').click(); await flush();
    assert.equal(doc.querySelector('#selected-day').value, next);
    assert.equal(doc.querySelectorAll('.task-card').length, 3);
    doc.querySelector('#previous-day').click();
    assert.equal(doc.querySelectorAll('.task-card').length, 1);
    assert.equal(doc.querySelector('.card-title').textContent, 'today-high');
  } finally { Object.assign(globalThis, original); dom.window.close(); }
});
