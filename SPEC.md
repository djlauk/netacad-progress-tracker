# Spezifikation: NetAcad-Fortschrittsübersicht

Diese Spezifikation wurde erstellt mit Unterstützung von KI.
Das Ziel der Spezifikation ist eine Umsetzung durch KI.

## 1. Ziel

Eine lokal laufende Webanwendung für eine Lehrperson, die ein freiwilliges Freifach mit Kursen der Cisco Networking Academy (NetAcad) betreut. Die Lehrperson exportiert pro Kurs in unregelmässigen Abständen per Bookmarklet eine Momentaufnahme («Snapshot») des Course Gradebooks. Die Anwendung speichert die Snapshots und beantwortet schnell eine Frage:

> **Wer kommt voran, und bei wem tut sich nichts, sodass ich nachfragen sollte, ob die Person Hilfe braucht?**

Lernende können mehrere Kurse belegen (n:m zwischen Lernenden und Kursen). Die Hauptsicht ist deshalb **pro Person**, nicht pro Kurs.

Nicht-Ziele: Benotung, Ranglisten, Vergleiche zwischen den Lernenden, Versand von E-Mails, Betrieb auf einem Server im Netz.

## 2. Technologie

| Schicht      | Vorgabe                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Laufzeit     | **Node.js 24 (LTS)**. TypeScript wird direkt ausgeführt (Type Stripping), **ohne Build-Schritt**.                             |
| Sprache      | TypeScript auf dem Server. Im Browser nur fertiges HTML/CSS und ein Minimum an einfachem JavaScript (`// @ts-check` + JSDoc). |
| Server       | **Hono** mit `@hono/node-server`.                                                                                             |
| Templates    | **`html` aus `hono/html`** (Tagged Templates mit automatischem Escaping). Kein JSX.                                           |
| Interaktion  | **htmx** (npm: `htmx.org`, Version 2).                                                                                        |
| Styles       | **Pico CSS** (npm: `@picocss/pico`, Version 2), Datei `css/pico.min.css`. Dazu eine eigene `public/app.css`.                  |
| Diagramme    | SVG, auf dem Server erzeugt. Keine Chart-Bibliothek.                                                                          |
| Tests        | `node:test` + `node:assert`. Hono-Routen über `app.request()` testen.                                                         |
| Typprüfung   | `tsc --noEmit` (nur Entwicklung, nicht zum Starten nötig).                                                                    |
| Sprache UI   | Deutsch (Schweiz, also «ss» statt «ß»). Datumsformat `TT.MM.JJJJ`.                                                            |
| Sprache Code | Englisch: Bezeichner, Kommentare, JSON-Felder, Routen.                                                                        |

### 2.1 Abhängigkeiten

- `dependencies`: `hono`, `@hono/node-server`, `htmx.org`, `@picocss/pico`
- `devDependencies`: `typescript`, `@types/node`
- Keine weiteren Laufzeit-Abhängigkeiten ohne guten Grund.

### 2.2 TypeScript-Vorgaben für Type Stripping

Node entfernt nur Typen und wandelt keinen Code um. Deshalb gilt:

- `package.json`: `"type": "module"`, `"engines": { "node": ">=24" }`
- `tsconfig.json`: `"noEmit": true`, `"erasableSyntaxOnly": true`, `"verbatimModuleSyntax": true`, `"allowImportingTsExtensions": true`, `"module": "nodenext"`, `"strict": true`
- Imports mit Endung `.ts` (`import { parse } from './logic/parse.ts'`). Typ-Imports mit `import type`.
- Keine `enum`, keine `namespace`, keine Parameter Properties im Konstruktor. Stattdessen Union-Typen und `as const`.

### 2.3 npm-Skripte

```
npm start          → node src/server.ts
npm run dev        → node --watch src/server.ts
npm test           → node --test "test/**/*.test.ts"
npm run typecheck  → tsc --noEmit
npm run bookmarklet → node scripts/build-bookmarklet.ts   (schreibt bookmarklet/bookmarklet.txt)
npm run dev:demo   → node scripts/demo.ts                 (Demo-Daten, siehe 10)
```

### 2.4 Projektstruktur

```
netacad-progress/
├── package.json
├── tsconfig.json
├── src/
│   ├── server.ts            # Start: Konfiguration, serve(), Bindung an 127.0.0.1
│   ├── app.ts               # Hono-App: Middleware, Routen (ohne listen, für Tests)
│   ├── config.ts            # Port, DATA_DIR, erlaubte Quell-Origins, Vendor-Pfade
│   ├── types.ts             # Snapshot, Learner, Assessment, Notes, Settings, ...
│   ├── logic/               # reine Funktionen, kein I/O, kein Hono
│   │   ├── parse.ts         # Validierung netacad-gradebook/1
│   │   ├── model.ts         # Zusammenführen, Zeitreihen
│   │   ├── status.ts        # Fortschritt, letzte Aktivität, Status, Kennzahlen, Zeitachse
│   │   ├── preview.ts       # Import-Vorschau: Vergleich mit gespeicherten Snapshots
│   │   └── bookmarklet.ts   # Bookmarklet zusammenfügen und Regeln prüfen (Anhang A)
│   ├── store/
│   │   ├── fsutil.ts        # atomares Schreiben, JSON lesen, Warteschlange
│   │   ├── snapshots.ts     # Lesen/Schreiben data/snapshots, Cache
│   │   ├── notes.ts         # data/notes.json, atomar, serialisiert
│   │   └── settings.ts      # data/settings.json
│   └── views/               # hono/html-Templates
│       ├── layout.ts
│       ├── format.ts        # Datums-/Zahlenformate, Status-Symbole und -Texte
│       ├── people.ts  person.ts
│       ├── template.ts      # Platzhalter der Nachfrage-Vorlage (7.B)
│       ├── courses.ts       # Kursübersicht, Kursdetail, Zeitachse
│       ├── files.ts  import.ts  settings.ts
│       └── charts.ts        # SVG-Erzeugung
├── public/
│   ├── app.css
│   ├── app.js               # nur: Text in die Zwischenablage kopieren, Drag & Drop für Upload
│   └── import.js            # Import-Seite (siehe 4.3)
├── bookmarklet/
│   ├── bookmarklet.src.js   # lesbare Quelle (Anhang A)
│   └── bookmarklet.txt      # erzeugt, nicht von Hand bearbeiten
├── scripts/
│   ├── build-bookmarklet.ts
│   └── demo.ts              # npm run dev:demo (siehe 10)
├── test/
│   ├── *.test.ts
│   └── fixtures/            # fiktive Snapshots
├── data/                    # in .gitignore
│   ├── snapshots/
│   ├── notes.json
│   └── settings.json
└── README.md
```

