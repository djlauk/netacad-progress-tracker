# NetAcad-Fortschrittsübersicht

**Hinweis:** Erstellt mit Unterstützung von KI.

Lokale Webanwendung für Lehrpersonen mit Kursen der Cisco Networking Academy. Sie speichert Snapshots des *Course Gradebooks* und zeigt pro Person: **Wer kommt voran, und bei wem sollte ich nachfragen?**

Läuft nur auf dem eigenen Rechner (`127.0.0.1`), ohne Datenbank, ohne externe Ressourcen.

## Installation und Start

Voraussetzung: [Node.js 24](https://nodejs.org/) oder neuer.

```
npm install
npm start            # → http://localhost:8765/  -- Port siehe Umgebungsvariablen.
```

| Befehl                | Zweck                                                                              |
| --------------------- | ---------------------------------------------------------------------------------- |
| `npm start`           | Server starten                                                                     |
| `npm run dev`         | Server mit automatischem Neustart bei Codeänderungen                               |
| `npm run dev:demo`    | Mit fiktiven Demo-Daten starten (`test/fixtures/demo`, Daten auf heute verschoben) |
| `npm test`            | Tests                                                                              |
| `npm run typecheck`   | Typprüfung (`tsc --noEmit`)                                                        |
| `npm run bookmarklet` | `bookmarklet/bookmarklet.txt` aus `bookmarklet.src.js` erzeugen                    |

### Umgebungsvariablen

| Variable | Standard | Bemerkung |
|---|---|---|
| `PORT` | `8765` | Nach einer Änderung von `PORT` muss das Bookmarklet neu erzeugt (`npm run bookmarklet`) und neu in die Lesezeichenleiste gezogen werden.|
| `DATA_DIR` | `./data` | |
| `SOURCE_ORIGINS` | `https://www.netacad.com` | kommagetrennt; andere Herkunft erzeugt beim Import eine Warnung. |


## Bookmarklet einrichten

1. Server starten, **Einstellungen → Bookmarklet** öffnen.
2. Den Link «NetAcad → Fortschritt» in die Lesezeichenleiste ziehen. Alternativ «Code kopieren» und als Adresse eines neuen Lesezeichens einfügen.

## Ablauf: exportieren → importieren → nachfragen

1. **Exportieren:** In NetAcad das *Course Gradebook* eines Kurses öffnen, alle Lernenden auf einer Seite anzeigen, das Bookmarklet anklicken.
2. **Importieren:** Ein neuer Tab zeigt die Vorschau (Stand, Anzahl Lernende, neue Prüfungsabgaben seit dem letzten Snapshot, Warnungen). Mit **«Importieren»** speichern. Die Daten werden sofort aus der Adresszeile entfernt.
   Falls kein Tab aufgeht, lädt das Bookmarklet die Datei herunter: unter **Dateien** hochladen (auch mehrere Dateien, per Drag & Drop).
3. **Nachfragen:** Die **Personenübersicht** sortiert nach Dringlichkeit (🔴 nachfragen, 🟡 beobachten, 🟢 aktiv, 💤 pausiert, ✅ abgeschlossen, ⚪ nicht mehr dabei). In der Personendetailansicht gibt es eine Nachfrage-Vorlage (kopieren oder als E-Mail öffnen), ein Kontaktprotokoll, eine Notiz und «Pausieren bis».

Schwellen (Standard): beobachten ab 21, nachfragen ab 42 Tagen ohne Aktivität. Als Aktivität zählen nur Prüfungsergebnisse; wer noch nichts abgelegt hat, steht auf «nachfragen» (Schonfrist über «Pausieren bis»). Anpassbar unter **Einstellungen**.

## Daten und Datensicherung

```
data/
├── snapshots/          # Snapshot-Dateien, einzige Quelle der Gradebook-Daten
├── notes.json          # Kontakte, Notizen, Pausen (von Hand lesbar)
├── notes.backup.json   # vorherige Version von notes.json
└── settings.json
```

- **Sicherung:** den Ordner `data/` kopieren. Wiederherstellen: zurückkopieren.
- Snapshots werden nie verändert. Dateien können von Hand in `data/snapshots/` gelegt oder gelöscht werden; sie erscheinen beim nächsten Seitenaufruf.
- Mehrere Exporte am selben Tag: der neueste (`exportedAt`) gilt, die anderen erscheinen unter **Dateien** als «ersetzt».
- `data/` enthält Personendaten (nDSG) und ist in `.gitignore`.

## Bekannte Grenzen

- **Das Gradebook zeigt nur Prüfungsergebnisse.** Wer Module durcharbeitet, ohne die Prüfung abzulegen, erscheint als inaktiv. «Kein Fortschritt» heisst «keine Prüfung abgelegt». Das ist ein Anlass für eine freundliche Nachfrage, kein Beweis für Untätigkeit.
- Das Bookmarklet erfasst nur die Zeilen, die auf der Gradebook-Seite sichtbar sind (Paginierung). Bei deutlich weniger Lernenden als zuvor warnt die Vorschau.
- Das Bookmarklet hängt vom HTML-Aufbau der NetAcad-Seite ab und muss nach Änderungen bei Cisco eventuell angepasst werden (`bookmarklet/bookmarklet.src.js`, dann `npm run bookmarklet`).
- Die Werte von `status` ausser `IN PROGRESS` und die Beschriftung erledigter Häkchen (vermutlich `"Yes"`) sind noch nicht belegt.
- Ob NetAcad das Öffnen eines neuen Tabs aus dem Bookmarklet zulässt, ist noch nicht in der Praxis geprüft. Der Download-Fallback bleibt deshalb erhalten.

## Sicherheit

Bindung nur an `127.0.0.1`; Host-Prüfung gegen DNS-Rebinding; schreibende Anfragen nur mit eigenem `Origin` und CSRF-Token; strikte Content-Security-Policy ohne Inline-Skripte; Import erst nach Bestätigung per Klick. Logs enthalten keine Namen oder E-Mail-Adressen.
