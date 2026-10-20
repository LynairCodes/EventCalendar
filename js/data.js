// Lädt Serverdatum, Events, Bestätigungen, Würfe und Haken für die aktuelle Ansicht.
import { sb, state, gridDays } from './state.js';
import { ymd, key, setStatus } from './util.js';

let renderer = () => {};
export const setRenderer = (fn) => { renderer = fn; };
export const render = () => renderer();

let loadToken = 0;

export async function load() {
  const token = ++loadToken;
  const days = gridDays();
  const from = ymd(days[0]);
  const to = ymd(days[days.length - 1]);

  const [todayRes, eventsRes] = await Promise.all([
    sb.rpc('app_today'),
    sb.from('events')
      .select('id, title, start_date, end_date, tasks_per_day, dice_expr, created_by')
      .lte('start_date', to).gte('end_date', from)
      .order('start_date').order('id'),
  ]);
  if (token !== loadToken) return;
  if (todayRes.error) setStatus('Serverzeit konnte nicht geladen werden: ' + todayRes.error.message, true);
  else state.serverToday = todayRes.data;
  if (eventsRes.error) { setStatus('Events konnten nicht geladen werden: ' + eventsRes.error.message, true); return; }

  const events = eventsRes.data;
  const eventChecks = new Map();
  const rolls = new Map();
  const taskChecks = new Map();

  if (events.length) {
    const ids = events.map((e) => e.id);
    const [ec, dr, tc] = await Promise.all([
      sb.from('event_checks').select('event_id, day, checked_at').in('event_id', ids),
      sb.from('daily_rolls').select('event_id, day, slot, result, detail, task_text, rolled_at').in('event_id', ids).order('slot'),
      sb.from('task_checks').select('event_id, day, slot, checked_at').in('event_id', ids),
    ]);
    if (token !== loadToken) return;
    const err = ec.error || dr.error || tc.error;
    if (err) { setStatus('Daten konnten nicht geladen werden: ' + err.message, true); return; }
    for (const r of ec.data) eventChecks.set(key(r.event_id, r.day), r);
    for (const r of dr.data) {
      const k = key(r.event_id, r.day);
      if (!rolls.has(k)) rolls.set(k, []);
      rolls.get(k).push(r);
    }
    for (const r of tc.data) taskChecks.set(`${key(r.event_id, r.day)}|${r.slot}`, r);
  }

  Object.assign(state, { events, eventChecks, rolls, taskChecks });
  render();
}
