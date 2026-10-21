// Seitenleiste: aktuelles bzw. nächstes Event, offene Aufgaben und offene Strafen
import {
  state, today, yesterday, serverNow, isChecker, isOwnEvent, taskOpen,
  confirmStatus, slotStatus, slotCount, canConfirm, canWorkTask,
} from './state.js';
import { load } from './data.js';
import { confirmDay, toggleTask, rollDay, resolvePenalty, deleteEvent } from './actions.js';
import { openEdit } from './event-form.js';
import { DEADLINE_HOUR } from './config.js';
import { $, h, shiftYmd, dayCount, color, fmtDate, fmtStamp, zonedEpoch, fmtCountdown } from './util.js';

let countdownTarget = null;
let countdownFired = false;

export function renderFocus() {
  const box = $('focus');
  const e = state.focusEvent;
  const t = today();
  const parts = [];
  countdownTarget = null;

  if (!e) {
    parts.push(h('section', { class: 'focus-card empty-card' },
      h('p', { class: 'eyebrow', text: 'Aktuelles Event' }),
      h('p', { class: 'empty', text: 'Gerade ist kein Event geplant.' }),
    ));
  } else {
    const current = !!t && e.start_date <= t;
    parts.push(eventCard(e, current));
    if (current) parts.push(openTasks(e));
  }
  parts.push(penaltyList());
  box.replaceChildren(...parts);
  tickCountdown();
}

function eventCard(e, current) {
  const total = dayCount(e.start_date, e.end_date);
  let confirmed = 0;
  for (const k of state.eventChecks.keys()) if (k.startsWith(e.id + '|')) confirmed++;

  const card = h('section', { class: 'focus-card', vars: { '--c': color(e.id) }, 'aria-labelledby': 'focus-title' },
    h('p', { class: 'eyebrow', text: current ? 'Aktuelles Event' : 'Nächstes Event' }),
    h('h3', { id: 'focus-title', text: e.title }),
    e.daily_label ? h('p', { class: 'desc', text: `Täglich: ${e.daily_label}` }) : null,
    h('p', { class: 'meta', text: `${fmtDate(e.start_date)} bis ${fmtDate(e.end_date)} · ${total} ${total === 1 ? 'Tag' : 'Tage'}` }),
  );

  if (current) {
    card.append(
      h('p', { class: 'meta', text: `${confirmed} von ${total} Tagen bestätigt` }),
      h('div', { class: 'bar', 'aria-hidden': 'true' }, h('span', { style: `width:${Math.round((confirmed / total) * 100)}%` })),
    );
  } else {
    countdownTarget = zonedEpoch(e.start_date, 0);
    countdownFired = false;
    card.append(
      h('p', { class: 'countdown-label', text: 'Startet in' }),
      h('p', { class: 'countdown', id: 'countdown', 'aria-label': 'Zeit bis zum Start' }),
    );
  }

  if (isOwnEvent(e)) {
    card.append(h('div', { class: 'item-actions' },
      h('button', { class: 'btn link', text: 'Bearbeiten', onclick: () => openEdit(e) }),
      h('button', { class: 'btn danger-link', text: 'Löschen', 'aria-label': `${e.title} löschen`, onclick: () => deleteEvent(e) }),
    ));
  }
  return card;
}

// Aktualisiert den Countdown jede Sekunde (wird von main.js aufgerufen)
export function tickCountdown() {
  const el = document.getElementById('countdown');
  if (!el || countdownTarget == null || serverNow() == null) return;
  const remain = countdownTarget - serverNow();
  el.textContent = fmtCountdown(remain);
  if (remain <= 0 && !countdownFired) {
    countdownFired = true;
    load();
  }
}

const inRange = (e, ds) => ds && ds >= e.start_date && ds <= e.end_date;
const deadlineText = (ds) => fmtStamp(zonedEpoch(shiftYmd(ds, 1), DEADLINE_HOUR));

