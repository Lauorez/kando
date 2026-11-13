import { createI18n, messages, translatePage } from './i18n.js';
import { localDay } from './dates.js';

const $ = (selector) => document.querySelector(selector);
let storage;
try { storage = window.localStorage; } catch {}
const i18n = createI18n(storage);
const t = (key, values) => i18n.t(key, values);
const priorities = ['high', 'medium', 'low'];
let tasks = [];
let editingId = null;
let draggingId = null;
let busy = false;
let loaded = false;
const form = $('#task-form');
const dialog = $('#task-dialog');
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function localized(element, key) {
  element.dataset.i18n = key;
  element.textContent = t(key);
}
function error(value, target = $('#error')) {
  const key = value?.messageKey || (typeof value === 'string' ? value : value ? 'errors.save' : '');
  if (key) localized(target, key);
  else { delete target.dataset.i18n; target.textContent = ''; }
  target.hidden = !key;
}
function uiError(messageKey) { return Object.assign(new Error(t(messageKey)), { messageKey }); }
function dialogLabels() {
  localized($('#dialog-title'), editingId ? 'editHeading' : 'createHeading');
  localized($('#save-task'), editingId ? 'save' : 'create');
}
function applyLanguage() {
  translatePage(document, i18n);
  $('#language').value = i18n.language;
  dialogLabels();
  if (form.elements.title.validity.customError) form.elements.title.setCustomValidity(t('errors.TITLE_INVALID'));
  render();
}
async function api(path = '', options = {}) {
  let response;
  try { response = await fetch(`/api/tasks${path}`, { ...options, headers: { 'Content-Type': 'application/json' } }); }
  catch { throw uiError('errors.unavailable'); }
  let data;
  try { data = await response.json(); } catch { throw uiError('errors.save'); }
  if (!response.ok) throw uiError(Object.hasOwn(messages.en, `errors.${data.code}`) ? `errors.${data.code}` : 'errors.save');
  return data;
}
function formatDay(day, options = { day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat(i18n.locale, options).format(new Date(`${day}T12:00:00`));
}
function card(task) {
  const complete = task.status === 'done';
  const overdue = task.dueDate && task.dueDate < localDay() && !complete;
  return `<article class="task-card ${complete ? 'is-done' : ''}" draggable="true" data-id="${task.id}" tabindex="0" aria-label="${escape(t('openTask', { title: task.title }))}">
    <div class="card-top"><span class="badge ${task.priority}">${t(task.priority)}</span><button class="edit-task" aria-label="${escape(t('editTask', { title: task.title }))}">···</button></div>
    <div class="task-heading"><input type="checkbox" class="complete-task" ${complete ? 'checked' : ''} ${busy ? 'disabled' : ''} aria-label="${escape(t(complete ? 'reopenTask' : 'completeTask', { title: task.title }))}"><h3 class="card-title">${escape(task.title)}</h3></div>
    ${task.description ? `<p class="card-description">${escape(task.description)}</p>` : ''}
    <div class="card-bottom"><span class="due ${overdue ? 'overdue' : ''}" title="${task.dueDate || t('noDate')}">${task.dueDate ? `${t('dueDate')}: ${formatDay(task.dueDate)}` : ''}</span><select class="priority-select" aria-label="${escape(t('taskPriority', { title: task.title }))}" ${busy ? 'disabled' : ''}>${priorities.map((priority) => `<option value="${priority}" ${priority === task.priority ? 'selected' : ''}>${t(priority)}</option>`).join('')}</select></div>
  </article>`;
}
function render() {
  const query = $('#search').value.trim().toLocaleLowerCase(i18n.locale);
  const visible = tasks.filter((task) => `${task.title} ${task.description}`.toLocaleLowerCase(i18n.locale).includes(query) && ($('#show-completed').checked || task.status !== 'done'));
  const done = tasks.filter((task) => task.status === 'done').length;
  $('#summary').textContent = loaded ? t(tasks.length === 1 ? 'summaryOne' : 'summary', { count: tasks.length, done }) : t('loading');
  $('#board-title').textContent = t('boardTitle');
  document.title = t('pageTitle');
  $('#board-progress').max = tasks.length || 1;
  $('#board-progress').value = done;
  $('#board').innerHTML = priorities.map((priority) => {
    const items = visible.filter((task) => task.priority === priority).sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
    return `<section class="column" data-priority="${priority}" aria-label="${t(priority)}"><div class="column-heading"><h2>${t(priority)}</h2><span class="column-count">${items.length}</span><button class="icon-button add-task" aria-label="${escape(t('addIn', { column: t(priority) }))}">+</button></div><div class="cards">${items.length ? items.map(card).join('') : `<div class="empty-column">${!loaded ? t('loading') : query ? t('noMatches') : t('empty')}</div>`}</div><button class="add-card add-task">${t('addTask')}</button></section>`;
  }).join('');
}
function openTask(id = null, priority = 'medium') {
  if (busy || $('#refresh').disabled) return;
  if (!loaded) { error('errors.notLoaded'); return; }
  editingId = id;
  const task = tasks.find((task) => task.id === id);
  form.reset();
  error('', $('#form-error'));
  const defaults = { status: 'todo', priority };
  for (const [name, value] of Object.entries(task || defaults)) if (form.elements.namedItem(name)) form.elements.namedItem(name).value = value;
  dialogLabels();
  form.elements.title.setCustomValidity('');
  $('#delete-task').hidden = !task;
  dialog.showModal();
  form.elements.title.focus();
}
function lock(value) {
  busy = value;
  for (const element of form.elements) element.disabled = value;
  $('#confirm-delete').disabled = value;
  $('#cancel-delete').disabled = value;
}
async function updateTask(id, patch) {
  if (busy || $('#refresh').disabled) { render(); return; }
  lock(true);
  error('');
  localized($('#save-state'), 'saving');
  render();
  try {
    const updated = await api(`/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    tasks = tasks.map((task) => task.id === id ? updated : task);
    localized($('#save-state'), 'saved');
  } catch (e) { error(e); localized($('#save-state'), 'notSaved'); }
  finally { lock(false); render(); }
}
$('#language').addEventListener('change', (event) => { i18n.setLanguage(event.target.value); applyLanguage(); });
form.elements.title.addEventListener('invalid', () => form.elements.title.setCustomValidity(t('errors.TITLE_INVALID')));
form.elements.title.addEventListener('input', () => form.elements.title.setCustomValidity(''));
$('#new-task').addEventListener('click', () => openTask());
$('#search').addEventListener('input', render);
$('#show-completed').addEventListener('change', render);
for (const id of ['close-dialog', 'cancel-dialog']) $(`#${id}`).addEventListener('click', () => dialog.close());
for (const modal of [dialog, $('#delete-dialog')]) modal.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
$('#board').addEventListener('click', (event) => {
  if (event.target.closest('select,input')) return;
  const add = event.target.closest('.add-task');
  if (add) return openTask(null, add.closest('.column').dataset.priority);
  const task = event.target.closest('.task-card');
  if (task) openTask(task.dataset.id);
});
$('#board').addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.task-card')) { event.preventDefault(); openTask(event.target.dataset.id); }
});
$('#board').addEventListener('change', (event) => {
  const card = event.target.closest('.task-card');
  if (!card) return;
  if (event.target.matches('.priority-select')) updateTask(card.dataset.id, { priority: event.target.value });
  if (event.target.matches('.complete-task')) updateTask(card.dataset.id, { status: event.target.checked ? 'done' : 'todo' });
});
$('#board').addEventListener('dragstart', (event) => {
  const task = event.target.closest('.task-card');
  if (!task || busy || $('#refresh').disabled || event.target.closest('select,input,button')) return event.preventDefault();
  draggingId = task.dataset.id;
  event.dataTransfer.setData('text/plain', draggingId);
  event.dataTransfer.effectAllowed = 'move';
  task.classList.add('dragging');
});
$('#board').addEventListener('dragover', (event) => {
  const column = event.target.closest('.column');
  if (column && draggingId) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; column.classList.add('drag-over'); }
});
$('#board').addEventListener('dragleave', (event) => {
  const column = event.target.closest('.column');
  if (column && !column.contains(event.relatedTarget)) column.classList.remove('drag-over');
});
function clearDrag() { draggingId = null; document.querySelectorAll('.drag-over,.dragging').forEach((element) => element.classList.remove('drag-over', 'dragging')); }
$('#board').addEventListener('dragend', clearDrag);
$('#board').addEventListener('drop', (event) => {
  const column = event.target.closest('.column');
  if (column && draggingId) {
    event.preventDefault();
    const id = draggingId;
    const priority = column.dataset.priority;
    clearDrag();
    if (tasks.find((task) => task.id === id)?.priority !== priority) updateTask(id, { priority });
  }
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  const input = Object.fromEntries(new FormData(form));
  lock(true);
  error('', $('#form-error'));
  try {
    const task = await api(editingId ? `/${editingId}` : '', { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(input) });
    tasks = editingId ? tasks.map((existing) => existing.id === editingId ? task : existing) : [task, ...tasks];
    loaded = true;
    error('');
    localized($('#save-state'), 'saved');
    dialog.close();
  } catch (e) { error(e, $('#form-error')); }
  finally { lock(false); render(); }
});
$('#delete-task').addEventListener('click', () => { error('', $('#delete-error')); $('#delete-dialog').showModal(); $('#cancel-delete').focus(); });
$('#cancel-delete').addEventListener('click', () => $('#delete-dialog').close());
$('#confirm-delete').addEventListener('click', async () => {
  if (busy) return;
  lock(true);
  try {
    await api(`/${editingId}`, { method: 'DELETE' });
    tasks = tasks.filter((task) => task.id !== editingId);
    $('#delete-dialog').close(); dialog.close();
    localized($('#save-state'), 'deleted');
  } catch (e) { error(e, $('#delete-error')); }
  finally { lock(false); render(); }
});
async function refresh() {
  if (busy || dialog.open || $('#refresh').disabled) return;
  $('#refresh').disabled = true;
  $('#board').setAttribute('aria-busy', 'true');
  try {
    tasks = await api(); loaded = true;
    error('');
    localized($('#save-state'), 'current');
  } catch (e) { error(e); localized($('#save-state'), 'refreshFailed'); }
  finally { $('#refresh').disabled = false; $('#board').setAttribute('aria-busy', 'false'); render(); }
}
$('#refresh').addEventListener('click', refresh);
window.addEventListener('focus', refresh);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
window.setInterval(() => { if (!document.hidden) refresh(); }, 60_000);
applyLanguage();
await refresh();
