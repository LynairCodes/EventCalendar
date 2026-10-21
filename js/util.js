// Allgemeine Helfer: Datum, Formatierung, DOM-Bau, Meldungen
import { TZ, COLORS } from './config.js';

export const $ = (id) => document.getElementById(id);

// ---------- Datum (immer als lokaler Kalendertag "YYYY-MM-DD") ----------
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const shiftYmd = (s, n) => ymd(addDays(parseYmd(s), n));
export const dayCount = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000) + 1;

// ---------- Schlüssel und Farben ----------
export const key = (id, day) => `${id}|${day}`;
export const color = (id) => COLORS[id % COLORS.length];

// ---------- Formatierung ----------
export const fmtShort = (s) => parseYmd(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
export const fmtDate = (s) => parseYmd(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const fmtLong = (s) => parseYmd(s).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtStamp = (ts) => new Date(ts).toLocaleString('de-DE', {
  timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
}) + ' Uhr';
export const fmtPct = (p) => (p * 100).toLocaleString('de-DE', { maximumFractionDigits: p < 0.1 ? 1 : 0 }) + ' %';

// ---------- DOM-Bau: h('div', { class: 'x', text: 'Hallo' }, kind1, kind2) ----------
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'vars') for (const [n, val] of Object.entries(v)) el.style.setProperty(n, val);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

// ---------- Meldungen ----------
export function friendlyError(error) {
  if (!error) return '';
  if (error.code === '42501' || /row-level security/i.test(error.message)) {
    return 'Das ist gerade nicht erlaubt. Entweder fehlt die Berechtigung oder das Zeitfenster ist vorbei.';
  }
  if (error.code === '23505') return 'Das wurde bereits gespeichert. Die Ansicht ist jetzt aktualisiert.';
  return error.message;
}

let statusTimer;
export function setStatus(msg, isError = false) {
  const el = $('status');
  el.textContent = msg;
  el.classList.toggle('err', isError);
  clearTimeout(statusTimer);
  if (msg && !isError) statusTimer = setTimeout(() => (el.textContent = ''), 4000);
}

// ---------- Zeitzone ----------
const offFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});
function tzOffset(t) {
  const p = Object.fromEntries(offFmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}
// Zeitpunkt (ms) von "dateStr, hour:00 Uhr" in deutscher Zeit
export function zonedEpoch(dateStr, hour = 0) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, hour);
  let t = wall;
  for (let i = 0; i < 3; i++) t = wall - tzOffset(t);
  return t;
}

// "3 Tage 04:12:09"
export function fmtCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(s / 86400);
  const rest = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return days > 0 ? `${days} ${days === 1 ? 'Tag' : 'Tage'} ${rest}` : rest;
}
