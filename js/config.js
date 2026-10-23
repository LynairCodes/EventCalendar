// Einstellungen. Der "publishable" Key ist öffentlich und darf hier stehen.
// Den "secret"/"service_role"-Key NIEMALS hier eintragen!
export const SUPABASE_URL = 'https://huutvjodxpkmiraxmrbo.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_-2ZJwuEUZtd2HkOtbWrV0g_9FTrbaCm';

// Aus dem Benutzernamen "petra" wird intern "petra@lynair.com"
export const LOGIN_DOMAIN = 'lynair.com';

export const TZ = 'Europe/Berlin';
export const MIN_PASSWORD_LENGTH = 8;
// Event-Farben: Pink und Lila im Wechsel (Event-Nummer bestimmt die Farbe)
export const COLORS = ['#E64980', '#9C36B5', '#C2255C', '#7048E8', '#F06595', '#AE3EC9', '#D6336C', '#845EF7'];

// Ab dieser Uhrzeit (Folgetag, deutsche Zeit) werden offene Tagesaufgaben zu Strafen.
// Muss zur Datenbank-Funktion task_deadline passen.
export const DEADLINE_HOUR = 15;
