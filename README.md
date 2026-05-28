# Festkasse Zellhausen

Webbasierte MVP-Festkasse für Feuerwehrfeste, lokal im Browser oder über einen kleinen Node/Express-Server nutzbar.

## Start

```bash
npm install
npm start
```

Danach im Browser öffnen:

```text
http://localhost:3000
```

Alternativ kann `public/index.html` direkt im Browser geöffnet werden. Die Daten liegen dann im `localStorage` des Browsers.

## Demo-Logins

| Rolle | Benutzer | Passwort |
| --- | --- | --- |
| User | `kasse` | `kasse123` |
| Admin | `admin` | `admin123` |

## MVP-Funktionen

- Login mit Rollen
- Rollen: User und Admin
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
- Festname, Vereinsname und Logo im Adminbereich ändern

## Datenmodell

Die App speichert JSON-Strukturen für:

- `users`
- `articles`
- `orders`
- `order_items` als `items` innerhalb einer Bestellung
- `cancellations`
- `settings`

Für den nächsten Ausbauschritt können diese Strukturen nahezu direkt in JSON-Dateien oder SQLite-Tabellen überführt werden.
