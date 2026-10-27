// Anmelden, Abmelden und Rechte des angemeldeten Accounts.
// Passwort und Anzeigename werden auf der Einstellungsseite geändert.
import { sb, state } from './state.js';
import { render } from './data.js';
import { LOGIN_DOMAIN } from './config.js';
import { $, h, setStatus } from './util.js';

export const displayName = () =>
  state.member?.display_name || state.member?.username || state.session?.user.email.split('@')[0] || '';

export function renderAccount() {
  const box = $('account');
  box.replaceChildren();
  if (state.session) {
    box.append(
      h('span', {}, 'Angemeldet als ', h('strong', { text: displayName() })),
      h('a', { class: 'btn', href: 'einstellungen.html', text: 'Einstellungen' }),
      h('button', { class: 'btn', text: 'Abmelden', onclick: logout }),
    );
  } else {
    box.append(h('button', {
      class: 'btn', text: 'Anmelden',
      onclick: () => { $('login-error').textContent = ''; $('login-dialog').showModal(); },
    }));
  }
}

async function logout() {
  await sb.auth.signOut();
  setStatus('Abgemeldet.');
}

// Benutzername oder komplette Adresse -> Login-Adresse
export function loginEmail(input) {
  const v = input.trim().toLowerCase();
  if (v.includes('@')) return v;
  if (!/^[a-z0-9._-]{2,40}$/.test(v)) return null;
  return `${v}@${LOGIN_DOMAIN}`;
}

async function login(ev) {
  ev.preventDefault();
  const f = ev.target;
  const errEl = $('login-error');
  errEl.textContent = '';
  const email = loginEmail(f.username.value);
  if (!email) {
    errEl.textContent = 'Der Benutzername darf keine Leerzeichen, Umlaute oder Sonderzeichen außer . - _ enthalten.';
    return;
  }
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email, password: f.password.value });
  btn.disabled = false;
  if (error) {
    errEl.textContent = /invalid login/i.test(error.message)
      ? 'Benutzername oder Passwort stimmt nicht.'
      : 'Anmeldung fehlgeschlagen: ' + error.message;
    return;
  }
  f.reset();
  $('login-dialog').close();
  setStatus('Angemeldet.');
}

async function refreshMember() {
  if (!state.session) { state.member = null; render(); return; }
  const { data, error } = await sb
    .from('members')
    .select('username, display_name, can_create_events, can_check')
    .eq('user_id', state.session.user.id)
    .maybeSingle();
  if (error) setStatus('Rechte konnten nicht geladen werden: ' + error.message, true);
  state.member = data ?? null;
  render();
}

export function initAccount() {
  $('login-form').addEventListener('submit', login);
  sb.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    setTimeout(refreshMember, 0); // Supabase-Aufrufe nicht direkt im Callback
  });
}
