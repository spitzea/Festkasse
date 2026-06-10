# Funktionen

## Kassenbetrieb

- Anmeldung mit getrennten Rollen für Kassenbenutzer und Administratoren
- Touchoptimierte Kassenansicht mit großen Artikelkarten
- Gruppierung der Artikel nach farbigen Kategorien
- Warenkorb mit Erhöhen, Reduzieren und Löschen einzelner Positionen
- Berechnung von erhaltenem Betrag und Rückgeld
- Normale und kostenlose Buchungen mit Bestandsreduzierung
- Anzeige von Kassenleitung, Telefonnummer und frei definierbarem Hinweis
- Helles und dunkles Design

## Verwaltung

- Anlegen, Bearbeiten, Sortieren und Deaktivieren von Artikeln
- Verwaltung von Preis, Bestand, Warnbestand und Kategorie
- Bis zu sechs frei benennbare und farblich konfigurierbare Kategorien
- Änderung der Benutzerpasswörter
- Konfiguration von Festname, Organisation und Logo
- Speichern und Laden wiederverwendbarer Festvorlagen

## Auswertungen

- Getrennte Auswertung normaler und kostenloser Buchungen
- Gesamtumsatz und Anzahl ausgegebener Artikel
- Tageskassenabschluss mit historischem Tagesabschluss
- Erneutes Anzeigen und Drucken abgeschlossener Tageskassen

## Drucken

- `Browserdruck` über den normalen Druckdialog
- `Textdatei-Testdruck` nach `data/prints`
- Direkter serieller ESC/POS-Thermodruck über `serialport`
- Gemeinsame Druckeinstellung für Bons, Auswertungen und Tagesabschlüsse

Die getestete Grundkonfiguration für einen seriellen Thermodrucker ist `9600
8N1` mit XON/XOFF-Flusskontrolle. Der Standardport unter Linux ist
`/dev/ttyUSB0`; unter Windows kann beispielsweise `COM3` verwendet werden.

Für den seriellen Thermodruck wird kein CUPS, `lp`, `lpr` oder
System-Druckdialog benötigt.

## Betrieb und Diagnose

- Lokaler Node.js-Server ohne Cloud-Abhängigkeit
- Gemeinsame Datenhaltung für mehrere Geräte im lokalen Netzwerk
- Versions- und Systeminformationen zur Fehleranalyse
- Raspberry-Pi-Kiosk mit automatischem Start und optionalem
  Herunterfahren-Button

[Zurück zur README](../README.md)
