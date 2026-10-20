# Kalender

Öffentlicher Event-Kalender mit Tagesbestätigung und Würfelaufgaben.
Daten und Login laufen über Supabase.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `index.html` | Seitengerüst und Dialoge |
| `css/style.css` | Gestaltung (hell und dunkel) |
| `js/config.js` | Supabase-Adresse, öffentlicher Key, Login-Domain |
| `js/main.js` | Startpunkt, verbindet alle Teile |
| `js/state.js` | Supabase-Verbindung, gemeinsamer Zustand, Rollen und Zeitfenster |
| `js/data.js` | Lädt Serverdatum und Kalenderdaten |
| `js/calendar.js` | Monatsansicht, Event-Liste, Tagesansicht |
| `js/event-form.js` | Dialog „Neues Event“ / „Event bearbeiten“ mit Würfelformel und Aufgabenliste |
| `js/account.js` | Anmelden, Abmelden, Passwort ändern |
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
