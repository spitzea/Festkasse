# Funktionen

## Kassenbetrieb

- Anmeldung mit getrennten Rollen für Kassenbenutzer, Administratoren und eine
  nur lesende Berichts-Rolle
- Touchoptimierte Kassenansicht mit großen Artikelkarten
- Gruppierung der Artikel nach farbigen Kategorien
- Warenkorb mit Erhöhen, Reduzieren und Löschen einzelner Positionen
- Berechnung von erhaltenem Betrag und Rückgeld
- Normale und kostenlose Buchungen mit Bestandsreduzierung
- Deutlich sichtbare Warnung mit Restmenge, sobald ein Artikel den Warnbestand
  erreicht
- Anzeige von Kassenleitung, Telefonnummer und frei definierbarem Hinweis
- Helles und dunkles Design

## Verwaltung

- Anlegen, Bearbeiten, Sortieren und Deaktivieren von Artikeln
- Verwaltung von Preis, Bestand, Warnbestand und Kategorie mit Prüfung der
  Eingaben vor dem Speichern
- Bis zu sechs frei benennbare und farblich konfigurierbare Kategorien
- Änderung der Benutzerpasswörter
- Konfiguration von Festname, Organisation und Logo
- Speichern und Laden wiederverwendbarer Festvorlagen

## Auswertungen

- Getrennte Auswertung normaler und kostenloser Buchungen
- Gesamtumsatz und Anzahl ausgegebener Artikel
- Tageskassenabschluss mit historischem Tagesabschluss
- Automatischer Tagesabschluss zum Ende des Betriebstags
- Erneutes Anzeigen und Drucken abgeschlossener Tageskassen
- Eigene, nur lesende Live-Auswertungsseite (`/report`) für die Berichts-Rolle,
  unabhängig und parallel zur Kassensitzung nutzbar (kein Konflikt mit der
  Ein-Sitzung-Sperre der Kasse)

### Betriebstag

Ein Kassentag läuft nicht von Mitternacht bis Mitternacht, sondern von 5 Uhr
morgens bis 5 Uhr morgens. Ein Fest endet regelmäßig erst nach Mitternacht;
ein Schnitt um 00:00 Uhr würde denselben Abend in zwei Auswertungen zerlegen.

Buchungen aus einem beendeten Betriebstag verschiebt die Kasse selbsttätig in
einen historischen Tagesabschluss - um 5 Uhr morgens, oder beim nächsten Start,
falls der Rechner zu diesem Zeitpunkt aus war. Die Bestände bleiben dabei
stehen, denn Nachfüllen ist eine Entscheidung des Personals. Der Bestand zum
Zeitpunkt des Abschlusses wird im Tagesabschluss festgehalten.

Der Abschluss über **Tageskasse abschließen** bleibt unverändert möglich und
setzt wie bisher alle Bestände zurück.

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
- Zentrale Datenhaltung, erreichbar von jedem Gerät im lokalen Netzwerk
- Genau eine aktive Sitzung gleichzeitig, um widersprüchliche Buchungen zu
  vermeiden; Übernahme durch ein anderes Gerät nur nach Rückfrage
- Versions- und Systeminformationen zur Fehleranalyse
- Raspberry-Pi-Kiosk mit automatischem Start und optionalem
  Herunterfahren-Button (nur für Administratoren)
- Systemzeit direkt im Adminbereich korrigierbar (nur Linux, z. B. bei
  Betrieb ohne Internet und damit ohne NTP)

[Zurück zur README](../README.md)