## 3. Datenquelle: Snapshot-Format `netacad-gradebook/1`

Ein Snapshot ist das JSON, das das Bookmarklet (Anhang A) auf der Gradebook-Seite von NetAcad erzeugt.

```json
{
  "format": "netacad-gradebook/1",
  "snapshotDate": "2026-11-01",
  "exportedAt": "2026-11-01T08:28:41.690Z",
  "course": "JavaScript Essentials 1 2026/27",
  "url": "/launch",
  "courseId": "b68f5a66-bdb0-41d3-8788-65776afbf9ee",
  "assessments": [
    { "name": "JSE: Module 1: Module Exam", "dueDate": "2027-07-31" }
  ],
  "learners": [
    {
      "name": "Beispielchen, Arno",
      "email": "a.beispielchen.inf24@stud.bbbaden.ch",
      "status": "IN PROGRESS",
      "classGrade": 23.57,
      "finalExamScore": null,
      "finalExamSubmitted": false,
      "surveySubmitted": false,
      "markedComplete": false,
      "assessments": [
        { "name": "JSE: Module 1: Module Exam", "score": 79, "maxScore": 100, "submittedOn": "2026-09-11" },
        { "name": "JSE: Module 3: Module Exam", "score": null, "maxScore": 100, "submittedOn": null }
      ]
    }
  ]
}
```

| Feld                           | Typ                       | Bedeutung                                                                                                                                                                                                                                             |
| ------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `snapshotDate`                 | `YYYY-MM-DD`              | Lokales Datum des Exports                                                                                                                                                                                                                             |
| `exportedAt`                   | ISO-8601 UTC              | Exakter Zeitpunkt; entscheidet bei Duplikaten                                                                                                                                                                                                         |
| `course`                       | string                    | Kurstitel laut NetAcad                                                                                                                                                                                                                                |
| `url`                          | string \| null            | Pfad der Gradebook-Seite (`location.pathname`), nur zur Information. Bei NetAcad für alle Kurse gleich (`/launch`)                                                                                                                                    |
| `courseId`                     | string                    | Kurs-ID laut NetAcad: Query-Parameter `id` der Gradebook-Adresse (UUID, z. B. `…/launch?id=b68f5a66-…&tab=gradebook`). Schlüssel des Kurses (5.1), Vergleich ohne Gross-/Kleinschreibung. Nur dieser Parameter wird übernommen, nicht die ganze Query |
| `assessments[]`                | Liste                     | Prüfungen des Kurses in der Reihenfolge der Spalten                                                                                                                                                                                                   |
| `learners[].email`             | string \| null            | Schlüssel der Person                                                                                                                                                                                                                                  |
| `learners[].status`            | string \| null            | z. B. `IN PROGRESS`. Weitere Werte unbekannt, als Rohtext behandeln.                                                                                                                                                                                  |
| `learners[].classGrade`        | number \| null            | Klassennote in Prozent (0–100)                                                                                                                                                                                                                        |
| `…Submitted`, `markedComplete` | boolean \| string \| null | `true`/`false`, wenn erkannt, sonst Rohtext aus NetAcad                                                                                                                                                                                               |
| `assessments[].score`          | number \| null            | `null` = noch nicht abgelegt                                                                                                                                                                                                                          |
| `assessments[].submittedOn`    | `YYYY-MM-DD` \| null      | Datum der Abgabe laut NetAcad                                                                                                                                                                                                                         |

**Validierung** (`logic/parse.ts`) ohne externe Bibliothek, mit präzisen Fehlermeldungen: Pflichtfelder sind `format`, `snapshotDate`, `exportedAt`, `course`, `courseId` und `learners` (Array). Ein Snapshot ohne `courseId` (älteres Bookmarklet) ist ungültig, mit Hinweis auf einen neuen Export. Unbekannte Felder ignorieren, fehlende optionale Felder als `null` behandeln. Ein Parser pro Format-Version, damit sich ein künftiges `netacad-gradebook/2` ergänzen lässt.

## 4. Datenablage und Import

### 4.1 Designentscheid: Die Snapshot-Dateien sind die Datenbank

Es gibt **keine Datenbank und kein konsolidiertes Format**. `data/snapshots/` ist die einzige Quelle der Wahrheit für Gradebook-Daten. Der Server liest beim Start alle Dateien ein und berechnet alles im Speicher.

Begründung:

- Die Datenmenge ist klein (Grössenordnung: 5 Kurse × 15 Snapshots pro Jahr × 30 Personen).
- Ein unveränderter Snapshot ist **keine Redundanz, sondern Information**: Er belegt «am Datum X war noch kein Fortschritt sichtbar».
- Die Rohdateien bleiben lesbar, lassen sich sichern und auch mit anderen Werkzeugen auswerten.

Was die Anwendung selbst erzeugt und speichert: Kontaktprotokoll und Notizen (`data/notes.json`) sowie Einstellungen (`data/settings.json`).

### 4.2 Konfiguration

Über Umgebungsvariablen mit Standardwerten (`src/config.ts`):

