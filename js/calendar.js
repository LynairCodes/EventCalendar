// Monatsansicht, Event-Liste und Tagesansicht (bestätigen, würfeln, abhaken)
import { sb, state, gridDays, isChecker, isCreator, today, canConfirm, inTaskWindow, pendingFor } from './state.js';
import { load } from './data.js';
import {
  $, h, ymd, shiftYmd, dayCount, key, color,
  fmtShort, fmtDate, fmtLong, fmtStamp, friendlyError, setStatus,
} from './util.js';

// ---------- Monatsansicht ----------
export function renderGrid() {
  $('month-title').textContent = new Date(state.year, state.month, 1)
    .toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const todayStr = state.serverToday ?? ymd(new Date());
  const frag = document.createDocumentFragment();

  for (const d of gridDays()) {
    const ds = ymd(d);
    const cls = ['cell'];
    if (d.getMonth() !== state.month) cls.push('out');
    if (ds === todayStr) cls.push('today');
    const cell = h('div', { class: cls.join(' ') }, h('div', { class: 'num', text: d.getDate() }));

    for (const e of state.events) {
      if (e.start_date > ds || e.end_date < ds) continue;
      cell.append(chip(e, ds));
    }
    frag.append(cell);
  }
  $('grid').replaceChildren(frag);
}

function chip(e, ds) {
  const done = state.eventChecks.has(key(e.id, ds));
  let badge = null;
  let taskInfo = '';
  if (e.tasks_per_day > 0) {
    const rolls = state.rolls.get(key(e.id, ds)) || [];
    const tdone = rolls.filter((r) => state.taskChecks.has(`${key(e.id, ds)}|${r.slot}`)).length;
    badge = h('span', { class: 'badge', text: `${tdone}/${e.tasks_per_day}` });
    taskInfo = rolls.length ? `, Aufgaben ${tdone} von ${e.tasks_per_day} erledigt` : ', noch nicht gewürfelt';
  }
  const cls = ['chip'];
  if (done) cls.push('done');
  if (pendingFor(e, ds)) cls.push('todo');
  return h('button', {
    type: 'button', class: cls.join(' '), vars: { '--c': color(e.id) },
    'data-event': e.id, 'data-day': ds,
    title: `${e.title}: ${done ? 'bestätigt' : 'offen'}${taskInfo}`,
    'aria-label': `${e.title}, ${fmtDate(ds)}: ${done ? 'bestätigt' : 'offen'}${taskInfo}. Details öffnen`,
  },
    h('span', { class: 'box', 'aria-hidden': 'true', text: done ? '✓' : '' }),
    h('span', { class: 't', text: e.title }),
    badge,
  );
}

// ---------- Event-Liste in der Seitenleiste ----------
export function renderList() {
  const list = $('event-list');
  list.replaceChildren();
  if (!state.events.length) {
    list.append(h('li', { style: 'border:0;padding:0' }, h('p', {
      class: 'empty',
      text: isCreator() ? 'Keine Events in diesem Monat. Leg oben ein neues an.' : 'Keine Events in diesem Monat.',
    })));
    return;
  }
  for (const e of state.events) {
    const total = dayCount(e.start_date, e.end_date);
    let done = 0, rolled = 0, tdone = 0;
    for (const k of state.eventChecks.keys()) if (k.startsWith(e.id + '|')) done++;
    for (const [k, rs] of state.rolls) if (k.startsWith(e.id + '|')) rolled += rs.length;
    for (const k of state.taskChecks.keys()) if (k.startsWith(e.id + '|')) tdone++;

    const meta = [`${fmtShort(e.start_date)} bis ${fmtDate(e.end_date)}`, `${done} von ${total} Tagen bestätigt`];
    if (e.tasks_per_day > 0) meta.push(`${tdone} von ${rolled} gewürfelten Aufgaben erledigt`);

    list.append(h('li', { vars: { '--c': color(e.id) } },
      h('div', { class: 'title', text: e.title }),
      ...meta.map((m) => h('div', { class: 'meta', text: m })),
      h('div', { class: 'bar', 'aria-hidden': 'true' }, h('span', { style: `width:${Math.round((done / total) * 100)}%` })),
      (isCreator() && state.session?.user.id === e.created_by)
        ? h('button', { class: 'btn danger-link', text: 'Event löschen', onclick: () => deleteEvent(e) })
        : null,
    ));
  }
}

async function deleteEvent(e) {
  if (!confirm(`Event „${e.title}“ mit allen Bestätigungen, Würfen und Haken löschen?`)) return;
  const { error } = await sb.from('events').delete().eq('id', e.id);
  if (error) { setStatus('Löschen fehlgeschlagen: ' + friendlyError(error), true); return; }
  setStatus('Event gelöscht.');
  load();
}

// ---------- Tagesansicht ----------
export function renderDetail() {
  if (!state.detail) return;
  const { eventId, day } = state.detail;
  const e = state.events.find((x) => x.id === eventId);
  if (!e) { $('detail-dialog').close(); return; }

  $('detail-body').replaceChildren(
    h('div', { class: 'detail-head', vars: { '--c': color(e.id) } },
      h('h3', { id: 'detail-title', text: e.title }),
      h('p', { text: fmtLong(day) }),
    ),
    confirmSection(e, day),
    e.tasks_per_day > 0 ? taskSection(e, day) : null,
  );
}

