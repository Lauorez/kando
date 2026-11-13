import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

test('one priority board shows all tasks and supports completion, reprioritization, and filtering', async () => {
  const dom = new JSDOM(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'), { url: 'http://localhost' });
  const { window } = dom;
  const doc = window.document;
  const original = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, FormData: globalThis.FormData };
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  Object.assign(globalThis, { window, document: doc, FormData: window.FormData });
  const make = (id, priority = 'medium', status = 'todo', dueDate = '') => ({ id, title: id, description: '', priority, status, dueDate });
  const tasks = [make('important', 'high'), make('optional', 'low'), make('future', 'medium', 'todo', '2099-01-01'), make('past-done', 'low', 'done', '2000-01-01')];
  globalThis.fetch = async (path, options) => {
    let data;
    if (options.method === 'PATCH') {
      const id = path.split('/').at(-1);
      const task = tasks.find((task) => task.id === id);
      Object.assign(task, JSON.parse(options.body)); data = { ...task };
    } else if (options.method === 'POST') {
      data = { ...make('new-task'), ...JSON.parse(options.body) }; tasks.push(data);
    } else {
      data = tasks.map((task) => ({ ...task }));
    }
    return Response.json(data);
  };
  const change = (element, type = 'change') => element.dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true }));
  const flush = () => new Promise(setImmediate);
  try {
    await import('../public/app.js');
    assert.equal(doc.querySelector('#selected-day'), null);
    assert.equal(doc.querySelector('[name="scheduledFor"]'), null);
    assert.equal(doc.querySelectorAll('.column').length, 3);
    assert.equal(doc.querySelectorAll('.task-card').length, 4);
    assert.equal(doc.querySelector('.column[data-priority="high"] .card-title').textContent, 'important');
    const check = doc.querySelector('[data-id="important"] .complete-task');
    check.click(); await flush();
    assert.equal(tasks[0].status, 'done');
    assert.equal(doc.querySelector('#task-dialog').open, false);
    assert.equal(doc.querySelector('[data-id="important"]').classList.contains('is-done'), true);
    assert.equal(doc.querySelector('#board-progress').value, 2);
    assert.equal(doc.querySelector('#board-progress').max, 4);
    doc.querySelector('#show-completed').click();
    assert.equal(doc.querySelectorAll('.task-card').length, 2);
    const select = doc.querySelector('[data-id="optional"] .priority-select');
    select.value = 'high'; change(select); await flush();
    assert.equal(tasks[1].priority, 'high');
    assert.equal(doc.querySelector('.column[data-priority="high"] .card-title').textContent, 'optional');
    const drag = new window.Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(drag, 'dataTransfer', { value: { setData() {}, effectAllowed: '' } });
    doc.querySelector('[data-id="optional"]').dispatchEvent(drag);
    change(doc.querySelector('.column[data-priority="low"]'), 'drop'); await flush();
    assert.equal(tasks[1].priority, 'low');
    assert.equal(tasks[1].status, 'todo');
    doc.querySelector('.column[data-priority="high"] .add-task').click();
    assert.equal(doc.querySelector('[name="priority"]').value, 'high');
    doc.querySelector('[name="title"]').value = 'One more task';
    change(doc.querySelector('#task-form'), 'submit'); await flush();
    assert.equal(tasks.at(-1).priority, 'high');
    assert.equal(Object.hasOwn(tasks.at(-1), 'scheduledFor'), false);
    assert.equal(doc.querySelectorAll('.task-card').length, 3);
    doc.querySelector('#show-completed').click();
    assert.equal(doc.querySelectorAll('.task-card').length, 5);
    const language = doc.querySelector('#language'); language.value = 'de'; change(language);
    assert.equal(doc.querySelector('#board-title').textContent, 'Meine Aufgaben');
    assert.deepEqual([...doc.querySelectorAll('.column-heading h2')].map((heading) => heading.textContent), ['Hoch', 'Mittel', 'Niedrig']);
    doc.querySelector('#refresh').click(); await flush();
    assert.equal(doc.querySelectorAll('.task-card').length, 5);
    doc.querySelector('#search').value = 'future'; change(doc.querySelector('#search'), 'input');
    assert.equal(doc.querySelectorAll('.task-card').length, 1);
    assert.equal(doc.querySelector('.card-title').textContent, 'future');
  } finally { Object.assign(globalThis, original); dom.window.close(); }
});