| Variable         | Standard                  | Zweck                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`           | `8765`                    | Port                                                                                                                                                                                                                                                                                                                            |
| `DATA_DIR`       | `./data`                  | Datenordner, wird beim Start angelegt, falls er fehlt                                                                                                                                                                                                                                                                           |
| `SOURCE_ORIGINS` | `https://www.netacad.com` | Kommagetrennt. Erwartete Herkunft der Import-Seite (siehe 4.3). Kommt `GET /import` mit einem `Referer` einer anderen Herkunft (ausser der eigenen), zeigt die Seite eine Warnung. Kein Blockieren: Der Schutz ist der Bestätigungsklick, und von `https://` nach `http://localhost` senden Browser meist gar keinen `Referer`. |

Der Server bindet **ausschliesslich an `127.0.0.1`** und gibt beim Start die URL aus.

### 4.3 Import per Bookmarklet

Ablauf:

1. Die Lehrperson klickt auf der NetAcad-Gradebook-Seite auf das Bookmarklet.
2. Das Bookmarklet erzeugt das Snapshot-JSON und öffnet
   `http://localhost:8765/import#<encodeURIComponent(JSON)>` in einem neuen Tab.
3. Die Import-Seite (`public/import.js`) liest den Fragment-Teil, **entfernt ihn sofort** aus der Adresse (`history.replaceState`), damit keine Personendaten im Browserverlauf bleiben, und schickt das JSON per `POST /import/preview` an den Server.
4. Der Server validiert und gibt eine **Vorschau** zurück (htmx-Fragment): Kurs, Stand, Anzahl Lernende und Prüfungen, Vergleich mit dem letzten Snapshot dieses Kurses (z. B. «3 neue Prüfungsabgaben seit 06.10.2026»), Warnungen (z. B. «deutlich weniger Lernende als beim letzten Mal: alle Seiten geladen?»).
5. Erst ein Klick auf **«Importieren»** speichert (`POST /import/commit`). Danach erfolgt die Weiterleitung zur Personenübersicht.

Warum dieser Weg:

- Ein direkter `fetch` von der NetAcad-Seite an `localhost` würde wahrscheinlich an der Content-Security-Policy von NetAcad und an den Chrome-Regeln für Zugriffe aufs lokale Netz scheitern. Das Öffnen eines neuen Tabs ist davon nicht betroffen.
- Der Fragment-Teil (`#…`) wird nie über das Netz übertragen, auch nicht an `localhost`. Er funktioniert auch dann, wenn NetAcad die Beziehung zum geöffneten Fenster kappt (`Cross-Origin-Opener-Policy`), was `postMessage` verhindern würde.
- Die Bestätigung durch einen Klick verhindert, dass eine fremde Webseite durch Öffnen von `localhost:8765/import#…` unbemerkt gefälschte Snapshots einschleust.

Grenzen und Fallback:

- Grösse: Der Fragment-Teil ist auf einige MB begrenzt. Das reicht für einen Kurs bei Weitem. Ab einer Länge von 1 MB lädt das Bookmarklet die Datei herunter, statt den Tab zu öffnen.
- Wenn `window.open` blockiert wird (Rückgabe `null`): Download der Datei wie bisher, plus `alert` mit Hinweis.
- **Manueller Upload:** Die Seite «Dateien» hat ein Upload-Formular (mehrere Dateien, Drag & Drop). Es durchläuft dieselbe Validierung und dieselbe Vorschau.

### 4.4 Speichern von Snapshots

- Dateiname: `YYYY-MM-DD-<slug>_gradebook.json`. `slug` ist der Kurstitel, wie im Bookmarklet bereinigt.
- Existiert die Datei bereits: Bei gleichem `exportedAt` ist das ein Duplikat. Nichts schreiben, als «bereits vorhanden» melden. Andernfalls mit Suffix `-2`, `-3`, … speichern. Welcher Export gilt, entscheidet die Logik (5.2), nicht der Dateiname.
- Atomar schreiben: in eine temporäre Datei im selben Ordner, dann `rename`.
- Grössenlimit für Uploads und Import: 5 MB.
- Snapshots werden nie verändert oder gelöscht. Ein Löschen im Dateisystem durch den Benutzer ist erlaubt (siehe Cache).

### 4.5 Cache

Der Server hält das berechnete Modell im Speicher. Neu berechnet wird nach einem Import oder Upload, sowie wenn sich die Liste der Dateien in `data/snapshots/` geändert hat (Namen, Grösse, `mtime`). Diese Prüfung erfolgt bei jeder Seitenanfrage. Sie ist günstig (`readdir` + `stat`) und erfasst auch Dateien, die von Hand in den Ordner gelegt oder daraus gelöscht wurden. Kein `fs.watch`.

### 4.6 `data/notes.json` (Format `netacad-notes/1`)

```json
{
  "format": "netacad-notes/1",
  "updatedAt": "2026-11-01T09:00:00.000Z",
  "learners": {
    "a.beispielchen.inf24@stud.bbbaden.ch": {
      "note": "Will JSE bis Ende Semester abschliessen.",
      "contacts": [
        { "id": "c_01", "date": "2026-11-01", "channel": "E-Mail", "text": "Nachgefragt, ob Hilfe nötig", "reply": "Hat Prüfungsphase, macht ab Dezember weiter" }
      ],
      "snoozeUntil": "2026-12-01"
    }
  }
}
```

- Schlüssel: E-Mail in Kleinbuchstaben.
- `snoozeUntil`: Bis zu diesem Datum gilt die Person nicht als «nachfragen». Sie wird mit einem Hinweis angezeigt.
- `channel`: freier Text mit Vorschlägen (`E-Mail`, `Teams`, `persönlich`).
- Schreiben: serialisiert (eine Warteschlange, keine parallelen Schreibvorgänge), atomar (temporäre Datei + `rename`). Vorher die bestehende Datei nach `notes.backup.json` kopieren (eine Generation).
- Die Datei soll von Hand lesbar und bearbeitbar bleiben (eingerückt, stabile Reihenfolge der Schlüssel).

