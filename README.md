# Festkasse Community Edition

Eine kostenlose, lokal betriebene Festkasse fuer Feuerwehren,
Vereine und ehrenamtliche Veranstaltungen.

- Touchoptimiert
- Raspberry Pi geeignet
- Offline nutzbar
- Keine Cloud notwendig
- Open Source (MIT)

Ziel dieses Projekts ist es, Vereinen, Feuerwehren und ehrenamtlichen Organisationen eine kostenlose Grundlage fuer eine einfache Festkasse bereitzustellen.

## Projektbeschreibung

Festkasse ist eine lokale Webanwendung fuer einfache Verkaufs- und Kassensituationen bei Veranstaltungen.

- Webbasierte Festkasse fuer Vereine, Feuerwehren und Veranstaltungen
- Bedienung per PC, Tablet oder lokalem Raspberry-Pi-Kiosk
- Verwaltung von Artikeln, Kategorien, Warenkorb, Druckfunktion, Auswertungen und Benutzerrollen
- Fokus auf einfache Bedienung und schnelle Kassierung
- Druckmodi fuer Browserdruck, TXT-Testdruck und vorbereiteten seriellen Thermodrucker
- Tagesauswertung mit normalen und kostenlosen Buchungen sowie Summen

Version: Community Edition

Zielgruppe:

- Feuerwehren
- Vereine
- Ehrenamtliche Organisationen

## Installation

### Voraussetzungen

- Node.js 18.17 oder hoeher, empfohlen Node.js 20 LTS
- npm
- Moderner Browser wie Microsoft Edge, Google Chrome, Chromium oder Safari
- Optional: Git, wenn das Projekt direkt aus GitHub geklont oder aktualisiert werden soll

Plattformspezifische Anleitungen:

- Windows: siehe [Windows Setup](docs/windows-setup.md)
- Raspberry Pi OS Lite mit Monitor, Tastatur, Maus, Chromium-Kiosk, Autologin und Shutdown-Button: siehe [Raspberry Pi Kiosk Setup](docs/raspberry-pi-kiosk.md)

### Installation

```bash
git clone <repository-url>
cd Festkasse
npm install
```

`npm install` installiert die benoetigten Pakete, unter anderem `serialport` fuer den direkten seriellen Thermodrucker.

### Starten der Anwendung

```bash
npm start
```

Danach im Browser oeffnen:

```text
http://localhost:3000
```

Wichtig: Die Kasse sollte ueber den Node-Server laufen. Nur dann werden Daten zentral in JSON-Dateien gespeichert und koennen von mehreren Browsern oder Geraeten im gleichen Netzwerk genutzt werden.

Wenn Port `3000` bereits belegt ist, kann ein anderer Port gesetzt werden:

```bash
PORT=3001 npm start
```

Unter Windows PowerShell:

```powershell
$env:PORT="3001"
npm start
```

### Konfiguration

Die Konfiguration erfolgt ueber den Adminbereich der Anwendung:

- Festname, Organisation und Logo
- Artikel, Kategorien, Preise und Bestand
- Benutzerpasswoerter
- Druckmodus und Drucker-Port
- Rechner/Kassenleitung, Telefonnummer und Hinweistext

Die aktive Datenquelle liegt im Ordner `data`:

```text
data/defaults.json       neutrale Grunddaten und Systemvorlage
data/fest.json           aktuell geladenes/laufendes Fest
data/events/*.json       gespeicherte Festvorlagen zur Laufzeit
data/archive/*.json      optionale Archivdaten zur Laufzeit
data/prints/*.txt        TXT-Testbons und TXT-Auswertungen
```

`data/defaults.json`, `data/fest.json` und `data/schema.json` sind Teil des Repositories. Laufzeitdateien aus `data/events`, `data/archive` und `data/prints` werden ignoriert, damit lokale Vorlagen, Archivdaten und Testbons nicht versehentlich veroeffentlicht werden.

## Standardzugaenge

| Rolle | Benutzer | Passwort |
| --- | --- | --- |
| User | `kasse` | `kasse123` |
| Admin | `admin` | `admin123` |

