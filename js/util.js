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