### 4.7 `data/settings.json`

`warnDays` (21), `alertDays` (42), `newDays` (14), `contactSubject` (`NetAcad: {course}`), `contactTemplate` (siehe 7.B). Betreff und Text dürfen nicht leer sein. Fehlende Werte fallen auf die Standardwerte zurück.

## 5. Datenmodell

### 5.1 Schlüssel

- **Person:** `email.trim().toLowerCase()`. Fehlt die E-Mail: `name:<Name>` und Warnung.
- **Kurs:** `courseId` (extrahiert aus Query-Parameter `id` in URL; NetAcad nutzt dieselbe URL für alle Kurse). Anzeigename ist `course` aus dem neuesten Snapshot.
- **Prüfung:** `assessment.name` innerhalb des Kurses (Zuordnung über den Namen, kein eigener zusammengesetzter Schlüssel).

In URLs werden Schlüssel nicht im Klartext verwendet. Stattdessen eine kurze, stabile ID (z. B. die ersten 12 Hex-Zeichen von SHA-256 des Schlüssels), damit keine E-Mail-Adressen in Adresszeile und Verlauf stehen.

### 5.2 Normalisierung

1. Alle Snapshots einlesen und validieren. Ungültige Dateien überspringen, mit Grund merken.
2. **Duplikate:** gleicher Kurs und gleiches `snapshotDate` → nur der mit dem neuesten `exportedAt` gilt. Die anderen als «ersetzt» kennzeichnen.
3. Pro Kurs chronologisch sortieren.
4. **Zeitreihe** pro (Person, Kurs): `{ snapshotDate, classGrade, status, flags, assessments }[]`.

## 6. Ableitungen und Regeln

Alle Funktionen in `src/logic/`, rein und getestet. `today` wird als Parameter übergeben.

### 6.1 Fortschritt zwischen zwei Snapshots (Person × Kurs)

Fortschritt liegt vor, wenn **mindestens eine** dieser Bedingungen zutrifft:

- eine Prüfung hat neu einen `score` (vorher `null`), oder ihr `score` ist gestiegen,
- `classGrade` ist gestiegen,
- `finalExamSubmitted`, `surveySubmitted` oder `markedComplete` ist von nicht-`true` auf `true` gewechselt,
- `status` hat sich geändert (als Ereignis anzeigen, z. B. «IN PROGRESS → COMPLETED»).

Ein gesunkener `score` oder eine gesunkene `classGrade` gilt nicht als Fortschritt, sondern wird als Auffälligkeit angezeigt.

### 6.2 Letzte Aktivität

`lastActivity(person, course)` ist das späteste dieser Daten:

- das grösste `submittedOn` aller Prüfungen,
- das `snapshotDate` des ersten Snapshots, in dem ein Fortschritt nach 6.1 sichtbar wurde, der sich nicht über `submittedOn` datieren lässt.

Gibt es keine Aktivität: das `snapshotDate` des ersten Snapshots, in dem die Person im Kurs auftaucht. Dazu `activitySource`: `"submitted"` / `"snapshot"` / `"firstSeen"` (in der UI als Tooltip).

`lastActivity(person)` ist das Maximum über alle Kurse.

### 6.3 Status pro Person

Ausgewertet in dieser Reihenfolge, die erste zutreffende Regel gilt:

| Status      | Symbol | Regel                                                                                 |
| ----------- | ------ | ------------------------------------------------------------------------------------- |
| `completed` | ✅      | In allen Kursen der Person: `markedComplete === true` oder `status` enthält `COMPLET` |
| `gone`      | ⚪      | Person fehlt im neuesten Snapshot aller ihrer Kurse                                   |
| `snoozed`   | 💤      | `snoozeUntil >= today`                                                                |
| `new`       | 🆕      | Erster Auftritt vor weniger als `newDays` Tagen                                       |
| `active`    | 🟢      | `today − lastActivity(person) < warnDays`                                             |
| `watch`     | 🟡      | `warnDays ≤ … < alertDays`                                                            |
| `alert`     | 🔴      | `≥ alertDays` → **nachfragen**                                                        |

- Die Regel arbeitet mit **Tagen seit der letzten Aktivität**, nicht mit der Anzahl Snapshots, weil die Exporte unregelmässig erfolgen. Zusätzlich als Information: «unverändert seit *n* Snapshots».
- Fortschritt in einem von mehreren Kursen reicht für `active`. Ein Kurs ohne Fortschritt wird in seiner Zelle trotzdem markiert.
- Gab es seit Beginn des aktuellen `watch`/`alert`-Zustands bereits einen Kontakt, zeigt der Status zusätzlich «nachgefragt am …».

### 6.4 Kurskennzahlen

Pro Kurs auf Basis des neuesten Snapshots:

- eingeschrieben; Anzahl `active` / `watch` / `alert` / `completed` (gleiche Schwellen, nur mit der Aktivität in diesem Kurs),
- pro Prüfung: Anzahl abgelegt, Median der Punkte, frühestes und spätestes `submittedOn`,
- **Stand der Lernenden:** pro Person die höchste abgelegte Prüfung (nach Spaltenreihenfolge). Daraus ein Histogramm, das zeigt, wo Lernende hängen bleiben.

## 7. Ansichten und Routen

### 7.0 Grundsätze für htmx

