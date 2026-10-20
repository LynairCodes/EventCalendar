// Anmelden, Abmelden, Passwort ändern und Rechte des angemeldeten Accounts
import { sb, state } from './state.js';
import { render } from './data.js';
import { LOGIN_DOMAIN, MIN_PASSWORD_LENGTH } from './config.js';
import { $, h, setStatus } from './util.js';

export function renderAccount() {
  const box = $('account');
  box.replaceChildren();
  if (state.session) {
    const name = state.member?.username ?? state.session.user.email.split('@')[0];
    const role = state.member?.can_create_events ? 'legt Events an'
      : state.member?.can_check ? 'bestätigt und würfelt' : 'ohne Rechte';
    box.append(
      h('span', {}, 'Angemeldet als ', h('strong', { text: name }), ` (${role})`),
      h('button', { class: 'btn', text: 'Passwort ändern', onclick: openPasswordDialog }),
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

// ---------- Anmelden ----------
async function login(ev) {
  ev.preventDefault();
  const f = ev.target;
  const errEl = $('login-error');
  errEl.textContent = '';
  const input = f.username.value.trim().toLowerCase();
  let email;
  if (input.includes('@')) {
    email = input;
  } else {
    if (!/^[a-z0-9._-]{2,40}$/.test(input)) {
      errEl.textContent = 'Der Benutzername darf keine Leerzeichen, Umlaute oder Sonderzeichen außer . - _ enthalten.';
      return;
    }
    email = `${input}@${LOGIN_DOMAIN}`;
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

// ---------- Passwort ändern ----------
function openPasswordDialog() {
  const f = $('password-form');
  f.reset();
  $('password-error').textContent = '';
  $('password-dialog').showModal();
}

async function changePassword(ev) {
  ev.preventDefault();
  const f = ev.target;
  const errEl = $('password-error');
  errEl.textContent = '';
  const current = f.current.value;
  const next = f.next.value;
  const repeat = f.repeat.value;

  if (next.length < MIN_PASSWORD_LENGTH) {
    errEl.textContent = `Das neue Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`;
    f.next.focus();
    return;
  }
  if (next !== repeat) {
    errEl.textContent = 'Die beiden neuen Passwörter stimmen nicht überein.';
    f.repeat.focus();
    return;
  }
  if (next === current) {
    errEl.textContent = 'Das neue Passwort muss sich vom aktuellen unterscheiden.';
    return;
  }

  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    // Erst das aktuelle Passwort prüfen, damit niemand an einem offenen Gerät
    // einfach das Passwort ändern kann.
    const { error: checkError } = await sb.auth.signInWithPassword({
      email: state.session.user.email,
      password: current,
    });
    if (checkError) {
      errEl.textContent = 'Das aktuelle Passwort stimmt nicht.';
      f.current.focus();
      return;
    }
    const { error } = await sb.auth.updateUser({ password: next });
    if (error) {
      errEl.textContent = /different/i.test(error.message)
        ? 'Das neue Passwort muss sich vom aktuellen unterscheiden.'
        : /weak|short|characters/i.test(error.message)
          ? 'Das neue Passwort ist zu schwach. Nimm ein längeres oder eines mit mehr verschiedenen Zeichen.'
          : 'Passwort konnte nicht geändert werden: ' + error.message;
      return;
    }
    f.reset();
    $('password-dialog').close();
    setStatus('Passwort geändert.');
  } finally {
    btn.disabled = false;
  }
}

// ---------- Rechte laden ----------
async function refreshMember() {
  if (!state.session) { state.member = null; render(); return; }
  const { data, error } = await sb
    .from('members')
    .select('username, can_create_events, can_check')
    .eq('user_id', state.session.user.id)
    .maybeSingle();
  if (error) setStatus('Rechte konnten nicht geladen werden: ' + error.message, true);
  state.member = data ?? null;
  render();
}

export function initAccount() {
  $('login-form').addEventListener('submit', login);
  $('password-form').addEventListener('submit', changePassword);
  sb.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    setTimeout(refreshMember, 0); // Supabase-Aufrufe nicht direkt im Callback
  });
}