function openTasks(e) {
  const t = today();
  const y = yesterday();
  const items = [];

  // Gestern bestätigen
  if (inRange(e, y) && confirmStatus(e, y) === 'open') {
    items.push(h('li', { class: 'item' },
      h('span', { class: 'mark', 'aria-hidden': 'true', text: '○' }),
      h('div', { class: 'body' },
        h('div', { class: 'text', text: e.daily_label || 'Tag bestätigen' }),
        h('div', { class: 'meta', text: `Für gestern (${fmtDate(y)}), nur heute möglich` }),
        canConfirm(y) ? h('button', { class: 'btn small primary', text: 'Bestätigen', disabled: state.acting, onclick: () => confirmDay(e, y, false) }) : null,
      ),
    ));
  }

  // Tagesaufgaben von gestern (bis 15 Uhr) und heute
  for (const ds of [y, t]) {
    if (!inRange(e, ds) || !taskOpen(ds)) continue;
    const when = ds === t ? 'heute' : 'gestern';
    let rollAdded = false;
    for (let s = 1; s <= slotCount(e, ds); s++) {
      const st = slotStatus(e, ds, s);
      if (st.status === 'open') {
        items.push(h('li', { class: 'item' },
          canWorkTask(ds)
            ? h('button', {
              type: 'button', class: 'check', vars: { '--c': color(e.id) },
              'aria-label': `${st.roll.task_text} abhaken`, disabled: state.acting,
              onclick: () => toggleTask(e, ds, s, false),
            })
            : h('span', { class: 'mark', 'aria-hidden': 'true', text: '○' }),
          h('div', { class: 'body' },
            h('div', { class: 'text', text: st.roll.task_text }),
            h('div', { class: 'meta', text: `Aufgabe von ${when} · noch bis ${deadlineText(ds)}` }),
          ),
        ));
      } else if (st.status === 'unrolled' && !rollAdded) {
        rollAdded = true;
        items.push(h('li', { class: 'item' },
          h('span', { class: 'mark', 'aria-hidden': 'true', text: '?' }),
          h('div', { class: 'body' },
            h('div', { class: 'text', text: `Tagesaufgabe für ${when} noch nicht gewürfelt` }),
            h('div', { class: 'meta', text: `Würfeln bis ${deadlineText(ds)}, danach würfelt der Server und es wird zur Strafe` }),
            canWorkTask(ds) ? h('button', { class: 'btn small primary', text: 'Würfeln', disabled: state.acting, onclick: () => rollDay(e, ds) }) : null,
          ),
        ));
      }
    }
  }

  return h('section', { class: 'side-sec', 'aria-labelledby': 'open-title' },
    h('h3', { id: 'open-title', text: 'Offene Aufgaben' }),
    items.length ? h('ul', { class: 'items' }, items) : h('p', { class: 'empty', text: 'Alles erledigt.' }),
  );
}

function penaltyList() {
  const list = state.penalties;
  const focusId = state.focusEvent?.id;
  const items = list.map((p) => h('li', { class: 'item penalty' },
    h('span', { class: 'mark', 'aria-hidden': 'true', text: '!' }),
    h('div', { class: 'body' },
      h('div', { class: 'text', text: p.task_text }),
      h('div', { class: 'meta strong', text: `Unerledigt seit ${fmtDate(p.day)}` }),
      h('div', { class: 'meta', text: `Strafe seit ${fmtStamp(p.penalty_since)}${p.auto_rolled ? ' · automatisch gewürfelt' : ''}` }),
      p.event_id !== focusId ? h('div', { class: 'meta', text: `Event: ${p.event_title}` }) : null,
      isChecker() ? h('button', {
        class: 'btn small', text: 'Nachgeholt', disabled: state.acting,
        'aria-label': `${p.task_text} vom ${fmtDate(p.day)} als nachgeholt markieren`,
        onclick: () => resolvePenalty(p.event_id, p.day, p.slot, false),
      }) : null,
    ),
  ));
  return h('section', { class: 'side-sec', 'aria-labelledby': 'pen-title' },
    h('h3', { id: 'pen-title', text: list.length ? `Offene Strafen (${list.length})` : 'Offene Strafen' }),
    items.length ? h('ul', { class: 'items' }, items) : h('p', { class: 'empty', text: 'Keine offenen Strafen.' }),
  );
}