- Jede Route liefert eine **vollständige Seite**. Routen, deren Inhalt htmx an Ort und Stelle ersetzt, liefern bei Header `HX-Request` nur das betroffene Fragment: Personenübersicht (Ergebnisse + Sortierzustand per `hx-swap-oob`), Kontakte, Notiz, Upload, Import-Vorschau und -Commit, Einstellungen. Ausnahme: Anfragen mit `HX-Boosted` oder `HX-History-Restore-Request` erhalten immer die ganze Seite. Die übrigen Seiten (Personendetail, Kurse, Zeitachse, Dateien, `GET /import`, `/`) liefern immer die ganze Seite; sie werden nur über `hx-boost` erreicht. Links und Formulare funktionieren so auch ohne JavaScript.
- `hx-boost` auf der Navigation. Filter und Sortierung über `hx-get` mit `hx-push-url="true"`, damit gefilterte Ansichten verlinkbar und mit «Zurück» erreichbar bleiben. Der Zustand steht in den Query-Parametern.
- **Kein `hx-on`** und keine Inline-Skripte (wegen der CSP, siehe 9). htmx-Konfiguration per `<meta name="htmx-config" content='{"allowEval":false,"includeIndicatorStyles":false,"historyCacheSize":0}'>`. `historyCacheSize: 0`, damit htmx keine Seitenkopien (mit Personendaten) im `localStorage` ablegt.
- Pico-Klassen und semantisches HTML verwenden. Eigene Klassen nur in `app.css`.

### 7.1 Routen

| Methode  | Pfad                               | Inhalt                                                              |
| -------- | ---------------------------------- | ------------------------------------------------------------------- |
| GET      | `/`                                | Weiterleitung auf `/people` (ohne Daten: Startseite mit Anleitung)  |
| GET      | `/people`                          | A. Personenübersicht. Query: `status`, `course`, `q`, `sort`, `dir` |
| GET      | `/people/:id`                      | B. Personendetail                                                   |
| POST     | `/people/:id/contacts`             | Kontakt erfassen → Fragment Kontaktliste                            |
| POST     | `/people/:id/contacts/:cid/delete` | Kontakt löschen                                                     |
| POST     | `/people/:id/note`                 | Notiz und `snoozeUntil` speichern                                   |
| GET      | `/courses`                         | C. Kursübersicht                                                    |
| GET      | `/courses/:id`                     | C. Kursdetail                                                       |
| GET      | `/timeline`                        | D. Zeitachse (optional)                                             |
| GET      | `/files`                           | E. Dateien und Upload                                               |
| POST     | `/files/upload`                    | Upload (multipart) → Vorschau                                       |
| GET      | `/import`                          | Import-Seite für das Bookmarklet                                    |
| POST     | `/import/preview`                  | Validierung und Vorschau                                            |
| POST     | `/import/commit`                   | Speichern                                                           |
| GET/POST | `/settings`                        | F. Einstellungen                                                    |
| GET      | `/vendor/htmx.min.js`              | aus `node_modules/htmx.org/dist/htmx.min.js`                        |
| GET      | `/vendor/pico.min.css`             | aus `node_modules/@picocss/pico/css/pico.min.css`                   |
| GET      | `/static/*`                        | `public/`                                                           |

Die Vendor-Pfade stehen zentral in `config.ts`. Beim Start prüft der Server, ob die Dateien existieren, und bricht sonst mit einer klaren Meldung ab (z. B. «npm install ausführen»). **`node_modules` wird nie pauschal freigegeben.**

### A. Personenübersicht (Startansicht)

Eine Zeile pro Person. Spalten:

1. Status (Symbol und Text)
2. Name, darunter die E-Mail-Adresse
3. **pro Kurs eine Spalte** (nur Kurse der angezeigten Personen): `classGrade` in Prozent, darunter `abgelegt/total` Prüfungen und das Delta seit dem vorherigen Snapshot (`+17` grün, `±0` grau). Leer, wenn nicht eingeschrieben.
4. Letzte Aktivität (Datum und «vor n Tagen»)
5. Letzter Kontakt (Datum)

- Standardsortierung: `alert`, `watch`, `new`, `active`, `snoozed`, `completed`, `gone`; innerhalb davon die längste Inaktivität zuerst. Spaltenköpfe sind Sortier-Links.
- Filterformular: Status (Checkboxen), Kurs, Suche (Name/E-Mail). Bei jeder Änderung neu laden (`hx-trigger="change, keyup changed delay:300ms from:input[name=q]"`).
- Kopfzeile mit Zählern, z. B. «🔴 3 · 🟡 2 · 🟢 14 · ✅ 1». Jeder Zähler ist ein Filter-Link.
- Knopf «E-Mail-Adressen kopieren» (gefilterte Personen, getrennt durch `; `), umgesetzt mit `public/app.js`.

### B. Personendetail

