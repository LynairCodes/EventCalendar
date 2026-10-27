// Supabase-Verbindung, gemeinsamer Zustand, Serverzeit und Status-Regeln.
// Die Regeln hier steuern nur, was die Seite anzeigt.
// Erzwungen werden sie von der Datenbank (siehe setup_v4.sql).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY, TZ, DEADLINE_HOUR } from './config.js';
import { addDays, shiftYmd, key } from './util.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const now = new Date();
export const state = {
  session: null,
  member: null,             // { username, can_create_events, can_check }
  clockOffset: null,        // Serverzeit minus lokale Zeit in ms (null = unbekannt)
  year: now.getFullYear(),
  month: now.getMonth(),
  events: [],               // Events in der Monatsansicht
  focusEvent: null,         // aktuelles oder nächstes Event
  eventChecks: new Map(),   // "id|day" -> Zeile
  rolls: new Map(),         // "id|day" -> [Würfe nach slot]
  taskChecks: new Map(),    // "id|day|slot" -> Zeile
  penaltyChecks: new Map(), // "id|day|slot" -> Zeile
  penalties: [],            // offene Strafen (alle Events)
  settings: { creator_can_roll: false }, // gemeinsame Einstellungen
  detail: null,             // { eventId, day } der offenen Tagesansicht
  acting: false,
};

export const slotKey = (id, day, slot) => `${id}|${day}|${slot}`;
export const allEvents = () => {
  const list = [...state.events];
  if (state.focusEvent && !list.some((e) => e.id === state.focusEvent.id)) list.push(state.focusEvent);
  return list;
};
export const findEvent = (id) => allEvents().find((e) => e.id === id);

// ---------- Rollen ----------
export const isChecker = () => !!state.member?.can_check;
export const isCreator = () => !!state.member?.can_create_events;
export const isOwnEvent = (e) => isCreator() && state.session?.user.id === e.created_by;

// ---------- Serverzeit ----------
// Die Seite rechnet mit der Serverzeit. Eine verstellte PC-Uhr ändert nichts.
export const serverNow = () => (state.clockOffset == null ? null : Date.now() + state.clockOffset);

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function berlinParts(ms) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

export const berlinDate = (ms) => berlinParts(ms).date;
export const today = () => (serverNow() == null ? null : berlinParts(serverNow()).date);
export const yesterday = () => (today() ? shiftYmd(today(), -1) : null);
const beforeDeadline = () => serverNow() != null && berlinParts(serverNow()).hour < DEADLINE_HOUR;

// Schlüssel, der sich um Mitternacht und um 15 Uhr ändert (für automatisches Neuladen)
export const timeSlotKey = () => (today() ? `${today()}|${beforeDeadline()}` : '');

// Tagesaufgabe von Tag ds darf gerade gewürfelt/abgehakt werden
export const taskOpen = (ds) => !!today() && (ds === today() || (ds === yesterday() && beforeDeadline()));
// Frist für Tag ds ist vorbei
export const deadlinePassed = (ds) => !!today() && (ds < yesterday() || (ds === yesterday() && !beforeDeadline()));

// ---------- Status eines Tages ----------
// Bestätigung: 'done' | 'open' (heute möglich) | 'waiting' (Zukunft/heute) | 'missed' | 'none' (nicht aktiv)
export function confirmStatus(e, ds) {
  if (state.eventChecks.has(key(e.id, ds))) return 'done';
  if (!e.daily_confirm) return 'none';
  if (!today()) return 'waiting';
  if (ds === yesterday()) return 'open';
  if (ds >= today()) return 'waiting';
  return 'missed';
}

// Aufgaben-Slot: { status, roll, check }
// status: 'done' | 'late' (Strafe nachgeholt) | 'open' | 'penalty' | 'unrolled' | 'missed'
//         | 'upcoming' (Zukunft, schon gewürfelt) | 'future' (Zukunft, noch nicht gewürfelt)
export function slotStatus(e, ds, slot) {
  const roll = (state.rolls.get(key(e.id, ds)) || []).find((r) => r.slot === slot) || null;
  const check = state.taskChecks.get(slotKey(e.id, ds, slot)) || null;
  const late = state.penaltyChecks.get(slotKey(e.id, ds, slot)) || null;
  let status;
  if (roll) {
    if (check) status = 'done';
    else if (late) status = 'late';
    else if (deadlinePassed(ds)) status = 'penalty';
    else if (today() && ds > today()) status = 'upcoming'; // vorab gewürfelt, noch nicht dran
    else status = 'open';
  } else if (taskOpen(ds)) status = 'unrolled';
  else if (deadlinePassed(ds)) status = 'missed';
  else status = 'future';
  return { status, roll, check, late };
}

export const slotCount = (e, ds) => Math.max(e.tasks_per_day, (state.rolls.get(key(e.id, ds)) || []).length);

export const canConfirm = (ds) => isChecker() && !!today() && ds === yesterday();
export const canWorkTask = (ds) => isChecker() && taskOpen(ds);

// Wartet an diesem Tag etwas auf Sophia?
export function pendingFor(e, ds) {
  if (!isChecker()) return false;
  if (confirmStatus(e, ds) === 'open') return true;
  for (let s = 1; s <= slotCount(e, ds); s++) {
    const st = slotStatus(e, ds, s).status;
    if (st === 'open' || st === 'unrolled') return true;
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
