// Symbole und Texte für die Status-Anzeige
export const CONFIRM = {
  done: { icon: '✓', label: 'bestätigt' },
  open: { icon: '○', label: 'heute bestätigen' },
  waiting: { icon: '○', label: 'offen' },
  missed: { icon: '✗', label: 'nicht bestätigt' },
};

export const TASK = {
  done: { icon: '✓', label: 'erledigt' },
  late: { icon: '↺', label: 'als Strafe nachgeholt' },
  open: { icon: '○', label: 'offen' },
  penalty: { icon: '!', label: 'Strafe' },
  unrolled: { icon: '?', label: 'noch nicht gewürfelt' },
  missed: { icon: '–', label: 'nicht gewürfelt' },
  upcoming: { icon: '◇', label: 'vorab gewürfelt' },
  future: { icon: '', label: '' },
};
