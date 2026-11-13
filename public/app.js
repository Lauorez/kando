import { createI18n, messages, translatePage } from './i18n.js';

const $ = (selector) => document.querySelector(selector);
let storage;
try { storage = window.localStorage; } catch {}
const i18n = createI18n(storage);
const t = (key, values) => i18n.t(key, values);
const columns = ['backlog', 'todo', 'doing', 'done'];
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
function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function card(task) {
  const due = task.dueDate ? new Intl.DateTimeFormat(i18n.locale, { day: 'numeric', month: 'short' }).format(new Date(`${task.dueDate}T12:00:00`)) : t('noDate');
  const overdue = task.dueDate && task.dueDate < localToday() && task.status !== 'done';
  return `<article class="task-card" draggable="true" data-id="${task.id}" tabindex="0" aria-label="${escape(t('openTask', { title: task.title }))}"><div class="card-top"><span class="badge ${task.priority}">${t(task.priority)}</span><button class="edit-task" aria-label="${escape(t('editTask', { title: task.title }))}">···</button></div><h3 class="card-title">${escape(task.title)}</h3>${task.description ? `<p class="card-description">${escape(task.description)}</p>` : ''}<div class="card-bottom"><span class="due ${overdue ? 'overdue' : ''}" title="${task.dueDate || t('noDate')}">${task.dueDate ? due : ''}</span><select class="status-select" aria-label="${escape(t('taskStatus', { title: task.title }))}" ${busy ? 'disabled' : ''}>${columns.map((column) => `<option value="${column}" ${column === task.status ? 'selected' : ''}>${t(column)}</option>`).join('')}</select></div></article>`;
}
function render() {
  const query = $('#search').value.trim().toLocaleLowerCase(i18n.locale);
  const priority = $('#priority-filter').value;
  const visible = tasks.filter((t) => `${t.title} ${t.description}`.toLocaleLowerCase(i18n.locale).includes(query) && (priority === 'all' || t.priority === priority));
  const done = tasks.filter((t) => t.status === 'done').length;
  $('#summary').textContent = t(tasks.length === 1 ? 'summaryOne' : 'summary', { count: tasks.length, done });
  $('#board').innerHTML = columns.map((column) => {
    const items = visible.filter((t) => t.status === column);
    return `<section class="column" data-status="${column}" aria-label="${t(column)}"><div class="column-heading"><h2>${t(column)}</h2><span class="column-count">${items.length}</span><button class="icon-button add-task" aria-label="${escape(t('addIn', { column: t(column) }))}">+</button></div><div class="cards">${items.length ? items.map(card).join('') : `<div class="empty-column">${!loaded ? t('loading') : query || priority !== 'all' ? t('noMatches') : t('empty')}</div>`}</div><button class="add-card add-task">${t('addTask')}</button></section>`;
  }).join('');
}
function openTask(id = null, status = 'todo') {
  if (busy || $('#refresh').disabled) return;
  if (!loaded) { error('errors.notLoaded'); return; }
  editingId = id;
  const task = tasks.find((t) => t.id === id);
  form.reset();
  error('', $('#form-error'));
  for (const [name, value] of Object.entries(task || { status, priority: 'medium' })) if (form.elements.namedItem(name)) form.elements.namedItem(name).value = value;
  dialogLabels();
  form.elements.title.setCustomValidity('');
  $('#delete-task').hidden = !task;
  dialog.showModal();
  form.elements.title.focus();
}
function lock(value) {
  busy = value;
  for (const el of form.elements) el.disabled = value;
  $('#confirm-delete').disabled = value;
  $('#cancel-delete').disabled = value;
}
async function move(id, status) {
  const existing = tasks.find((task) => task.id === id);
  if (busy || $('#refresh').disabled || !existing || existing.status === status) return;
  lock(true);
  error('');
  localized($('#save-state'), 'saving');
  try {
    const updated = await api(`/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    tasks = tasks.map((t) => t.id === id ? updated : t);
    localized($('#save-state'), 'saved');
  } catch (e) { error(e); localized($('#save-state'), 'notSaved'); }
  finally { lock(false); render(); }
}
$('#language').addEventListener('change', (event) => {
  i18n.setLanguage(event.target.value);
  applyLanguage();
});
form.elements.title.addEventListener('invalid', () => form.elements.title.setCustomValidity(t('errors.TITLE_INVALID')));
form.elements.title.addEventListener('input', () => form.elements.title.setCustomValidity(''));
$('#new-task').addEventListener('click', () => openTask());
$('#search').addEventListener('input', render);
$('#priority-filter').addEventListener('change', render);
for (const id of ['close-dialog', 'cancel-dialog']) $(`#${id}`).addEventListener('click', () => dialog.close());
for (const modal of [dialog, $('#delete-dialog')]) modal.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
$('#board').addEventListener('click', (event) => {
  if (event.target.closest('select')) return;
  const add = event.target.closest('.add-task');
  if (add) return openTask(null, add.closest('.column').dataset.status);
  const task = event.target.closest('.task-card');
  if (task) openTask(task.dataset.id);
});
$('#board').addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.task-card')) { event.preventDefault(); openTask(event.target.dataset.id); }
});
$('#board').addEventListener('change', (event) => {
  if (event.target.matches('.status-select')) move(event.target.closest('.task-card').dataset.id, event.target.value);
});
$('#board').addEventListener('dragstart', (event) => {
  const task = event.target.closest('.task-card');
  if (!task || busy || $('#refresh').disabled || event.target.closest('select')) return event.preventDefault();
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
function clearDrag() { draggingId = null; document.querySelectorAll('.drag-over,.dragging').forEach((el) => el.classList.remove('drag-over', 'dragging')); }
$('#board').addEventListener('dragend', clearDrag);
$('#board').addEventListener('drop', (event) => {
  const column = event.target.closest('.column');
  if (column && draggingId) { event.preventDefault(); const id = draggingId; clearDrag(); move(id, column.dataset.status); }
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  const input = Object.fromEntries(new FormData(form));
  lock(true);
  error('', $('#form-error'));
  try {
    const task = await api(editingId ? `/${editingId}` : '', { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(input) });
    tasks = editingId ? tasks.map((t) => t.id === editingId ? task : t) : [task, ...tasks];
    loaded = true;
    error('');
    localized($('#save-state'), 'saved');
    dialog.close();
    render();
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
    tasks = tasks.filter((t) => t.id !== editingId);
    $('#delete-dialog').close(); dialog.close(); render();
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
applyLanguage();
await refresh();