- Kopf: Name, E-Mail, Status, letzte Aktivität.
- **Pro Kurs:** Verlaufsdiagramm `classGrade` (SVG; x-Achse proportional zur Zeit, nicht nach Index; abgegebene Prüfungen als Marker) und eine Liste der Prüfungen mit Punkten und `submittedOn`.
- **Kontaktprotokoll:** Liste und Formular (Datum mit heute vorbelegt, Kanal, Text, Antwort). Notizfeld. «Pausieren bis» (`snoozeUntil`). Speichern per htmx, ohne Neuladen der Seite.
- **Nachfrage-Vorlage** aus `contactSubject` (Betreff) und `contactTemplate` (Text), beide mit Platzhaltern (siehe unten). Anzeige in einem schreibgeschützten Eingabefeld (Betreff, Knopf «Betreff kopieren») und einem schreibgeschützten Textfeld (Text, Knopf «Text kopieren»), dazu ein `mailto:`-Link an diese Person (Betreff als `subject`, Text als `body`). Standardbetreff: «NetAcad: {course}». Standardtext:

  > Guten Tag, Herr/Frau {lastName},
  >
  > ich sehe im Kurs «{course}», dass sich seit dem {lastActivity} nichts mehr getan hat. Ist gerade einfach viel los, oder kann ich Ihnen irgendwo helfen? Melden Sie sich gern, auch wenn Sie nur eine kurze Frage haben.

  Höflichkeitsform mit Nachnamen. Das Geschlecht ist in den Daten nicht enthalten, deshalb «Herr/Frau»; die Lehrperson passt die Anrede vor dem Senden an.

  Platzhalter mit englischen Namen, gleich wie die Felder der Snapshot-Dateien, wo es ein solches Feld gibt. Kursbezogene Werte gelten für den **Kurs mit der längsten Inaktivität** (unter den aktuellen, nicht abgeschlossenen Kursen der Person; gibt es keinen, unter allen). Fehlende Werte: «–». Flags: «ja» / «nein» / Rohtext aus NetAcad. Unbekannte Platzhalter bleiben unverändert stehen. Im Betreff werden Zeilenumbrüche zu Leerzeichen. Definiert an einer Stelle (`views/template.ts`); dieselbe Liste erscheint als Hilfe unter den Feldern in den Einstellungen.

  | Platzhalter            | Wert                                                                |
  | ---------------------- | ------------------------------------------------------------------- |
  | **Person**             |                                                                     |
  | `{firstName}`          | Teil des Namens nach dem Komma (ohne Komma: ganzer Name)            |
  | `{lastName}`           | Teil des Namens vor dem Komma                                       |
  | `{name}`               | voller Name laut NetAcad («Nachname, Vorname»)                      |
  | `{email}`              | E-Mail-Adresse                                                      |
  | `{progressStatus}`     | Status in dieser Übersicht (6.3, z. B. «nachfragen»)                |
  | `{lastActivityAll}`    | letzte Aktivität über alle Kurse (`TT.MM.JJJJ`)                     |
  | `{daysInactiveAll}`    | Tage seit der letzten Aktivität über alle Kurse                     |
  | `{allCourses}`         | alle Kurse der Person, kommagetrennt                                |
  | **Kurs**               |                                                                     |
  | `{course}`             | Kurstitel                                                           |
  | `{courseId}`           | Kurs-ID laut NetAcad                                                |
  | `{snapshotDate}`       | Datum des neuesten Snapshots des Kurses                             |
  | `{lastActivity}`       | letzte Aktivität in diesem Kurs (6.2)                               |
  | `{daysInactive}`       | Tage seit der letzten Aktivität in diesem Kurs                      |
  | `{firstSeen}`          | erster Snapshot mit dieser Person im Kurs                           |
  | `{status}`             | Status laut NetAcad (z. B. «IN PROGRESS»)                           |
  | `{classGrade}`         | Klassennote in Prozent                                              |
  | `{submittedCount}`     | Anzahl abgelegter Prüfungen                                         |
  | `{assessmentCount}`    | Anzahl Prüfungen im Kurs                                            |
  | `{lastAssessment}`     | zuletzt abgelegte Prüfung nach `submittedOn`, mit Punkten und Datum |
  | `{nextAssessment}`     | nächste offene Prüfung (nach Spaltenreihenfolge)                    |
  | `{openAssessments}`    | alle offenen Prüfungen, kommagetrennt                               |
  | `{finalExamScore}`     | Punkte der Abschlussprüfung                                         |
  | `{finalExamSubmitted}` | Abschlussprüfung abgegeben                                          |
  | `{surveySubmitted}`    | Umfrage abgegeben                                                   |
  | `{markedComplete}`     | als abgeschlossen markiert                                          |

### C. Kursübersicht und Kursdetail

- Übersicht: eine Karte (`<article>`) pro Kurs mit Anzahl eingeschrieben, Zählern `active` / `watch` / `alert` / `completed`, pro Prüfung abgelegt und Median, Datum des neuesten Snapshots und Anzahl Snapshots.
- Detail: Personentabelle (Name, darunter die E-Mail-Adresse) mit einer Spalte pro Prüfung (Punkte oder leer), Histogramm «höchste abgelegte Prüfung», Tabelle pro Prüfung (abgelegt, Median, frühestes und spätestes `submittedOn`). Darunter die Personen, die im neuesten Snapshot fehlen.

### D. Zeitachse (optional, niedrige Priorität)

Ereignisliste über alle Kurse, neueste zuerst: Prüfungsabgaben (Datum `submittedOn`) und Statuswechsel (Datum des Snapshots), z. B. «11.09.2026 · Beispielchen, Arno · JavaScript Essentials 1 2026/27 · JSE: Module 2: Module Exam · 86/100». Höchstens 500 Einträge.

### E. Dateien

Tabelle aller Snapshot-Dateien: Kurs, `snapshotDate`, Anzahl Lernende, Status (ok / ersetzt / ungültig, mit Grund). Warnungen: Person ohne E-Mail; Snapshot mit deutlich weniger Lernenden als der vorherige. Upload-Formular (siehe 4.3). Link zur Bookmarklet-Anleitung.

### F. Einstellungen

Formular für die Werte aus 4.7. Dazu ein Bereich «Bookmarklet» mit dem Inhalt von `bookmarklet/bookmarklet.txt` als Link zum Ziehen in die Lesezeichenleiste und einer kurzen Anleitung.

## 8. Gestaltung

- Pico CSS mit Standard-Thema. Hell und dunkel automatisch (`prefers-color-scheme`).
- `app.css` (Richtwert unter 150 Zeilen) passt Pico über CSS-Variablen an (`--pico-…`) und ergänzt nur: kompaktere Tabellen, Status-Badges, fixierte Namensspalte in breiten Tabellen, Diagrammfarben. Farben als Custom Properties, mit Werten für beide Modi.
- Status nie nur über Farbe, immer mit Symbol und Text.
- Gut nutzbar ab 1280 px Breite; breite Tabellen scrollen horizontal in einem Container.
- Druckansicht für die Personenübersicht (`@media print`: Filter und Navigation ausblenden).

## 9. Sicherheit und Datenschutz

Die Daten sind Personendaten von Lernenden (Schweiz, nDSG).

