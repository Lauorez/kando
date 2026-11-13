const $ = (selector) => document.querySelector(selector);
const columns = [
  { id: 'backlog', title: 'Ideenspeicher', empty: 'Keine Aufgaben' },
  { id: 'todo', title: 'Zu erledigen', empty: 'Keine Aufgaben' },
  { id: 'doing', title: 'In Arbeit', empty: 'Keine Aufgaben' },
  { id: 'done', title: 'Erledigt', empty: 'Keine Aufgaben' },
];
const priorities = { high: 'Hoch', medium: 'Mittel', low: 'Niedrig' };
let tasks = [];
let editingId = null;
let draggingId = null;
let busy = false;
let loaded = false;
const form = $('#task-form');
const dialog = $('#task-dialog');
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function error(message, target = $('#error')) { target.textContent = message; target.hidden = !message; }
async function api(path = '', options = {}) {
  let response;
  try { response = await fetch(`/api/tasks${path}`, { ...options, headers: { 'Content-Type': 'application/json' } }); }
  catch { throw Error('Der Server ist nicht erreichbar. Bitte versuche es erneut.'); }
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Die Änderung konnte nicht gespeichert werden.');
  return data;
}
function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function card(task) {
  const due = task.dueDate ? new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' }).format(new Date(`${task.dueDate}T12:00:00`)) : 'Kein Datum';
  const overdue = task.dueDate && task.dueDate < localToday() && task.status !== 'done';
  return `<article class="task-card" draggable="true" data-id="${task.id}" tabindex="0" aria-label="${escape(task.title)} – zum Bearbeiten öffnen"><div class="card-top"><span class="badge ${task.priority}">${priorities[task.priority]}</span><button class="edit-task" aria-label="${escape(task.title)} bearbeiten">···</button></div><h3 class="card-title">${escape(task.title)}</h3>${task.description ? `<p class="card-description">${escape(task.description)}</p>` : ''}<div class="card-bottom"><span class="due ${overdue ? 'overdue' : ''}" title="${task.dueDate || 'Kein Fälligkeitsdatum'}">${task.dueDate ? due : ''}</span><select class="status-select" aria-label="Status von ${escape(task.title)}" ${busy ? 'disabled' : ''}>${columns.map((column) => `<option value="${column.id}" ${column.id === task.status ? 'selected' : ''}>${column.title}</option>`).join('')}</select></div></article>`;
}
function render() {
  const query = $('#search').value.trim().toLocaleLowerCase('de');
  const priority = $('#priority-filter').value;
  const visible = tasks.filter((t) => `${t.title} ${t.description}`.toLocaleLowerCase('de').includes(query) && (priority === 'all' || t.priority === priority));
  const done = tasks.filter((t) => t.status === 'done').length;
  $('#summary').textContent = `${tasks.length} Aufgaben · ${done} erledigt`;
  $('#board').innerHTML = columns.map((column) => {
    const items = visible.filter((t) => t.status === column.id);
    return `<section class="column" data-status="${column.id}" aria-label="${column.title}"><div class="column-heading"><h2>${column.title}</h2><span class="column-count">${items.length}</span><button class="icon-button add-task" aria-label="Aufgabe in ${column.title} erstellen">+</button></div><div class="cards">${items.length ? items.map(card).join('') : `<div class="empty-column">${!loaded ? 'Board wird geladen …' : query || priority !== 'all' ? 'Keine passenden Aufgaben.' : column.empty}</div>`}</div><button class="add-card add-task">＋ Aufgabe hinzufügen</button></section>`;
  }).join('');
}
function openTask(id = null, status = 'todo') {
  if (busy || $('#refresh').disabled) return;
  if (!loaded) { error('Das Board ist noch nicht verfügbar. Bitte lade die Seite erneut.'); return; }
  editingId = id;
  const task = tasks.find((t) => t.id === id);
  form.reset();
  error('', $('#form-error'));
  for (const [name, value] of Object.entries(task || { status, priority: 'medium' })) if (form.elements.namedItem(name)) form.elements.namedItem(name).value = value;
  $('#dialog-title').textContent = task ? 'Aufgabe bearbeiten' : 'Neue Aufgabe';
  $('#save-task').textContent = task ? 'Änderungen speichern' : 'Aufgabe erstellen';
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
  $('#save-state').textContent = 'Wird gespeichert …';
  try {
    const updated = await api(`/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    tasks = tasks.map((t) => t.id === id ? updated : t);
    $('#save-state').textContent = 'Alle Änderungen gespeichert';
  } catch (e) { error(e.message); $('#save-state').textContent = 'Änderung nicht gespeichert'; }
  finally { lock(false); render(); }
}
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
    $('#save-state').textContent = 'Alle Änderungen gespeichert';
    dialog.close();
    render();
  } catch (e) { error(e.message, $('#form-error')); }
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
    $('#save-state').textContent = 'Aufgabe gelöscht';
  } catch (e) { error(e.message, $('#delete-error')); }
  finally { lock(false); render(); }
});
async function refresh() {
  if (busy || dialog.open || $('#refresh').disabled) return;
  $('#refresh').disabled = true;
  $('#board').setAttribute('aria-busy', 'true');
  try {
    tasks = await api(); loaded = true;
    error('');
    $('#save-state').textContent = 'Board aktuell';
  } catch (e) { error(e.message); $('#save-state').textContent = 'Aktualisierung fehlgeschlagen'; }
  finally { $('#refresh').disabled = false; $('#board').setAttribute('aria-busy', 'false'); render(); }
}
$('#refresh').addEventListener('click', refresh);
window.addEventListener('focus', refresh);
render();
await refresh();
