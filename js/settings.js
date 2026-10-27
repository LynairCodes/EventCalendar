// Einstellungsseite: Anzeigename, Würfel-Freigabe, Passwort
import { sb, state } from './state.js';
import { MIN_PASSWORD_LENGTH } from './config.js';
import { $, h, setStatus, fmtStamp } from './util.js';

let member = null;

function renderHeader() {
  const box = $('account');
  box.replaceChildren();
  if (!state.session) return;
  const name = member?.display_name || member?.username || state.session.user.email.split('@')[0];
  box.append(
    h('span', {}, 'Angemeldet als ', h('strong', { text: name })),
    h('button', {
      class: 'btn', text: 'Abmelden',
      onclick: async () => { await sb.auth.signOut(); location.href = 'index.html'; },
    }),
  );
}

async function loadMember() {
  const { data, error } = await sb
    .from('members')
    .select('username, display_name, can_create_events, can_check')
    .eq('user_id', state.session.user.id)
    .maybeSingle();
  if (error) setStatus('Profil konnte nicht geladen werden: ' + error.message, true);
  member = data ?? null;
}

// ---------- Profil ----------
function fillProfile() {
  $('login-name').textContent = state.session.user.email.split('@')[0];
  $('name-form').displayname.value = member?.display_name || '';
  $('name-form').hidden = !member;
}

async function saveName(ev) {
  ev.preventDefault();
  const f = ev.target;
  const errEl = $('name-error');
  errEl.textContent = '';
  const name = f.displayname.value.trim();
  if (name.length > 40) { errEl.textContent = 'Der Anzeigename darf höchstens 40 Zeichen haben.'; return; }
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true;
  const { error } = await sb.rpc('set_display_name', { p_name: name || null });
  btn.disabled = false;
  if (error) { errEl.textContent = 'Speichern fehlgeschlagen: ' + error.message; return; }
  await loadMember();
  fillProfile();
  renderHeader();
  setStatus('Anzeigename gespeichert.');
}

// ---------- Rechte ----------
async function renderRights() {
  const card = $('rights-card');
  const body = $('rights-body');
  if (!member || (!member.can_check && !member.can_create_events)) { card.hidden = true; return; }

  const [setRes, dirRes] = await Promise.all([
    sb.from('app_settings').select('creator_can_roll, updated_at').eq('id', 1).maybeSingle(),
    sb.rpc('member_directory'),
  ]);
  if (setRes.error || dirRes.error) {
    $('rights-error').textContent = 'Rechte konnten nicht geladen werden: ' + (setRes.error || dirRes.error).message;
    card.hidden = false;
    return;
  }
  const allowed = !!setRes.data?.creator_can_roll;
  const creator = dirRes.data.find((m) => m.can_create_events)?.name ?? 'Die Event-Erstellerin';
  const checker = dirRes.data.find((m) => m.can_check)?.name ?? 'die andere Person';
  const changed = setRes.data?.updated_at ? `Zuletzt geändert am ${fmtStamp(setRes.data.updated_at)}.` : '';

  if (member.can_check) {
    const input = h('input', { type: 'checkbox', role: 'switch', id: 'roll-switch', 'aria-describedby': 'roll-help' });
    input.checked = allowed;
    input.addEventListener('change', () => saveRight(input));
    body.replaceChildren(
      h('label', { class: 'checkline', for: 'roll-switch' }, input, h('span', { text: `${creator} darf Tagesaufgaben auswürfeln` })),
      h('p', { id: 'roll-help', class: 'hint', text: `Wenn erlaubt, kann ${creator} für jeden Tag ihrer Events würfeln, auch vorab und rückwirkend. Bereits gewürfelte Aufgaben ändern sich dadurch nie. ${changed}` }),
    );
  } else {
    body.replaceChildren(
      h('div', { class: 'state' },
        h('span', { class: 'dot' + (allowed ? ' on' : ''), 'aria-hidden': 'true' }),
        h('span', { text: allowed ? 'Du darfst Tagesaufgaben auswürfeln.' : 'Du darfst gerade keine Tagesaufgaben auswürfeln.' }),
      ),
      h('p', { class: 'hint', text: `Diese Freigabe kann nur ${checker} ändern. ${changed}` }),
    );
  }
  card.hidden = false;
}

async function saveRight(input) {
  $('rights-error').textContent = '';
  input.disabled = true;
  const { error } = await sb.rpc('set_creator_can_roll', { p_allowed: input.checked });
  input.disabled = false;
  if (error) {
    input.checked = !input.checked;
    $('rights-error').textContent = 'Speichern fehlgeschlagen: ' + error.message;
    return;
  }
  setStatus(input.checked ? 'Würfeln freigegeben.' : 'Freigabe entzogen.');
  renderRights();
}

// ---------- Passwort ----------
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
    // Erst das aktuelle Passwort prüfen
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
    setStatus('Passwort geändert.');
  } finally {
    btn.disabled = false;
  }
}

// ---------- Start ----------
async function init() {
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  if (!state.session) { $('need-login').hidden = false; return; }

  await loadMember();
  renderHeader();
  fillProfile();
  $('password-form').user.value = state.session.user.email;
  $('settings-body').hidden = false;
  renderRights();

  $('name-form').addEventListener('submit', saveName);
  $('password-form').addEventListener('submit', changePassword);

  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') location.href = 'index.html';
  });
}
init();
