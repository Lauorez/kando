import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createI18n, messages, translatePage } from '../public/i18n.js';
import { localDay } from '../public/dates.js';

function storage(initial) {
  const values = new Map(initial ? [['kando-language', initial]] : []);
  return { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
}

test('English is the default; German is explicit, persistent, and safe without local storage', () => {
  assert.equal(createI18n(storage()).language, 'en');
  assert.equal(createI18n(storage('fr')).language, 'en');
  const saved = storage();
  const i18n = createI18n(saved);
  i18n.setLanguage('de');
  assert.equal(i18n.locale, 'de-DE');
  assert.equal(createI18n(saved).language, 'de');
  assert.equal(i18n.t('summary', { count: 3, done: 1 }), '3 Aufgaben · 1 erledigt');
  i18n.setLanguage('en');
  assert.equal(i18n.t('summaryOne', { done: 0 }), '1 task · 0 done');
  assert.equal(createI18n(saved).language, 'en');
  const unavailable = createI18n({ getItem() { throw Error(); }, setItem() { throw Error(); } });
  unavailable.setLanguage('de');
  assert.equal(unavailable.language, 'de');
  assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages.de).sort());
});

test('static UI translations include labels and metadata without changing form values', () => {
  const dom = new JSDOM(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'));
  const doc = dom.window.document;
  const i18n = createI18n();
  const title = doc.querySelector('[name="title"]');
  title.value = 'Meine unveränderte Aufgabe';
  doc.querySelector('[name="status"]').value = 'doing';
  for (const element of doc.querySelectorAll('*')) {
    for (const attribute of element.attributes) {
      if (attribute.name.startsWith('data-i18n')) assert.ok(Object.hasOwn(messages.en, attribute.value), attribute.value);
    }
  }
  i18n.setLanguage('de'); translatePage(doc, i18n);
  assert.equal(doc.documentElement.lang, 'de');
  assert.equal(doc.title, 'Tagesaufgaben · KanDo');
  assert.equal(doc.querySelector('#search').placeholder, 'Aufgaben suchen …');
  assert.equal(doc.querySelector('#close-dialog').getAttribute('aria-label'), 'Schließen');
  assert.equal(title.value, 'Meine unveränderte Aufgabe');
  assert.equal(doc.querySelector('[name="status"]').value, 'doing');
  i18n.setLanguage('en'); translatePage(doc, i18n);
  assert.equal(doc.title, 'Daily tasks · KanDo');
  assert.equal(title.value, 'Meine unveränderte Aufgabe');
  dom.window.close();
});

test('live language switching preserves tasks, search, drafts, and localized server errors', async () => {
  const dom = new JSDOM(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'), { url: 'http://localhost' });
  const original = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, FormData: globalThis.FormData };
  const { window } = dom;
  const doc = window.document;
  Object.defineProperty(window.navigator, 'language', { value: 'de-DE' });
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const task = { id: '62f829ab-c457-4798-a402-cfc064d63354', title: 'Meine Aufgabe <script>', description: 'Unverändert', status: 'todo', priority: 'high', dueDate: '2026-03-10', scheduledFor: localDay() };
  const change = (element, type = 'change') => element.dispatchEvent(new window.Event(type, { bubbles: true }));
  globalThis.window = window;
  globalThis.document = doc;
  globalThis.FormData = window.FormData;
  globalThis.fetch = async (_url, options) => options.method ? Response.json({ code: 'TITLE_INVALID', error: messages.en['errors.TITLE_INVALID'] }, { status: 400 }) : Response.json([task]);
  try {
    await import('../public/app.js');
    assert.equal(doc.documentElement.lang, 'en');
    assert.equal(doc.querySelector('.card-title').textContent, task.title);
    assert.equal(doc.querySelector('.card-title script'), null);
    assert.equal(doc.querySelector('.badge').textContent, 'High');
    assert.equal(doc.querySelector('.due').textContent, 'Due date: Mar 10');
    doc.querySelector('.task-card').click();
    const title = doc.querySelector('[name="title"]');
    title.value = 'Unsaved draft';
    const language = doc.querySelector('#language');
    language.value = 'de'; change(language);
    assert.equal(doc.querySelector('#task-dialog').open, true);
    assert.equal(doc.querySelector('#dialog-title').textContent, 'Aufgabe bearbeiten');
    assert.equal(doc.querySelector('#save-task').textContent, 'Änderungen speichern');
    assert.equal(title.value, 'Unsaved draft');
    assert.equal(doc.querySelector('.badge').textContent, 'Hoch');
    assert.equal(doc.querySelector('.due').textContent, 'Fällig am: 10. März');
    assert.equal(window.localStorage.getItem('kando-language'), 'de');
    change(doc.querySelector('#task-form'), 'submit');
    await new Promise(setImmediate);
    assert.equal(doc.querySelector('#form-error').textContent, messages.de['errors.TITLE_INVALID']);
    language.value = 'en'; change(language);
    assert.equal(doc.querySelector('#form-error').textContent, messages.en['errors.TITLE_INVALID']);
    assert.equal(title.value, 'Unsaved draft');
    assert.equal(doc.querySelector('#task-dialog').open, true);
    doc.querySelector('#cancel-dialog').click();
    doc.querySelector('#search').value = 'no matching task'; change(doc.querySelector('#search'), 'input');
    language.value = 'de'; change(language);
    assert.equal(doc.querySelector('#search').value, 'no matching task');
    assert.match(doc.querySelector('.empty-column').textContent, /Keine passenden/);
    assert.equal(doc.querySelectorAll('.task-card').length, 0);
  } finally {
    Object.assign(globalThis, original);
    dom.window.close();
  }
});
