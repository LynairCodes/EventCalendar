// Aktionen: Tag bestätigen, würfeln, Aufgaben abhaken, Strafen nachholen, Event löschen.
// Nach jeder Aktion wird neu geladen.
import { sb, state } from './state.js';
import { load, render } from './data.js';
import { $, friendlyError, setStatus } from './util.js';

function showError(msg) {
  if ($('detail-dialog').open) $('detail-error').textContent = msg;
  else setStatus(msg, true);
}

async function run(fn, okMsg) {
  if (state.acting) return;
  state.acting = true;
  $('detail-error').textContent = '';
  render();
  try {
    const { error } = await fn();
    if (error) showError(friendlyError(error));
    else if (okMsg) setStatus(okMsg);
  } finally {
    state.acting = false;
    await load();
  }
}

export const confirmDay = (e, day, undo) => run(() => undo
  ? sb.from('event_checks').delete().eq('event_id', e.id).eq('day', day)
  : sb.from('event_checks').insert({ event_id: e.id, day }), undo ? null : 'Tag bestätigt.');

export const toggleTask = (e, day, slot, undo) => run(() => undo
  ? sb.from('task_checks').delete().eq('event_id', e.id).eq('day', day).eq('slot', slot)
  : sb.from('task_checks').insert({ event_id: e.id, day, slot }), undo ? null : 'Aufgabe erledigt.');

export const rollDay = (e, day) => run(() => sb.rpc('roll_tasks', { p_event_id: e.id, p_day: day }), 'Gewürfelt.');

export const resolvePenalty = (eventId, day, slot, undo) => run(() => undo
  ? sb.from('penalty_checks').delete().eq('event_id', eventId).eq('day', day).eq('slot', slot)
  : sb.from('penalty_checks').insert({ event_id: eventId, day, slot }), undo ? null : 'Strafe als nachgeholt markiert.');

export async function deleteEvent(e) {
  if (!confirm(`Event „${e.title}“ mit allen Bestätigungen, Würfen und Haken löschen?`)) return;
  const { error } = await sb.from('events').delete().eq('id', e.id);
  if (error) { setStatus('Löschen fehlgeschlagen: ' + friendlyError(error), true); return; }
  if ($('detail-dialog').open) $('detail-dialog').close();
  setStatus('Event gelöscht.');
  load();
}
