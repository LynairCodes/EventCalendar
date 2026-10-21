// Monatsansicht und Tagesansicht
import {
  state, gridDays, today, isChecker, isOwnEvent, findEvent,
  slotStatus, slotCount, canConfirm, canWorkTask, pendingFor, deadlinePassed, berlinDate,
} from './state.js';
import { confirmDay, toggleTask, rollDay, resolvePenalty, deleteEvent } from './actions.js';
import { openEdit } from './event-form.js';
import { TASK } from './status.js';
import { DEADLINE_HOUR } from './config.js';
import { $, h, ymd, shiftYmd, color, fmtDate, fmtLong, fmtStamp, zonedEpoch } from './util.js';

// ---------- Monatsansicht ----------
export function renderGrid() {
  $('month-title').textContent = new Date(state.year, state.month, 1)
    .toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const todayStr = today() ?? ymd(new Date());
  const frag = document.createDocumentFragment();

  for (const d of gridDays()) {
    const ds = ymd(d);
    const cls = ['cell'];
    if (d.getMonth() !== state.month) cls.push('out');
    if (ds === todayStr) cls.push('today');
    const cell = h('div', { class: cls.join(' ') }, h('div', { class: 'num', text: d.getDate() }));
    for (const e of state.events) {
      if (e.start_date > ds || e.end_date < ds) continue;
      cell.append(eventBlock(e, ds));
    }
    frag.append(cell);
  }
  $('grid').replaceChildren(frag);
}

const line = (icon, text, cls) => h('span', { class: `ev-line ${cls}` },
  h('span', { class: 'ic', text: icon }),
  h('span', { class: 'tx', text }),
);

function eventBlock(e, ds) {
  const future = !!today() && ds > today();
  const summary = [`${e.title}, ${fmtDate(ds)}`];
  const lines = [];

  // Die Tagesbestätigung steht nur in der Tagesansicht, hier nur die Aufgaben
  if (!future) {
    for (let s = 1; s <= slotCount(e, ds); s++) {
      const st = slotStatus(e, ds, s);
      const text = st.roll ? st.roll.task_text : TASK[st.status].label;
      lines.push(line(TASK[st.status].icon, text, `s-${st.status}`));
      summary.push(`Aufgabe ${s}: ${st.roll ? `${st.roll.task_text}, ` : ''}${TASK[st.status].label}`);
    }
  }

  const cls = ['ev'];
  if (future) cls.push('future');
  if (pendingFor(e, ds)) cls.push('todo');
  return h('button', {
    type: 'button', class: cls.join(' '), vars: { '--c': color(e.id) },
    'data-event': e.id, 'data-day': ds,
    'aria-label': summary.join('. ') + '. Details öffnen',
  },
    h('span', { class: 'ev-title', 'aria-hidden': 'true', text: e.title }),
    h('span', { class: 'ev-lines', 'aria-hidden': 'true' }, lines),
  );
}

// ---------- Tagesansicht ----------
export function renderDetail() {
  if (!state.detail) return;
  const { eventId, day } = state.detail;
  const e = findEvent(eventId);
  if (!e) { $('detail-dialog').close(); return; }

  $('detail-body').replaceChildren(
    h('div', { class: 'detail-head', vars: { '--c': color(e.id) } },
      h('h3', { id: 'detail-title', text: e.title }),
      h('p', { text: fmtLong(day) }),
      isOwnEvent(e) ? h('div', { class: 'item-actions' },
        h('button', { class: 'btn link', text: 'Event bearbeiten', onclick: () => { $('detail-dialog').close(); openEdit(e); } }),
        h('button', { class: 'btn danger-link', text: 'Event löschen', onclick: () => deleteEvent(e) }),
      ) : null,
    ),
    confirmSection(e, day),
    slotCount(e, day) > 0 ? taskSection(e, day) : null,
  );
}