function confirmSection(e, day) {
  const check = state.eventChecks.get(key(e.id, day));
  const sec = h('section', { class: 'detail-sec' },
    h('h4', { text: 'Tag bestätigen' }),
    h('div', { class: 'state' },
      h('span', { class: 'dot' + (check ? ' on' : ''), 'aria-hidden': 'true' }),
      h('span', { text: check ? `Bestätigt am ${fmtStamp(check.checked_at)}` : 'Noch nicht bestätigt' }),
    ),
  );
  if (canConfirm(day)) {
    sec.append(h('div', {},
      check
        ? h('button', { class: 'btn', text: 'Bestätigung zurücknehmen', disabled: state.acting, onclick: () => toggleConfirm(e, day, true) })
        : h('button', { class: 'btn primary', text: 'Tag bestätigen', disabled: state.acting, onclick: () => toggleConfirm(e, day, false) }),
    ));
  } else if (isChecker() && today()) {
    const allowed = shiftYmd(day, 1);
    sec.append(h('p', {
      class: 'hint',
      text: allowed > today()
        ? `Bestätigen ist am ${fmtDate(allowed)} möglich, rückwirkend für diesen Tag.`
        : `Bestätigen war nur am ${fmtDate(allowed)} möglich.`,
    }));
  }
  return sec;
}

function taskSection(e, day) {
  const k = key(e.id, day);
  const rolls = state.rolls.get(k) || [];
  const sec = h('section', { class: 'detail-sec' },
    h('h4', { text: e.tasks_per_day === 1 ? 'Tagesaufgabe' : 'Tagesaufgaben' }),
    h('p', { class: 'hint', text: `Würfel: ${e.dice_expr}` }),
  );

  if (rolls.length) {
    const ul = h('ul', { class: 'tasks' });
    for (const r of rolls) {
      const tc = state.taskChecks.get(`${k}|${r.slot}`);
      ul.append(h('li', { class: 'task', vars: { '--c': color(e.id) } },
        h('button', {
          type: 'button', class: 'check' + (tc ? ' on' : ''),
          'aria-pressed': String(!!tc),
          'aria-label': `${r.task_text}: ${tc ? 'erledigt' : 'offen'}`,
          disabled: !inTaskWindow(day) || state.acting,
          text: tc ? '✓' : '',
          onclick: () => toggleTask(e, day, r.slot, !!tc),
        }),
        h('span', { class: 'text', text: r.task_text }),
        h('span', { class: 'roll', text: `Wurf: ${r.detail}, gewürfelt am ${fmtStamp(r.rolled_at)}` }),
        tc ? h('span', { class: 'roll', text: `Erledigt am ${fmtStamp(tc.checked_at)}` }) : null,
      ));
    }
    sec.append(ul);
  }

  if (rolls.length < e.tasks_per_day) {
    if (inTaskWindow(day)) {
      sec.append(
        h('div', {}, h('button', {
          class: 'btn primary', disabled: state.acting, onclick: () => roll(e, day),
          text: e.tasks_per_day === 1 ? 'Aufgabe auswürfeln' : 'Aufgaben auswürfeln',
        })),
        h('p', { class: 'hint', text: 'Der Wurf passiert auf dem Server und wird sofort gespeichert. Er lässt sich nicht wiederholen.' }),
      );
    } else {
      sec.append(h('p', { class: 'hint', text: 'Noch nicht gewürfelt.' }));
      if (isChecker() && today()) {
        sec.append(h('p', {
          class: 'hint',
          text: day > today()
            ? `Würfeln ist am ${fmtDate(day)} oder am Tag danach möglich.`
            : 'Das Zeitfenster zum Würfeln ist vorbei.',
        }));
      }
    }
  } else if (isChecker() && !inTaskWindow(day)) {
    sec.append(h('p', { class: 'hint', text: 'Aufgaben lassen sich nur am Tag selbst oder am Folgetag abhaken.' }));
  }
  return sec;
}

// ---------- Aktionen in der Tagesansicht ----------
async function act(fn) {
  if (state.acting) return;
  state.acting = true;
  $('detail-error').textContent = '';
  renderDetail();
  try {
    const { error } = await fn();
    if (error) $('detail-error').textContent = friendlyError(error);
  } finally {
    state.acting = false;
    await load();
    renderDetail();
  }
}

const toggleConfirm = (e, day, isDone) => act(() => isDone
  ? sb.from('event_checks').delete().eq('event_id', e.id).eq('day', day)
  : sb.from('event_checks').insert({ event_id: e.id, day }));

const toggleTask = (e, day, slot, isDone) => act(() => isDone
  ? sb.from('task_checks').delete().eq('event_id', e.id).eq('day', day).eq('slot', slot)
  : sb.from('task_checks').insert({ event_id: e.id, day, slot }));

const roll = (e, day) => act(() => sb.rpc('roll_tasks', { p_event_id: e.id, p_day: day }));

// ---------- Start ----------
export function initCalendar() {
  $('grid').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button.chip');
    if (!btn) return;
    state.detail = { eventId: Number(btn.dataset.event), day: btn.dataset.day };
    $('detail-error').textContent = '';
    renderDetail();
    $('detail-dialog').showModal();
  });
  $('detail-dialog').addEventListener('close', () => { state.detail = null; });
}
