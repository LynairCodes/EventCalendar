# Kalender

Öffentlicher Event-Kalender mit Tagesbestätigung und Würfelaufgaben.
Daten und Login laufen über Supabase.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `index.html` | Seitengerüst und Dialoge |
| `einstellungen.html` | Einstellungsseite: Anzeigename, Rechte, Passwort |
| `css/style.css` | Gestaltung (hell und dunkel) |
| `js/config.js` | Supabase-Adresse, öffentlicher Key, Login-Domain |
| `js/main.js` | Startpunkt, verbindet alle Teile |
| `js/state.js` | Supabase-Verbindung, Zustand, Serverzeit, Rollen, Fristen und Status |
| `js/data.js` | Lädt Serverzeit, Kalenderdaten und offene Strafen |
| `js/calendar.js` | Monatsansicht und Tagesansicht |
| `js/focus.js` | Seitenleiste: aktuelles Event, Countdown, offene Aufgaben, Strafen |
| `js/actions.js` | Bestätigen, Würfeln, Abhaken, Strafen nachholen, Löschen |
| `js/status.js` | Symbole und Texte für die Status-Anzeige |
| `js/description.js` | Linke Spalte: Beschreibung des aktuellen Events |
| `js/markdown.js` | Markdown sicher in HTML umwandeln |
| `js/event-form.js` | Dialog „Neues Event“ / „Event bearbeiten“ mit Würfelformel und Aufgabenliste |
| `js/account.js` | Anmelden, Abmelden, Anzeige im Kopfbereich |
| `js/settings.js` | Logik der Einstellungsseite |
| `js/dice.js` | Würfelformeln prüfen und Verteilung berechnen |
| `js/util.js` | Helfer für Datum, Formatierung und Meldungen |

Alle Rechte und Zeitfenster prüft die Datenbank selbst.
Die Website zeigt nur an, was erlaubt ist.

## Lokal testen

Wegen der JavaScript-Module funktioniert Doppelklick auf `index.html` nicht.
Stattdessen im Projektordner einen kleinen Webserver starten:

```
python -m http.server 8000
```

Dann im Browser `http://localhost:8000` öffnen.
