// Lädt Serverzeit, Events, Bestätigungen, Würfe, Haken und Strafen.
import { sb, state, gridDays, slotKey } from './state.js';
import { ymd, key, setStatus } from './util.js';

let renderer = () => {};
export const setRenderer = (fn) => { renderer = fn; };
export const render = () => renderer();

const EVENT_COLS = 'id, title, daily_confirm, daily_label, description, start_date, end_date, tasks_per_day, dice_expr, created_by';
let loadToken = 0;

export async function load() {
  const token = ++loadToken;
  const days = gridDays();
  const from = ymd(days[0]);
  const to = ymd(days[days.length - 1]);

  // 1) Serverzeit holen und verpasste Würfe vom Server nachwürfeln lassen
  const t0 = Date.now();
  const [clockRes, settleRes] = await Promise.all([sb.rpc('app_clock'), sb.rpc('settle_missed_rolls')]);
  const t1 = Date.now();
  if (token !== loadToken) return;
  if (clockRes.error) {
    setStatus('Serverzeit konnte nicht geladen werden: ' + clockRes.error.message, true);
  } else {
    state.clockOffset = Number(clockRes.data.now_ms) - (t0 + t1) / 2;
  }
  if (settleRes.error) console.warn('settle_missed_rolls:', settleRes.error.message);
  const serverDay = clockRes.data?.today ?? ymd(new Date());

  // 2) Events der Ansicht und aktuelles/nächstes Event
  const [eventsRes, focusRes, penRes] = await Promise.all([
    sb.from('events').select(EVENT_COLS).lte('start_date', to).gte('end_date', from).order('start_date').order('id'),
    sb.from('events').select(EVENT_COLS).gte('end_date', serverDay).order('start_date').order('id').limit(1),
    sb.from('open_penalties').select('event_id, event_title, day, slot, task_text, detail, auto_rolled, penalty_since').order('day').order('slot'),
  ]);
  if (token !== loadToken) return;
  const err1 = eventsRes.error || focusRes.error || penRes.error;
  if (err1) { setStatus('Daten konnten nicht geladen werden: ' + err1.message, true); return; }

  const events = eventsRes.data;
  const focusEvent = focusRes.data[0] ?? null;
  const ids = [...new Set([...events.map((e) => e.id), ...(focusEvent ? [focusEvent.id] : [])])];

  const eventChecks = new Map();
  const rolls = new Map();
  const taskChecks = new Map();
  const penaltyChecks = new Map();

  // 3) Status-Daten zu diesen Events
  if (ids.length) {
    const [ec, dr, tc, pc] = await Promise.all([
      sb.from('event_checks').select('event_id, day, checked_at').in('event_id', ids),
      sb.from('daily_rolls').select('event_id, day, slot, result, detail, task_text, base_text, alt_used, rolled_at, rolled_by').in('event_id', ids).order('slot'),
      sb.from('task_checks').select('event_id, day, slot, checked_at').in('event_id', ids),
      sb.from('penalty_checks').select('event_id, day, slot, done_at').in('event_id', ids),
    ]);
    if (token !== loadToken) return;
    const err2 = ec.error || dr.error || tc.error || pc.error;
    if (err2) { setStatus('Daten konnten nicht geladen werden: ' + err2.message, true); return; }
    for (const r of ec.data) eventChecks.set(key(r.event_id, r.day), r);
    for (const r of dr.data) {
      const k = key(r.event_id, r.day);
      if (!rolls.has(k)) rolls.set(k, []);
      rolls.get(k).push(r);
    }
    for (const r of tc.data) taskChecks.set(slotKey(r.event_id, r.day, r.slot), r);
    for (const r of pc.data) penaltyChecks.set(slotKey(r.event_id, r.day, r.slot), r);
  }

  Object.assign(state, { events, focusEvent, eventChecks, rolls, taskChecks, penaltyChecks, penalties: penRes.data });
  render();
}
