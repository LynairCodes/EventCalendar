// Startpunkt: verbindet die Teile und startet das Laden
import { state, isChecker, isCreator, today, timeSlotKey } from './state.js';
import { load, setRenderer } from './data.js';
import { renderGrid, renderDetail, initCalendar } from './calendar.js';
import { renderFocus, tickCountdown } from './focus.js';
import { initEventForm } from './event-form.js';
import { renderAccount, initAccount } from './account.js';
import { $, fmtLong, parseYmd } from './util.js';

function renderAll() {
  renderAccount();
  renderGrid();
  renderFocus();
  $('create-wrap').hidden = !isCreator();
  $('legend-todo').hidden = !isChecker();
  $('server-date').textContent = today() ? `Heute laut Server: ${fmtLong(today())}` : '';
  if (state.detail && $('detail-dialog').open) renderDetail();
}
setRenderer(renderAll);

// Alle "Abbrechen"/"Schließen"-Knöpfe in Dialogen
document.querySelectorAll('dialog [data-close]').forEach((b) =>
  b.addEventListener('click', () => b.closest('dialog').close()));

// Monatsnavigation
function setMonth(y, m) {
  const d = new Date(y, m, 1);
  state.year = d.getFullYear();
  state.month = d.getMonth();
  renderAll();
  load();
}
$('prev').addEventListener('click', () => setMonth(state.year, state.month - 1));
$('next').addEventListener('click', () => setMonth(state.year, state.month + 1));
$('go-today').addEventListener('click', () => {
  const t = today() ? parseYmd(today()) : new Date();
  setMonth(t.getFullYear(), t.getMonth());
});

initCalendar();
initEventForm();
initAccount();

load();

// Jede Sekunde: Countdown weiterzählen. Um Mitternacht und um 15 Uhr neu laden,
// damit Fristen und Strafen sofort stimmen.
let lastSlot = '';
setInterval(() => {
  tickCountdown();
  const k = timeSlotKey();
  if (k && lastSlot && k !== lastSlot) load();
  if (k) lastSlot = k;
}, 1000);
// Zusätzlich alle 5 Minuten und beim Zurückkehren in den Tab auffrischen
setInterval(load, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