- **Nur `127.0.0.1`.** Nie `0.0.0.0`.
- **Host-Prüfung** (gegen DNS-Rebinding): Anfragen nur annehmen, wenn der `Host`-Header `localhost:<PORT>` oder `127.0.0.1:<PORT>` lautet. Sonst `403`.
- **Schreibende Anfragen (POST):** nur annehmen, wenn der `Origin`-Header (bzw. ersatzweise `Referer`) dem eigenen Origin entspricht. Zusätzlich ein CSRF-Token (Hono `csrf`-Middleware oder eigenes Token im Formular).
- **Sicherheits-Header** über Hono `secureHeaders`, CSP:
  `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`
  Pico und htmx müssen damit funktionieren. Für SVG-Diagramme Attribute statt `style` verwenden.
  Dazu `Referrer-Policy: same-origin` statt der Hono-Vorgabe `no-referrer`: Bei `no-referrer` senden Browser bei eigenen POSTs `Origin: null`, und die Origin-Prüfung würde sie ablehnen. Kein HSTS (wirkungslos über `http`).
- **Escaping:** alle Daten über `hono/html` ausgeben. `raw()` nur für selbst erzeugtes SVG, und auch dort Texte escapen.
- Keine externen Ressourcen, keine Telemetrie. `data/` steht in `.gitignore`.
- In Logs keine Namen oder E-Mail-Adressen, nur Anzahlen und Dateinamen.

## 10. Tests

- `npm test` ohne weitere Abhängigkeiten.
- **Logik** (`test/logic.*.test.ts`) mit **fiktiven** Fixtures für mindestens 2 Kurse und 6 Personen:
  - Person in 2 Kursen, Fortschritt nur in einem → `active`
  - Person ohne Aktivität seit über 42 Tagen → `alert`
  - Person ohne abgelegte Prüfung, eingeschrieben vor 50 Tagen → `alert`, `activitySource = "firstSeen"`
  - zwei Snapshots am selben Tag → der neuere gilt
  - identische aufeinanderfolgende Snapshots → «unverändert seit 2 Snapshots»
  - Person fehlt im neuesten Snapshot → `gone`
  - gesunkener Score → Auffälligkeit, kein Fortschritt
  - `snoozeUntil` in der Zukunft → `snoozed`
  - ungültige Datei (falsches `format`, kaputtes JSON) → übersprungen mit Grund
- **HTTP** (`test/http.*.test.ts`) über `app.request()` mit temporärem `DATA_DIR`:
  - falscher `Host` → 403; POST mit fremdem `Origin` → 403
  - Import: Vorschau, Commit, Duplikat (gleiches `exportedAt`) → «bereits vorhanden»
  - Kontakt erfassen → in `notes.json`; Backup angelegt
  - `HX-Request` → Fragment, sonst ganze Seite
- **Bookmarklet:** `scripts/build-bookmarklet.ts` bricht ab, wenn das Ergebnis Nicht-ASCII-Zeichen, `%` oder `//`-Kommentare enthält.
- `npm run dev:demo` startet mit `DATA_DIR=test/fixtures/demo` (Kopie der Fixtures), damit die Oberfläche ohne echte Daten ausprobiert werden kann.

## 11. Akzeptanzkriterien

1. `npm install && npm start` → Ausgabe der URL; die Seite lädt ohne einen einzigen externen Request (DevTools → Network).
2. Bookmarklet auf der NetAcad-Gradebook-Seite → neuer Tab mit Vorschau → «Importieren» → Personenübersicht mit neuem Stand. Die Adresszeile enthält danach keine Daten mehr.
3. Eine Datei, die von Hand in `data/snapshots/` gelegt wird, erscheint beim nächsten Seitenaufruf ohne Neustart.
4. Die Fälle aus Abschnitt 10 werden korrekt dargestellt.
5. Kontakte und Notizen bleiben nach einem Neustart erhalten; `notes.json` ist von Hand lesbar.
6. `npm test` und `npm run typecheck` laufen grün.
7. Das README beschreibt: Installation, Start, Bookmarklet einrichten, Ablauf «exportieren → importieren → nachfragen», Datensicherung (`data/` kopieren), bekannte Grenzen.

## 12. Bekannte Grenzen

Alle Punkte stehen im README. In der UI: der erste Punkt als Hinweis unter der Personenübersicht und in der Fusszeile, der zweite in der Bookmarklet-Anleitung (Einstellungen).

- **Das Gradebook zeigt nur Prüfungsergebnisse.** Wer Module durcharbeitet, ohne die Prüfung abzulegen, erscheint als inaktiv. «Kein Fortschritt» heisst «keine Prüfung abgelegt». Das ist ein Anlass für eine freundliche Nachfrage, kein Beweis für Untätigkeit.
- Das Bookmarklet erfasst nur die Zeilen, die auf der Gradebook-Seite sichtbar sind (Paginierung).
- Das Bookmarklet hängt vom HTML-Aufbau der NetAcad-Seite ab und muss nach Änderungen bei Cisco eventuell angepasst werden.
- Die Werte von `status` ausser `IN PROGRESS` und die Beschriftung erledigter Häkchen (vermutlich `"Yes"`) sind noch nicht belegt.
- Ob NetAcad das Öffnen eines neuen Tabs aus dem Bookmarklet zulässt, ist noch nicht in der Praxis geprüft. Der Download-Fallback bleibt deshalb erhalten.

## 13. Ausser Scope (Version 1)

Automatischer Abruf von NetAcad, E-Mail-Versand, mehrere Benutzer, Betrieb im Netzwerk, Datenbank, CSV-/Excel-Export (kann später ergänzt werden).

---

## Anhang A: Bookmarklet

Die lesbare Quelle liegt in `bookmarklet/bookmarklet.src.js`, das fertige Bookmarklet in `bookmarklet/bookmarklet.txt` (erzeugt mit `npm run bookmarklet`). Die Extraktion ist gegen das reale Gradebook-HTML getestet (November 2026).

Ablauf:

1. Liest die Gradebook-Tabelle (Spalten über die Kopfzeile, Prüfungen über `data-testid="assignmentsHeader"`) und erzeugt den Snapshot `netacad-gradebook/1` (Abschnitt 3). `courseId` stammt aus dem Query-Parameter `id` (`new URLSearchParams(location.search).get('id')`), `url` aus `location.pathname`.
2. `json = JSON.stringify(data, null, 2)` (eingerückt, damit die Datei von Hand lesbar ist).
3. Wenn `json.length < 1000000`: neuer Tab mit `SERVER + '/import#' + encodeURIComponent(json)` (`#` in der Quelle als Escape-Sequenz, siehe Regeln). Gibt `window.open` ein Fenster zurück, ist das Bookmarklet fertig.
4. Sonst (zu gross oder Tab blockiert): Download als `<snapshotDate>-<Kurstitel bereinigt>_gradebook.json`, dazu `alert('Import-Tab konnte nicht geöffnet werden. Datei wurde heruntergeladen; bitte unter «Dateien» hochladen.')`.
5. `SERVER` ist in der Quelle der Platzhalter `__SERVER_ORIGIN__`. `scripts/build-bookmarklet.ts` ersetzt ihn durch `http://localhost:<PORT>` aus `config.ts`.
6. Unter «Einstellungen → Bookmarklet» ist das Bookmarklet als Link zum Ziehen, als Code zum Kopieren und als lesbare Quelle einsehbar.

**Regeln für `bookmarklet.src.js`:** keine `//`-Kommentare (die Quelle wird zu einer Zeile zusammengefügt), kein `%` im Code (Browser dekodieren `%XX` in `javascript:`-URLs; deshalb `\x25`), nur ASCII (Umlaute als `\u00fc` usw.), jede Anweisung mit `;` oder `}` abgeschlossen. `build-bookmarklet.ts` trimmt die Zeilen, fügt sie zusammen, setzt `javascript:` davor und prüft die Regeln.

Quelle (`bookmarklet/bookmarklet.src.js`):

```javascript
(()=>{
const SERVER='__SERVER_ORIGIN__';
const M={January:1,February:2,March:3,April:4,May:5,June:6,July:7,August:8,September:9,October:10,November:11,December:12};
const T=e=>e?e.textContent.replace(/\s+/g,' ').trim():'';
const iso=s=>{const m=String(s).match(/(\d{1,2}) ([A-Za-z]+) (\d{4})/);return m&&M[m[2]]?m[3]+'-'+String(M[m[2]]).padStart(2,'0')+'-'+m[1].padStart(2,'0'):null};
const num=s=>{const n=parseFloat(s);return isNaN(n)?null:n};
const flag=c=>{const e=c&&c.querySelector('[aria-label]');const v=e?e.getAttribute('aria-label'):T(c);return v==='No'?false:v==='Yes'?true:(v||null)};
const t=document.querySelector('table.learner-table')||document.querySelector('table');
if(!t){alert('Keine Gradebook-Tabelle gefunden');return}
const hr=[...t.tHead.rows].pop();
const H=[...hr.cells].map(th=>{const b=th.querySelector('[data-testid="assignmentsHeader"]');return b?{kind:'assessment',name:b.getAttribute('aria-label')||T(b),dueDate:iso(T(th.querySelector('[class*="fontSize_12"]')))}:{kind:'field',name:T(th)}});
const ix=n=>H.findIndex(h=>h.kind==='field'&&h.name===n);
const iL=ix('Learner'),iG=ix('Class Grade (\x25)'),iE=ix('Final Exam Score'),iF=ix('Final Exam Submitted'),iS=ix('Survey Submitted'),iC=ix('Marked Complete');
if(iL<0){alert('Spalte Learner nicht gefunden');return}
const L=[...t.tBodies[0].rows].map(r=>{const c=[...r.cells],lc=c[iL];
const nd=lc.querySelector('[class*="userName"]'),sp=nd?[...nd.querySelectorAll('span')]:[];
const p={name:T(sp[0])||T(nd),email:T(lc.querySelector('[class*="userEmail"]'))||null,status:sp.length>1?T(sp[sp.length-1]):T(lc.querySelector('[class*="userInprogress"]'))||null,
classGrade:iG>=0?num(T(c[iG])):null,finalExamScore:iE>=0?num(T(c[iE])):null,
finalExamSubmitted:iF>=0?flag(c[iF]):null,surveySubmitted:iS>=0?flag(c[iS]):null,markedComplete:iC>=0?flag(c[iC]):null,assessments:[]};
H.forEach((h,i)=>{if(h.kind!=='assessment'||!c[i])return;const g=T(c[i].querySelector('[class*="showgradesPrint"]')||c[i].querySelector('button')).match(/^(--|[\d.]+)\s*\/\s*([\d.]+)/);
p.assessments.push({name:h.name,score:g&&g[1]!=='--'?num(g[1]):null,maxScore:g?num(g[2]):null,submittedOn:iso(T(c[i].querySelector('[class*="fontSize_12"]')))})});
return p}).filter(p=>p.name||p.email);
const h1=document.querySelector('h1[class*="courseTitle"]');const kurs=T(h1)||'Kurs';
const stand=new Date().toLocaleDateString('sv-SE');
const data={format:'netacad-gradebook/1',snapshotDate:stand,exportedAt:new Date().toISOString(),course:kurs,url:location.pathname,courseId:new URLSearchParams(location.search).get('id'),assessments:H.filter(h=>h.kind==='assessment').map(h=>({name:h.name,dueDate:h.dueDate})),learners:L};
const json=JSON.stringify(data,null,2);
if(json.length<1000000){const w=window.open(SERVER+'/import\x23'+encodeURIComponent(json),'_blank');if(w){return;}}
const a=document.createElement('a');
a.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));
a.download=stand+'-'+kurs.replace(/[\\/:*?"<>|]/g,'').replace(/\s+/g,'-')+'_gradebook.json';
a.click();
alert('Import-Tab konnte nicht ge\u00f6ffnet werden. Datei wurde heruntergeladen; bitte unter \u00abDateien\u00bb hochladen.');
})()
```