Die Standardpasswoerter sind nur fuer die Ersteinrichtung gedacht und sollten vor dem produktiven Einsatz im Adminbereich geaendert werden.

Passwoerter werden serverseitig als Salt + Hash gespeichert. Ueber **Admin > Benutzer & Passwoerter** koennen neue Passwoerter gesetzt werden.

## Funktionen

- Login mit Rollen fuer User und Admin
- Kassenansicht mit grossen Artikelkarten
- Warenkorb mit Erhalten/Rueckgeld, Positionen erhoehen, reduzieren und loeschen
- Bon drucken fuer normale Buchungen
- Kostenlos buchen fuer kostenlose Buchungen mit Bestandsreduzierung
- Tagesauswertung mit Normal, Kostenlos und Summe
- Tageskasse abschliessen mit historischem Tagesabschluss
- Artikel- und Kategorieverwaltung mit Reihenfolge, Farben und Speicher-Feedback
- Daten & Vorlagen zum Speichern und Laden von Feststaenden
- Info-Ansicht mit Versions- und Systemdaten fuer Fehlersuche

## Drucken

Im Bereich **Drucken** kann der Druckmodus gesetzt werden:

- `Browserdruck`: nutzt den normalen Druckdialog des Browsers.
- `Textdatei-Testdruck`: schreibt Testbons und Auswertungen als TXT-Dateien nach `data/prints`.
- `Serieller Thermodrucker`: schreibt ESC/POS direkt per `serialport` auf einen seriellen Port, standardmaessig `/dev/ttyUSB0`.

Tagesauswertungen und historische Tagesabschluesse nutzen dieselbe zentrale Druckeinstellung.

Fuer den seriellen Thermodrucker wird kein CUPS, `lp`, `lpr` oder System-Druckdialog verwendet. Die getestete Grundkonfiguration ist `9600 8N1` mit XON/XOFF-Flusskontrolle. Jeder Bon wird mit `ESC @` initialisiert, vorgeschoben und danach mit `GS V 01` teilweise geschnitten.

## Haftungsausschluss

Diese Software wird kostenlos und ohne Gewährleistung bereitgestellt. Die Nutzung erfolgt auf eigenes Risiko. Es besteht kein Anspruch auf Support, Fehlerbehebungen oder Weiterentwicklung.

## Wichtiger Hinweis

Diese Software ist nicht als fiskalisiertes Kassensystem konzipiert
und erfuellt keine gesetzlichen Anforderungen an Registrierkassen,
TSE-Systeme oder vergleichbare Kassensicherungsverordnungen.

Die Software richtet sich primaer an Vereine, Feuerwehren und
ehrenamtliche Veranstaltungen.

## Rechtlicher Hinweis

Die Software ersetzt keine steuerliche, rechtliche oder buchhalterische Beratung. Der Betreiber ist selbst für die Einhaltung aller gesetzlichen Vorgaben, Kassenrichtlinien, Aufbewahrungspflichten und steuerlichen Anforderungen verantwortlich.

## Support

Feedback, Verbesserungsvorschläge und Pull Requests sind willkommen. Eine Bearbeitung oder Unterstützung kann jedoch nicht garantiert werden.

Ideen, Lob, Fehlerberichte und Verbesserungsvorschläge sind willkommen. Das Projekt wird jedoch in der Freizeit entwickelt. Reaktionszeiten und Umsetzung neuer Funktionen können daher variieren.

## Open-Source-Hinweis

Ziel dieses Projekts ist es, Vereinen, Feuerwehren und ehrenamtlichen Organisationen eine kostenlose Grundlage für eine einfache Festkasse bereitzustellen.

## Entwicklung

Die App nutzt bewusst keine Frontend-Frameworks:

```text
server.js          Node-HTTP-Server, JSON-Daten, Login, Druck-Endpunkte
public/app.js      Browserlogik und UI-Rendering
public/styles.css  Designsystem, Layout und Print-CSS
data/schema.json   Datenmodell-Dokumentation
```

Vor einem Commit sinnvoll pruefen:

```bash
node --check server.js
node --check public/app.js
```

## Lizenz

Dieses Projekt steht unter der MIT-Lizenz. Details siehe [LICENSE](LICENSE).
