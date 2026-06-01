# Windows Setup

Diese Anleitung richtet die Festkasse auf einem Windows-Rechner ein.

## Voraussetzungen

- Windows 10 oder Windows 11
- Browser: Microsoft Edge, Google Chrome oder Chromium
- Node.js 18.17 oder hoeher, empfohlen Node.js 20 LTS
- Optional: Git for Windows, wenn das Projekt direkt aus GitHub geholt oder aktualisiert werden soll

## Programme installieren

Node.js LTS installieren:

```text
https://nodejs.org/
```

Git for Windows installieren, wenn das Repo per Git geklont oder aktualisiert werden soll:

```text
https://git-scm.com/download/win
```

Prüfen:

```powershell
node --version
npm --version
git --version
```

`git --version` ist nur nötig, wenn Git verwendet wird.

## Festkasse holen

Wenn das Repo noch nicht geklont ist:

```powershell
cd $HOME\Documents
git clone <repository-url>
cd Festkasse
npm install
```

Wenn das Repo schon vorhanden ist:

```powershell
cd <pfad-zur-festkasse>
git pull
npm install
```

`npm install` installiert die in `package.json` definierten Pakete, unter anderem `serialport` fuer den direkten seriellen Thermodrucker.

## Starten

Variante 1: per Batch-Datei:

```powershell
.\start-festkasse.bat
```

Variante 2: per npm:

```powershell
npm start
```

Danach im Browser öffnen:

```text
http://localhost:3000
```

Wenn der Port 3000 schon belegt ist, zeigt die Festkasse beim Start eine Meldung. Dann das andere Programm beenden oder die Festkasse mit einem anderen Port starten:

```powershell
$env:PORT="3001"
npm start
```

Adresse im Browser:

```text
http://localhost:3001
```

## Drucken

Für Browserdruck ist kein zusätzliches Paket nötig.

Für TXT-Testdruck schreibt die Festkasse Dateien nach:

```text
data/prints
```

Für einen seriellen Thermodrucker wird später der passende Windows-Port in der App eingetragen, zum Beispiel:

```text
COM3
```

## Daten

Die aktiven Daten liegen im Projektordner unter:

```text
data/fest.json
```

Gespeicherte Vorlagen, Archivdaten und Testdrucke liegen ebenfalls unter `data`. Den Projektordner deshalb nicht in einen schreibgeschützten Bereich legen.
