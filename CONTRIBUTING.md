# Mitarbeit an der Festkasse

Diese Datei beschreibt die verbindlichen Regeln für Code, Daten, Commits,
Push und Releases. Sie gilt für alle, die an diesem Projekt arbeiten, auch für
KI-Assistenten.

Die Festkasse ist ein Hobbyprojekt für Vereine und Feuerwehren. Die Regeln sind
bewusst knapp gehalten. Was hier steht, gilt aber ausnahmslos.

## Grundsätze

- Kein Frontend-Framework, kein Bundler, kein Build-Schritt. Die Dateien unter
  `public/` werden so ausgeliefert, wie sie im Repository liegen.
- Laufzeitabhängigkeiten werden nur aufgenommen, wenn es keine Alternative
  gibt. Derzeit ist `serialport` die einzige.
- Oberfläche, Dokumentation und Commit-Nachrichten sind deutsch.
- Die Kasse muss vollständig offline funktionieren. Kein Aufruf externer
  Dienste, keine Schriftarten oder Skripte von fremden Servern.

## Aufbau

```text
server.js              Node-HTTP-Server, JSON-Daten, Anmeldung, Druck
public/app.js          Browserlogik und Oberfläche
public/report-shared.js Auswertungslogik, geteilt zwischen Server und Browser
public/styles.css      Designsystem, Layout und Druck-CSS
data/defaults.json     Neutrale Grunddaten, versioniert
data/active-event.json Laufender Kassenstand, nicht versioniert
```

Logik, die Server und Browser beide brauchen, gehört nach
`public/report-shared.js` und wird nicht kopiert.

## Coding-Regeln

**Rechte werden auf dem Server geprüft.** Die Oberfläche blendet Bedienelemente
nach Rolle aus, das ist Komfort und keine Absicherung. Jeder Endpunkt in
`handleApi` prüft die Rolle selbst. Wer einen Endpunkt hinzufügt, legt die
erforderliche Rolle ausdrücklich fest.

**Nie fremde Eingaben in HTML einsetzen, ohne sie zu maskieren.** Wird Text aus
dem Zustand in ein Template geschrieben, läuft er vorher durch die vorhandene
Escape-Funktion. Das betrifft auch Felder, die scheinbar nur der Administrator
füllt.

**Geldbeträge in Cent rechnen.** Ganzzahlig speichern und rechnen, erst bei der
Anzeige formatieren. Keine Gleitkommaarithmetik auf Preisen.

**Dateipfade begrenzen.** Pfade aus Einstellungen oder Anfragen werden gegen
das Projektverzeichnis geprüft, bevor geschrieben wird.

**Keine Geheimnisse im Code und nicht in Commits.** Passwörter liegen
ausschließlich als gesalzene Hashwerte vor. Die dokumentierten
Standardpasswörter in `data/defaults.json` sind Absicht und bleiben.

## Datenregeln

`data/active-event.json` enthält den laufenden Kassenstand mit Vereinsnamen,
Logo, Kontaktdaten und Buchungen. Die Datei gehört **niemals** ins Repository.
Sie steht in `.gitignore`. Der Server legt sie beim Erststart aus
`data/defaults.json` an.

`data/defaults.json` bleibt neutral. Kein Vereinsname, kein Logo, keine
Telefonnummer, keine Buchungen, alle drei Benutzerkonten mit den
dokumentierten Standardpasswörtern.

Prüfen Sie vor jedem Commit mit `git status`, dass keine Datei aus `data/`
ungewollt vorgemerkt ist.

**Tests laufen nie gegen `data/`.** Wer einen Server zum Ausprobieren startet,
nutzt einen eigenen Port und ein eigenes Datenverzeichnis. Ein Testlauf gegen
das echte Verzeichnis überschreibt den Kassenstand eines laufenden Festes.

## Vor dem Commit

```bash
node --check server.js
node --check public/app.js
node --check public/report-shared.js
npm start
```

Danach in der Oberfläche mindestens anmelden, eine Buchung anlegen, stornieren
und die Auswertung öffnen. Wer an Rollen oder Anmeldung gearbeitet hat, prüft
zusätzlich alle drei Konten.

## Commit-Regeln

- Ein Commit, ein Thema. Aufräumen und Funktionsänderung nicht mischen.
- Betreffzeile deutsch, im Aussagesatz, höchstens 72 Zeichen, ohne Punkt am
  Ende.
- Rumpf erklärt das Warum, nicht das Was. Zeilen auf 72 Zeichen umbrechen.
- Gehört der Commit zu einem Issue, wird es im Rumpf genannt.

**Dateien einzeln vormerken und danach ohne Pfadangabe committen:**

```bash
git add server.js public/app.js
git status
git commit
```

Nicht `git commit -- <datei>` verwenden. Diese Form committet den Stand im
Arbeitsverzeichnis und übergeht den Index. Eine mit `git rm --cached`
vorgemerkte Entfernung geht dabei verloren und die Datei landet erneut im
Repository.

Nicht `git commit -a` verwenden. Es nimmt Änderungen mit, die niemand geprüft
hat.

## Branches und Push

- Kleine Korrekturen dürfen direkt auf `main`.
- Alles, was mehr als eine Datei berührt oder über mehrere Sitzungen läuft,
  bekommt einen eigenen Branch mit sprechendem Namen, etwa
  `fix/qr-code-netzwerkwechsel`.
- Vor dem Push `git log --stat` über die eigenen Commits laufen lassen und
  prüfen, dass keine Laufzeit- oder Vereinsdaten enthalten sind. Was einmal
  auf GitHub liegt, ist öffentlich, auch nach einem späteren Löschen.
- Kein erzwungener Push auf `main`.
- Geschichte wird nur umgeschrieben, solange nichts veröffentlicht ist, und
  nur, wenn niemand sonst auf dem Branch arbeitet.

## Parallele Sitzungen

Mehrere Personen oder Assistenten arbeiten gelegentlich gleichzeitig im selben
Arbeitsverzeichnis. Das führt zu vertauschten Branches und überschriebenen
Dateien.

Wer länger an einem Thema arbeitet, legt sich ein eigenes Arbeitsverzeichnis
an:

```bash
git worktree add ../Festkasse-<thema> -b fix/<thema>
```

Vor einem Branch-Wechsel oder einem `git reset` im gemeinsamen Verzeichnis
prüfen, ob dort jemand anderes arbeitet.

## Releases

1. Version in `package.json` anheben.
2. Prüfen, dass die Versionsangabe in der Oberfläche dazu passt.
3. Tag setzen und Release anlegen.
4. **Die Release-Notes beschreiben nur, was wirklich im Code steht.** Vor dem
   Veröffentlichen jeden genannten Punkt im Diff nachsehen. Eine angekündigte
   Sicherheitskorrektur, die es nicht in den Code geschafft hat, ist
   schlimmer als gar keine Ankündigung, weil sich Betreiber darauf verlassen.

## Sicherheitslücken melden

Sicherheitsrelevante Funde bitte nicht als öffentliches Issue anlegen, sondern
direkt an den Betreuer des Repositories melden.

[Zurück zur README](README.md)
