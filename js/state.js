// Supabase-Verbindung, gemeinsamer Zustand und Rollen-/Zeitfenster-Regeln.
// Die Regeln hier steuern nur, was die Seite anzeigt.
// Erzwungen werden sie von der Datenbank (siehe setup_v2.sql).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { addDays, shiftYmd, key } from './util.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const now = new Date();
export const state = {
  session: null,
  member: null,            // { username, can_create_events, can_check }
  serverToday: null,       // 'YYYY-MM-DD' laut Server
  year: now.getFullYear(),
  month: now.getMonth(),
  events: [],
  eventChecks: new Map(),  // "id|day" -> Zeile
  rolls: new Map(),        // "id|day" -> [Würfe nach slot]
  taskChecks: new Map(),   // "id|day|slot" -> Zeile
  detail: null,            // { eventId, day } der offenen Tagesansicht
  acting: false,
};

// ---------- Rollen ----------
export const isChecker = () => !!state.member?.can_check;
export const isCreator = () => !!state.member?.can_create_events;

// ---------- Zeitfenster laut Serverdatum ----------
export const today = () => state.serverToday;
export const yesterday = () => (state.serverToday ? shiftYmd(state.serverToday, -1) : null);
export const canConfirm = (ds) => isChecker() && !!today() && ds === yesterday();
export const inTaskWindow = (ds) => isChecker() && !!today() && (ds === today() || ds === yesterday());

// Wartet an diesem Tag etwas auf Sophia?
export function pendingFor(e, ds) {
  if (!isChecker()) return false;
  if (canConfirm(ds) && !state.eventChecks.has(key(e.id, ds))) return true;
  if (e.tasks_per_day > 0 && inTaskWindow(ds)) {
    const rolls = state.rolls.get(key(e.id, ds)) || [];
    if (rolls.length < e.tasks_per_day) return true;
    if (rolls.some((r) => !state.taskChecks.has(`${key(e.id, ds)}|${r.slot}`))) return true;
  }
  return false;
}

// Die 42 Tage (6 Wochen) der Monatsansicht, beginnend am Montag
export function gridDays() {
  const first = new Date(state.year, state.month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

