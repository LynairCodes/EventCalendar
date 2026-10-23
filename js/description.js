// Linke Spalte: Beschreibung des aktuellen bzw. nächsten Events
import { state, today } from './state.js';
import { renderMarkdown } from './markdown.js';
import { $, h, color } from './util.js';

export function renderDescription() {
  const box = $('desc-col');
  const e = state.focusEvent;
  if (!e) { box.replaceChildren(); return; }
  const current = !!today() && e.start_date <= today();
  box.replaceChildren(
    h('section', { class: 'desc-card', vars: { '--c': color(e.id) }, 'aria-labelledby': 'desc-title' },
      h('p', { class: 'eyebrow', text: current ? 'Über das aktuelle Event' : 'Über das nächste Event' }),
      h('h2', { id: 'desc-title', text: e.title }),
      e.description
        ? renderMarkdown(e.description)
        : h('p', { class: 'empty', text: 'Für dieses Event gibt es keine Beschreibung.' }),
    ),
  );
}