function confirmSection(e, day) {
  const check = state.eventChecks.get(`${e.id}|${day}`);
  const label = e.daily_label || 'Tag bestätigen';
  const sec = h('section', { class: 'detail-sec' },
    h('h4', { text: label }),
    h('div', { class: 'state' },
      h('span', { class: 'dot' + (check ? ' on' : ''), 'aria-hidden': 'true' }),
      h('span', { text: check ? `Bestätigt am ${fmtStamp(check.checked_at)}` : 'Noch nicht bestätigt' }),
    ),
  );
  if (canConfirm(day)) {
    sec.append(h('div', {},
      check
        ? h('button', { class: 'btn', text: 'Bestätigung zurücknehmen', disabled: state.acting, onclick: () => confirmDay(e, day, true) })
        : h('button', { class: 'btn primary', text: 'Bestätigen', disabled: state.acting, onclick: () => confirmDay(e, day, false) }),
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
  const n = slotCount(e, day);
  const deadline = fmtStamp(zonedEpoch(shiftYmd(day, 1), DEADLINE_HOUR));
  const sec = h('section', { class: 'detail-sec' },
    h('h4', { text: n === 1 ? 'Tagesaufgabe' : 'Tagesaufgaben' }),
    e.dice_expr ? h('p', { class: 'hint', text: `Würfel: ${e.dice_expr}` }) : null,
  );
  const ul = h('ul', { class: 'tasks' });
  let needsRoll = false;

  for (let s = 1; s <= n; s++) {
    const st = slotStatus(e, day, s);
    if (!st.roll) {
      if (st.status === 'unrolled') needsRoll = true;
      continue;
    }
    const r = st.roll;
    const canToggle = canWorkTask(day) && (st.status === 'open' || st.status === 'done');
    const info = [];
    info.push(`Wurf: ${r.detail}, ${r.rolled_by ? 'gewürfelt' : 'automatisch gewürfelt'} am ${fmtStamp(r.rolled_at)}`);
    if (st.status === 'done') info.push(`Erledigt am ${fmtStamp(st.check.checked_at)}`);
    if (st.status === 'open') info.push(`Abhaken möglich bis ${deadline}`);
    if (st.status === 'penalty') info.push(`Strafe seit ${deadline}`);
    if (st.status === 'late') info.push(`Strafe seit ${deadline}, nachgeholt am ${fmtStamp(st.late.done_at)}`);

    let action = null;
    if (isChecker() && st.status === 'penalty') {
      action = h('button', { class: 'btn small', text: 'Als nachgeholt markieren', disabled: state.acting, onclick: () => resolvePenalty(e.id, day, s, false) });
    } else if (isChecker() && st.status === 'late' && berlinDate(Date.parse(st.late.done_at)) === today()) {
      action = h('button', { class: 'btn link', text: 'Nachholen zurücknehmen', disabled: state.acting, onclick: () => resolvePenalty(e.id, day, s, true) });
    }

    ul.append(h('li', { class: `task t-${st.status}`, vars: { '--c': color(e.id) } },
      h('button', {
        type: 'button', class: 'check' + (st.status === 'done' || st.status === 'late' ? ' on' : ''),
        'aria-pressed': String(st.status === 'done'),
        'aria-label': `${r.task_text}: ${TASK[st.status].label}`,
        disabled: !canToggle || state.acting,
        text: TASK[st.status].icon,
        onclick: () => toggleTask(e, day, s, st.status === 'done'),
      }),
      h('span', { class: 'text' }, r.task_text, st.status === 'penalty' ? h('span', { class: 'tag-penalty', text: 'Strafe' }) : null),
      ...info.map((t) => h('span', { class: 'roll', text: t })),
      action ? h('span', { class: 'roll' }, action) : null,
    ));
  }
  if (ul.children.length) sec.append(ul);

  if (needsRoll && canWorkTask(day)) {
    sec.append(
      h('div', {}, h('button', {
        class: 'btn primary', disabled: state.acting, onclick: () => rollDay(e, day),
        text: n === 1 ? 'Aufgabe auswürfeln' : 'Aufgaben auswürfeln',
      })),
      h('p', { class: 'hint', text: `Der Wurf passiert auf dem Server und lässt sich nicht wiederholen. Würfeln und Abhaken ist bis ${deadline} möglich, danach wird es zur Strafe.` }),
    );
  } else if (needsRoll) {
    sec.append(h('p', { class: 'hint', text: 'Noch nicht gewürfelt.' }));
  } else if (!ul.children.length && !deadlinePassed(day)) {
    sec.append(h('p', { class: 'hint', text: `Würfeln ist ab ${fmtDate(day)} bis ${deadline} möglich.` }));
  }
  return sec;
}

// ---------- Start ----------
export function initCalendar() {
  $('grid').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button.ev');
    if (!btn) return;
    state.detail = { eventId: Number(btn.dataset.event), day: btn.dataset.day };
    $('detail-error').textContent = '';
    renderDetail();
    $('detail-dialog').showModal();
  });
  $('detail-dialog').addEventListener('close', () => { state.detail = null; });
}