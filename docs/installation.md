# Installation und Konfiguration

## Voraussetzungen

- Node.js 18.17 oder neuer, empfohlen wird eine aktuelle LTS-Version
- npm
- Moderner Browser wie Microsoft Edge, Google Chrome, Chromium oder Safari
- Optional Git, um das Repository über GitHub herunterzuladen und zu
  aktualisieren

## Installation

```bash
git clone https://github.com/spitzea/Festkasse.git
cd Festkasse
npm install
```

`npm install` installiert die benötigten Pakete, unter anderem `serialport` für
den direkten seriellen Thermodrucker.

## Anwendung starten

```bash
npm start
```

Die Benutzeroberfläche ist anschließend unter folgender Adresse erreichbar:

```text
http://localhost:3000
```

Die Anwendung muss über den Node.js-Server aufgerufen werden, damit Daten
zentral in JSON-Dateien gespeichert und von mehreren Browsern oder Geräten im
gleichen Netzwerk genutzt werden können.

Wenn Port `3000` bereits belegt ist, kann ein anderer Port verwendet werden:

Linux und macOS:

```bash
PORT=3001 npm start
```

Windows PowerShell:

```powershell
$env:PORT="3001"
npm start
```

## Standardzugänge

| Rolle | Benutzer | Passwort |
| --- | --- | --- |
| Kassenbenutzer | `kasse` | `kasse123` |
| Administrator | `admin` | `admin123` |

Die Standardpasswörter sind ausschließlich für die Ersteinrichtung vorgesehen.
Ändern Sie beide Passwörter vor dem produktiven Einsatz unter
**Admin > Benutzer & Passwörter**.

Passwörter werden serverseitig ausschließlich als gesalzene Hashwerte
gespeichert.

## Konfiguration

Die Konfiguration erfolgt im Adminbereich:

- Festname, Organisation und Logo
- Artikel, Kategorien, Preise und Bestände
- Benutzerpasswörter
- Druckmodus und Drucker-Port
- Rechner oder Kassenleitung, Telefonnummer und Hinweistext

## Datenspeicherung

```text
data/defaults.json       Neutrale Grunddaten und Systemvorlage
data/active-event.json   Aktuell geladenes oder laufendes Fest
data/saved/*.json        Gespeicherte Festvorlagen
data/prints/*.txt        TXT-Testbons und TXT-Auswertungen
```

`data/defaults.json` und `data/active-event.json` sind Teil des Repositories.
Laufzeitdateien aus `data/saved` und `data/prints` werden ignoriert, damit
lokale Vorlagen und Testbons nicht versehentlich veröffentlicht werden.

## Weiterführende Anleitungen

- [Einrichtung unter Windows](windows-setup.md)
- [Einrichtung als Raspberry-Pi-Kiosk](raspberry-pi-kiosk.md)

[Zurück zur README](../README.md)
