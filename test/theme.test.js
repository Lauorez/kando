import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../public/theme.js', import.meta.url), 'utf8');
function theme(saved, dark = false, storageUnavailable = false) {
  const dataset = {};
  const listeners = {};
  const select = { addEventListener: (_, fn) => { listeners.change = fn; } };
  const media = { matches: dark, addEventListener: (_, fn) => { listeners.system = fn; } };
  const storage = new Map(saved ? [['kando-theme', saved]] : []);
  const meta = {};
  runInNewContext(script, {
    document: { documentElement: { dataset }, querySelector: (s) => s === '#theme' ? select : meta, addEventListener: (_, fn) => { listeners.ready = fn; } },
    matchMedia: () => media,
    localStorage: { getItem: (k) => { if (storageUnavailable) throw Error(); return storage.get(k); }, setItem: (k, v) => { if (storageUnavailable) throw Error(); storage.set(k, v); } },
  });
  listeners.ready();
  return { dataset, select, media, storage, listeners };
}
test('theme follows system and persists explicit override across reloads', () => {
  const state = theme(null, true);
  assert.equal(state.dataset.theme, 'dark');
  assert.equal(state.select.value, 'system');
  state.media.matches = false; state.listeners.system();
  assert.equal(state.dataset.theme, 'light');
  state.select.value = 'dark'; state.listeners.change();
  assert.equal(state.storage.get('kando-theme'), 'dark');
  state.listeners.system();
  assert.equal(state.dataset.theme, 'dark');
  assert.equal(theme(state.storage.get('kando-theme'), false).dataset.theme, 'dark');
  assert.equal(theme('invalid', false).dataset.theme, 'light');
  assert.equal(theme(null, true, true).dataset.theme, 'dark');
});
