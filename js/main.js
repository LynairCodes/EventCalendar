// Startpunkt: verbindet die Teile und startet das Laden
import { state, isChecker, isCreator } from './state.js';
import { load, setRenderer } from './data.js';
import { renderGrid, renderList, renderDetail, initCalendar } from './calendar.js';
import { initCreateEvent } from './create-event.js';
import { renderAccount, initAccount } from './account.js';
import { $, fmtLong, parseYmd } from './util.js';

function renderAll() {
  renderAccount();
  renderGrid();
  renderList();
  $('create-wrap').hidden = !isCreator();
  $('legend').hidden = !isChecker();
  $('server-date').textContent = state.serverToday ? `Heute laut Server: ${fmtLong(state.serverToday)}` : '';
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
  const t = state.serverToday ? parseYmd(state.serverToday) : new Date();
  setMonth(t.getFullYear(), t.getMonth());
});

initCalendar();
initCreateEvent();
initAccount();

load();
// Serverdatum und Daten regelmäßig auffrischen (z. B. nach Mitternacht)
setInterval(load, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
