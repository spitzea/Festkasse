# Festkasse Zellhausen

Webbasierte MVP-Festkasse für Feuerwehrfeste, lokal im Browser oder über einen kleinen Node-Server nutzbar.

## Start

```bash
npm install
npm start
```

Danach im Browser öffnen:

```text
http://localhost:3000
```

Wichtig: Die Kasse sollte über den Node-Server laufen. Nur dann werden Daten zentral in JSON-Dateien gespeichert und können von mehreren Browsern oder Geräten genutzt werden.

## Demo-Logins

| Rolle | Benutzer | Passwort |
| --- | --- | --- |
| User | `kasse` | `kasse123` |
| Admin | `admin` | `admin123` |

Passwörter werden in den Festdaten nicht im Klartext gespeichert, sondern als Salt + Hash.

## Datenhaltung

Die laufenden Festdaten liegen zentral auf dem Server:

```text
data/defaults.json       Grunddaten und neutrale Vorlage
data/fest.json           aktuell geladenes/laufendes Fest
data/events/*.json       gespeicherte Feste und Vorlagen
data/archive/*.json      Archiv für abgeschlossene Feste
```

`public/app.js` enthält nur noch die Browserlogik und einen Fallback-Datensatz für die Oberfläche. Die aktive Datenquelle ist `data/fest.json`.

## Admin: Daten & Vorlagen

Unter `Einstellungen` gibt es den Bereich `Daten & Vorlagen`:

- aktuelles Fest sichern
- neues Fest aus Default starten
- Default-Daten laden
- gespeicherte Feste vollständig laden
- gespeicherte Feste als Vorlage laden
- fremde/alte Festdateien löschen

Beim Laden als Vorlage werden Artikel, Kategorien, Benutzer und Einstellungen übernommen. Verkäufe, Stornos und Tagesabschlüsse werden geleert und Artikelbestände auf 500 gesetzt.

## MVP-Funktionen

- Login mit Rollen
- Rollen: User und Admin
- zentrale JSON-Datenhaltung über den Node-Server
- Kassenansicht mit großen Artikelbuttons
- dauerhaft sichtbarer Warenkorb
- Positionen erhöhen, reduzieren und löschen
- Warenkorb leeren
- Bon drucken schließt eine normale Buchung ab und erzeugt je Artikel einen 80-mm-Bon
- Freibon buchen erzeugt ebenfalls Bons, reduziert Bestand und landet separat in der Auswertung
- Rückgeldrechner
- Bestand wird beim Bezahlen reduziert
- Warnung bei knappem Bestand
- Admin-Auswertung mit getrennten Tabellen für normale Buchungen, kostenlose Buchungen und Gesamtverbrauch
- Artikel anlegen, bearbeiten, deaktivieren, kategorisieren, einfärben und Bestand korrigieren
- Kategorien verwalten
- Festname, Vereinsname, Logo, Rechner, Telefonnummer und Hinweis im Adminbereich ändern
- Passwörter im Adminbereich neu setzen
