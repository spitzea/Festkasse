# Einrichtung unter Windows

Diese Anleitung beschreibt die Installation und den Betrieb der Festkasse auf
einem Windows-Rechner.

## Voraussetzungen

- Windows 10 oder Windows 11
- Moderner Browser wie Microsoft Edge, Google Chrome oder Chromium
- Node.js 18.17 oder neuer, empfohlen wird eine aktuelle LTS-Version
- Optional Git for Windows, um das Repository über GitHub herunterzuladen und
  zu aktualisieren

## Erforderliche Programme installieren

Node.js steht auf der offiziellen Website zum Download bereit:

[Node.js herunterladen](https://nodejs.org/)

Git for Windows wird nur benötigt, wenn das Repository mit Git heruntergeladen
oder aktualisiert werden soll:

[Git for Windows herunterladen](https://git-scm.com/download/win)

Nach der Installation können die verfügbaren Versionen in PowerShell überprüft
werden:

```powershell
node --version
npm --version
git --version
```

`git --version` ist nur erforderlich, wenn Git installiert wurde.

## Repository herunterladen oder aktualisieren

Erstinstallation:

```powershell
cd $HOME\Documents
git clone https://github.com/spitzea/Festkasse.git
cd Festkasse
npm install
```

Vorhandene Installation aktualisieren:

```powershell
cd <pfad-zur-festkasse>
git pull
npm install
```

`npm install` installiert die in `package.json` definierten Pakete, darunter
`serialport` für die direkte Ansteuerung eines seriellen Thermodruckers.

## Anwendung starten

Start über die mitgelieferte Batch-Datei:

```powershell
.\start-festkasse.bat
```

Alternativ kann die Anwendung mit npm gestartet werden:

```powershell
npm start
```

Die Benutzeroberfläche ist anschließend unter folgender Adresse erreichbar:

```text
http://localhost:3000
```

Ist Port `3000` bereits belegt, kann entweder die andere Anwendung beendet oder
für die Festkasse ein abweichender Port festgelegt werden:

```powershell
$env:PORT="3001"
npm start
```

Die Benutzeroberfläche ist dann unter folgender Adresse erreichbar:

```text
http://localhost:3001
```

## Drucken

Für den Browserdruck ist keine zusätzliche Software erforderlich.

Beim TXT-Testdruck speichert die Festkasse die erzeugten Dateien im folgenden
Verzeichnis:

```text
data/prints
```

Für einen seriellen Thermodrucker muss im Administrationsbereich der
entsprechende Windows-Port eingetragen werden, beispielsweise:

```text
COM3
```

## Datenspeicherung

Die Daten der aktuell geladenen Veranstaltung werden in folgender Datei
gespeichert:

```text
data/active-event.json
```

Gespeicherte Vorlagen und Testdrucke befinden sich ebenfalls im Verzeichnis
`data`. Der Projektordner muss daher an einem Ort liegen, für den der
Windows-Benutzer Schreibrechte besitzt.
