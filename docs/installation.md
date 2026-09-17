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
zentral in JSON-Dateien gespeichert werden. Sie ist von jedem Browser oder
Gerät im gleichen Netzwerk erreichbar; angemeldet sein kann jeweils aber nur
eine Sitzung gleichzeitig, damit sich Buchungen von mehreren Kassen nicht
gegenseitig überschreiben. Meldet sich ein weiteres Gerät an, kann es die
aktive Sitzung nach Rückfrage übernehmen.

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
| Bericht (nur lesend) | `report` | `report123` |

Die Standardpasswörter sind ausschließlich für die Ersteinrichtung vorgesehen.
Ändern Sie alle drei Passwörter vor dem produktiven Einsatz unter
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
data/logo.json           Logo des Festes (getrennt von der Festdatei)
data/saved/*.json        Gespeicherte Festvorlagen
data/prints/*.txt        TXT-Testbons und TXT-Auswertungen
```

Nur `data/defaults.json` ist Teil des Repositories. Es enthält die neutrale
Vorlage ohne Vereinsdaten, ohne Logo und ohne Buchungen.

`data/active-event.json` ist der laufende Zustand der Kasse und wird bewusst
nicht versioniert. Beim ersten Start legt der Server die Datei automatisch aus
`data/defaults.json` an. Ebenso ignoriert werden `data/saved` und
`data/prints`, damit lokale Vorlagen, Vereinsdaten und Testbons nicht
versehentlich veröffentlicht werden.

Seit Version 1.6.0 liegt das Logo in `data/logo.json` und nicht mehr in der
Festdatei. Ein vorhandenes Logo wandert beim ersten Start der neuen Version
automatisch dorthin; die Festdatei schrumpft dadurch erheblich, weil sie bei
jeder Buchung vollständig neu geschrieben wird. Entfernen lässt sich das Logo
unter **Admin > Einstellungen**.

### Hinweis für bestehende Installationen

Frühere Versionen haben `data/active-event.json` mitversioniert. Beim ersten
`git pull` auf Version 1.5.0 oder neuer bricht Git deshalb einmalig mit
`Your local changes to the following files would be overwritten by merge` ab.
Der Kassenstand geht dabei nicht verloren, das Update kommt nur nicht durch.

Beenden Sie die Kasse und führen Sie einmalig aus:

```bash
mv data/active-event.json ../active-event-sicherung.json
git pull
mv ../active-event-sicherung.json data/active-event.json
```

Danach läuft `git pull` wieder wie gewohnt, und die Datei bleibt dauerhaft aus
der Versionsverwaltung heraus. Legen Sie vorher eine Sicherung an, falls die
Kasse bereits Buchungen enthält.

## Weiterführende Anleitungen

- [Einrichtung unter Windows](windows-setup.md)
- [Einrichtung als Raspberry-Pi-Kiosk](raspberry-pi-kiosk.md)

[Zurück zur README](../README.md)
