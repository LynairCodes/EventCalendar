// Markdown sicher in HTML umwandeln (für die Event-Beschreibung)
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@15/+esm';
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3/+esm';

marked.setOptions({ gfm: true, breaks: true });

// Links öffnen in neuem Tab, ohne Zugriff auf diese Seite
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

// Gibt ein Element mit dem bereinigten HTML zurück
export function renderMarkdown(md, className = 'md') {
  const el = document.createElement('div');
  el.className = className;
  el.innerHTML = DOMPurify.sanitize(marked.parse(md || ''), {
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe'],
    FORBID_ATTR: ['style'],
  });
  return el;
}
