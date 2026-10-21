// Dialog "Neues Event" / "Event bearbeiten": Zeitraum, Würfelformel, Verteilung und Aufgabenliste
import { sb, state } from './state.js';
import { load } from './data.js';
import { Dice } from './dice.js';
import { $, h, ymd, shiftYmd, parseYmd, dayCount, fmtPct, fmtDate, friendlyError, setStatus } from './util.js';

let cf;
let distOpen = false;
let editing = null; // Event, das gerade bearbeitet wird (null = neues Event)

// [1,2,3,5,7,8] -> "1-3, 5, 7-8"
function formatNumbers(nums) {
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i]}-${sorted[j]}` : String(sorted[i]));
    i = j;
  }
  return parts.join(', ');
}

function taskRow(numbers = '', text = '') {
  const row = h('div', { class: 'task-row' },
    h('input', { class: 'nums', 'aria-label': 'Würfelergebnisse für diese Aufgabe', placeholder: 'z. B. 1-2', value: numbers, autocomplete: 'off' }),
    h('input', { class: 'txt', 'aria-label': 'Aufgabe', placeholder: 'Aufgabe', maxlength: '300', value: text, autocomplete: 'off' }),
    h('span', { class: 'prob' }),
    h('button', { type: 'button', class: 'btn icon', 'aria-label': 'Aufgabe entfernen', text: '×', onclick: () => { row.remove(); updateDiceUI(); } }),
  );
  return row;
}

function setMode(event) {
  editing = event;
  cf.reset();
  $('create-error').textContent = '';
  distOpen = false;
  $('create-title').textContent = event ? 'Event bearbeiten' : 'Neues Event';
  cf.querySelector('button[type=submit]').textContent = event ? 'Änderungen speichern' : 'Event anlegen';
  $('edit-note').hidden = !event;
}

// Textfeld nur zeigen, wenn die tägliche Bestätigung aktiv ist
function syncDailyConfirm() {
  $('daily-label-wrap').hidden = !cf.dailyconfirm.checked;
}

function openCreate() {
  setMode(null);
  syncDailyConfirm();
  cf.start.value = state.serverToday ?? ymd(new Date());
  cf.end.value = shiftYmd(cf.start.value, 6);
  cf.formula.value = '1d6';
  $('task-rows').replaceChildren(taskRow());
  updateDiceUI();
  $('create-dialog').showModal();
}

export async function openEdit(e) {
  const { data: tasks, error } = await sb
    .from('event_tasks')
    .select('text, numbers')
    .eq('event_id', e.id)
    .order('id');
  if (error) { setStatus('Aufgaben konnten nicht geladen werden: ' + friendlyError(error), true); return; }

  setMode(e);
  cf.evtitle.value = e.title;
  cf.dailyconfirm.checked = !!e.daily_confirm;
  cf.dailylabel.value = e.daily_label || '';
  syncDailyConfirm();
  cf.start.value = e.start_date;
  cf.end.value = e.end_date;
  cf.tpd.value = String(e.tasks_per_day);
  cf.formula.value = e.dice_expr || '1d6';
  const rows = tasks.map((t) => taskRow(formatNumbers(t.numbers), t.text));
  $('task-rows').replaceChildren(...(rows.length ? rows : [taskRow()]));
  updateDiceUI();
  $('create-dialog').showModal();
}

// Wie viele bestätigte oder gewürfelte Tage fallen durch den neuen Zeitraum weg?
function lostDays(e, start, end) {
  const days = new Set();
  const prefix = e.id + '|';
  const collect = (k) => {
    if (!k.startsWith(prefix)) return;
    const day = k.split('|')[1];
    if (day < start || day > end) days.add(day);
  };
  for (const k of state.eventChecks.keys()) collect(k);
  for (const k of state.rolls.keys()) collect(k);
  return [...days].sort();
}

function renderDist(dist) {
  const max = Math.max(...dist.p);
  const showPct = dist.p.length <= 16;
  const step = Math.ceil(dist.p.length / 20);
  const bars = h('div', {
    class: 'bars', role: 'img',
    'aria-label': 'Verteilung der Würfelergebnisse: ' + dist.p.map((p, i) => `${dist.lo + i}: ${fmtPct(p)}`).join(', '),
  });
  const axis = h('div', { class: 'axis', 'aria-hidden': 'true' });
  dist.p.forEach((p, i) => {
    const v = dist.lo + i;
    bars.append(h('div', { class: 'col', title: `${v}: ${fmtPct(p)}` },
      showPct ? h('span', { class: 'pct', text: fmtPct(p) }) : null,
      h('span', { class: 'fill', style: `height:${(p / max) * (showPct ? 82 : 100)}%` }),
    ));
    axis.append(h('span', { text: i % step === 0 ? v : '' }));
  });
  $('dist').replaceChildren(bars, axis);
}

// Prüft Formel und Aufgabenliste und aktualisiert die Anzeige.
// Rückgabe: { ok, ast, tasks } oder { ok: false, error }
function updateDiceUI() {
  const tpd = Number(cf.tpd.value);
  $('dice-set').hidden = tpd === 0;
  $('toggle-dist').setAttribute('aria-expanded', String(distOpen));
  $('toggle-dist').textContent = distOpen ? 'Verteilung ausblenden' : 'Verteilung anzeigen';
  const info = $('formula-info');
  const cov = $('coverage');
  const rows = [...$('task-rows').children];

  let ast, dist;
  try {
    ast = Dice.parse(cf.formula.value);
    dist = Dice.distribution(ast);
    cf.formula.setAttribute('aria-invalid', 'false');
  } catch (err) {
    cf.formula.setAttribute('aria-invalid', 'true');
    info.textContent = err.message;
    info.className = 'error';
    $('dist').hidden = true;
    cov.textContent = '';
    rows.forEach((r) => (r.querySelector('.prob').textContent = ''));
    return { ok: false, error: 'Die Würfelformel ist ungültig: ' + err.message };
  }

  const lo = dist.lo;
  const hi = dist.lo + dist.p.length - 1;
  const mean = dist.p.reduce((acc, p, i) => acc + p * (lo + i), 0);
  info.className = 'hint';
  info.textContent = `Mögliche Ergebnisse: ${lo} bis ${hi}, im Schnitt ${mean.toLocaleString('de-DE', { maximumFractionDigits: 2 })}`;
  $('dist').hidden = !distOpen;
  if (distOpen) renderDist(dist);

  const count = new Map();
  const tasks = [];
  let rowError = null;
  for (const r of rows) {
    const numsEl = r.querySelector('.nums');
    const text = r.querySelector('.txt').value.trim();
    const probEl = r.querySelector('.prob');
    const nStr = numsEl.value.trim();
    numsEl.setAttribute('aria-invalid', 'false');
    probEl.textContent = '';
    if (!nStr && !text) continue;
    let nums;
    try {
      nums = [...new Set(Dice.parseNumbers(nStr))];
      if (!nums.length) throw new Error('Bitte mindestens ein Ergebnis eintragen.');
    } catch (err) {
      numsEl.setAttribute('aria-invalid', 'true');
      rowError ??= err.message;
      continue;
    }
    if (!text) rowError ??= 'Jede Aufgabe braucht einen Text.';
    let p = 0;
    for (const n of nums) {
      count.set(n, (count.get(n) || 0) + 1);
      if (n >= lo && n <= hi) p += dist.p[n - lo];
    }
    probEl.textContent = fmtPct(p);
    tasks.push({ text, numbers: nums });
  }

  const missing = [], doubled = [], outside = [];
  for (let v = lo; v <= hi; v++) {
    const c = count.get(v) || 0;
    if (c === 0) missing.push(v);
    if (c > 1) doubled.push(v);
  }
  for (const n of count.keys()) if (n < lo || n > hi) outside.push(n);
  outside.sort((a, b) => a - b);

  const problems = [];
  if (rowError) problems.push(rowError);
  if (missing.length) problems.push(`Ohne Aufgabe: ${missing.join(', ')}.`);
  if (doubled.length) problems.push(`Mehrfach vergeben: ${doubled.join(', ')}.`);
  if (outside.length) problems.push(`Kann nie gewürfelt werden: ${outside.join(', ')}.`);
  if (!tasks.length && !rowError) problems.unshift('Noch keine Aufgaben eingetragen.');

  if (problems.length) {
    cov.className = 'error';
    cov.textContent = problems.join(' ');
    return { ok: false, error: problems.join(' ') };
  }
  cov.className = 'okmsg';
  cov.textContent = `Alle Ergebnisse von ${lo} bis ${hi} haben genau eine Aufgabe.`;
  return { ok: true, ast, tasks };
}

async function submit(ev) {
  ev.preventDefault();
  const errEl = $('create-error');
  errEl.textContent = '';
  const title = cf.evtitle.value.trim();
  const dailyConfirm = cf.dailyconfirm.checked;
  const dailyLabel = cf.dailylabel.value.trim();
  const start = cf.start.value;
  const end = cf.end.value;
  const tpd = Number(cf.tpd.value);
  if (!title) { errEl.textContent = 'Gib einen Titel ein.'; cf.evtitle.focus(); return; }
  if (!start || !end) { errEl.textContent = 'Wähle Start- und Enddatum.'; return; }
  if (end < start) { errEl.textContent = 'Das Enddatum liegt vor dem Startdatum.'; return; }
  if (dayCount(start, end) > 367) { errEl.textContent = 'Ein Event darf höchstens ein Jahr dauern.'; return; }

  const payload = {
    p_title: title, p_daily_confirm: dailyConfirm, p_daily_label: dailyLabel || null, p_start: start, p_end: end, p_tasks_per_day: tpd,
    p_dice_expr: null, p_dice_ast: null, p_tasks: [],
  };
  if (tpd > 0) {
    const r = updateDiceUI();
    if (!r.ok) { errEl.textContent = r.error; return; }
    payload.p_dice_expr = cf.formula.value.trim();
    payload.p_dice_ast = r.ast;
    payload.p_tasks = r.tasks;
  }

  if (editing) {
    const lost = lostDays(editing, start, end);
    if (lost.length && !confirm(
      `Durch den neuen Zeitraum fallen ${lost.length} Tag(e) mit Bestätigungen oder Würfen weg `
      + `(${lost.map(fmtDate).join(', ')}). Diese Daten werden gelöscht. Fortfahren?`,
    )) return;
  }

  const btn = cf.querySelector('button[type=submit]');
  btn.disabled = true;
  const { error } = editing
    ? await sb.rpc('update_event', { p_event_id: editing.id, ...payload })
    : await sb.rpc('create_event', payload);
  btn.disabled = false;
  if (error) {
    errEl.textContent = (editing ? 'Änderungen konnten nicht gespeichert werden: ' : 'Event konnte nicht angelegt werden: ')
      + friendlyError(error);
    return;
  }

  $('create-dialog').close();
  const s = parseYmd(start);
  state.year = s.getFullYear();
  state.month = s.getMonth();
  setStatus(editing ? 'Änderungen gespeichert.' : 'Event angelegt.');
  editing = null;
  load();
}

export function initEventForm() {
  cf = $('create-form');
  cf.addEventListener('input', (ev) => {
    if (ev.target.closest('#dice-set') || ev.target === cf.tpd) updateDiceUI();
  });
  cf.tpd.addEventListener('change', updateDiceUI);
  cf.dailyconfirm.addEventListener('change', () => {
    syncDailyConfirm();
    if (cf.dailyconfirm.checked) cf.dailylabel.focus();
  });
  cf.addEventListener('submit', submit);

  $('toggle-dist').addEventListener('click', () => { distOpen = !distOpen; updateDiceUI(); });

  $('add-task').addEventListener('click', () => {
    const row = taskRow();
    $('task-rows').append(row);
    row.querySelector('.nums').focus();
    updateDiceUI();
  });

  $('fill-tasks').addEventListener('click', () => {
    let ast;
    try { ast = Dice.parse(cf.formula.value); } catch { updateDiceUI(); return; }
    const [lo, hi] = Dice.range(ast);
    const hasText = [...$('task-rows').querySelectorAll('.txt')].some((i) => i.value.trim());
    if (hasText && !confirm('Die bisherigen Aufgaben werden ersetzt. Fortfahren?')) return;
    const rows = [];
    for (let v = lo; v <= hi; v++) rows.push(taskRow(String(v), ''));
    $('task-rows').replaceChildren(...rows);
    rows[0]?.querySelector('.txt').focus();
    updateDiceUI();
  });

  $('open-create').addEventListener('click', openCreate);
  $('create-dialog').addEventListener('close', () => { editing = null; });
}
