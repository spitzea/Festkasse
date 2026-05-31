# Festkasse Zellhausen

Webbasierte Festkasse für Feuerwehrfeste, optimiert für lokale Nutzung über einen kleinen Node-Server, Kassen-PCs, Tablets und große Touchscreens.

## Start

```bash
npm install
npm start
```

Danach im Browser öffnen:

```text
http://localhost:3000
```

Wichtig: Die Kasse sollte über den Node-Server laufen. Nur dann werden Daten zentral in JSON-Dateien gespeichert und können von mehreren Browsern oder Geräten im gleichen Netzwerk genutzt werden.

## Installation

- Windows: siehe [Windows Setup](docs/windows-setup.md)
- Raspberry Pi OS Lite als lokale Kasse mit Monitor, Tastatur, Maus, Chromium-Kiosk, Autologin und Shutdown-Button: siehe [Raspberry Pi Kiosk Setup](docs/raspberry-pi-kiosk.md)

## Standardzugänge

| Rolle | Benutzer | Passwort |
| --- | --- | --- |
| User | `kasse` | `kasse123` |
| Admin | `admin` | `admin123` |

Passwörter werden serverseitig als Salt + Hash gespeichert. Über **Admin > Benutzer & Passwörter** können neue Passwörter gesetzt werden.

## Aktueller Stand

- Rollen: User und Admin
- Login mit Session-Erhalt beim Browser-Refresh
- Kassenansicht mit großen Artikelkarten, max. 5 Kategorien und fester Kachelstruktur
- Warenkorb mit Erhalten/Rückgeld, Positionen erhöhen, reduzieren und löschen
- Bon drucken für normale Buchungen
- Freibon buchen für kostenlose Buchungen mit Bestandsreduzierung
- Minimalistische Meldungen im Kassenmodus: nur Fehler und Warnungen
- Admin-Tabs für Tagesauswertung, Artikel, Kategorien, Benutzer, Drucken, Daten & Vorlagen und Einstellungen
- Tagesauswertung mit Normal, Kostenlos und Summe
- Tageskasse abschließen mit historischem Tagesabschluss
- Artikel- und Kategorieverwaltung mit Reihenfolge, Farben, Speichern-Feedback und Löschabfragen
- Einstellungen für Festname, Vereinsname, Logo, Rechner, Telefonnummer und Hinweis
- Daten & Vorlagen zum Speichern und Laden von Festständen
- Druckmodi für Browserdruck, TXT-Testdruck und vorbereiteten seriellen Thermodrucker

## Datenhaltung

Die aktive Datenquelle liegt im Ordner `data`:

```text
data/defaults.json       Grunddaten und Systemvorlage
data/fest.json           aktuell geladenes/laufendes Fest
data/events/*.json       gespeicherte Festvorlagen zur Laufzeit
data/archive/*.json      optionale Archivdaten zur Laufzeit
data/prints/*.txt        TXT-Testbons und TXT-Auswertungen
```

`data/defaults.json`, `data/fest.json` und `data/schema.json` sind Teil des Repos. Laufzeitdateien aus `data/events`, `data/archive` und `data/prints` werden ignoriert, damit Testbons und lokale Vorlagen nicht versehentlich gepusht werden.

## Admin: Daten & Vorlagen

Der Bereich **Daten & Vorlagen** ist ein eigener Admin-Menüpunkt.

- **Aktuelles Fest speichern** legt eine Vorlage mit Name, Datum und Uhrzeit ab.
- **Fest laden** lädt eine vorhandene Vorlage als neuen Arbeitsstand.
- **Default** ist die nicht löschbare Systemvorlage.
- Lokale gespeicherte Vorlagen können gelöscht werden.

Beim Laden einer Vorlage werden Verkäufe, Stornos und Tagesabschlüsse geleert und Artikelbestände auf den Standardbestand gesetzt.

## Admin: Drucken

Im Bereich **Drucken** kann der Druckmodus gesetzt werden:

- `Browserdruck`: nutzt den normalen Druckdialog des Browsers.
- `Textdatei-Testdruck`: schreibt Testbons und Auswertungen als TXT-Dateien nach `data/prints`.
- `Serieller Thermodrucker`: vorbereitet für Ports wie `COM3` oder `/dev/ttyUSB0`.

Der TXT-Testdruck dient als Test- und Übergangsmodus für den späteren Axiom-A794-Thermodrucker. Bons enthalten Festname, Vereinsname, Artikel, Preis sowie Datum und Uhrzeit. Bei Freibons wird kein Preis ausgegeben. Tagesauswertungen und historische Tagesabschlüsse nutzen dieselbe zentrale Druckeinstellung.

## Raspberry Pi Vorbereitung

Empfohlen:

- Raspberry Pi OS Lite oder Desktop, 64-bit
- Node.js LTS
- Zugriff im lokalen Netzwerk
- USB-RS232-Adapter mit FTDI-Chip für den Thermodrucker
- Drucker-Port später typischerweise `/dev/ttyUSB0`

Für den normalen Browserbetrieb reicht der Node-Server. Für echten seriellen Thermodruck muss der Drucker vor Ort mit Port, Baudrate und Kabel getestet werden.

Für den Kiosk-Betrieb siehe [Raspberry Pi Kiosk Setup](docs/raspberry-pi-kiosk.md).

## Entwicklung

Die App nutzt bewusst keine Frontend-Frameworks:

```text
server.js          Node-HTTP-Server, JSON-Daten, Login, Druck-Endpunkte
public/app.js      Browserlogik und UI-Rendering
public/styles.css  Designsystem, Layout und Print-CSS
data/schema.json   Datenmodell-Dokumentation
```

Vor einem Commit sinnvoll prüfen:

```bash
node --check server.js
node --check public/app.js
```
