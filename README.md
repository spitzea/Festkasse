# Festkasse Community Edition

Eine kostenlose, lokal betriebene Festkasse für Feuerwehren, Vereine und
ehrenamtliche Veranstaltungen.

- Touchoptimiert
- Offline und ohne Cloud nutzbar
- Für PC, Tablet und Raspberry-Pi-Kiosk geeignet
- Artikel-, Kategorie- und Bestandsverwaltung
- Tagesauswertung und verschiedene Druckmodi
- Open Source unter der MIT-Lizenz

![Kassenansicht mit Warenkorb](docs/pics/kasse-warenkorb.png)

## Dokumentation

| Bereich | Inhalt |
| --- | --- |
| **[Installation und Konfiguration](docs/installation.md)** | Voraussetzungen, Installation, Start, Standardzugänge und Datenspeicherung |
| **[Einrichtung unter Windows](docs/windows-setup.md)** | Installation und Betrieb unter Windows |
| **[Raspberry-Pi-Kiosk](docs/raspberry-pi-kiosk.md)** | Automatischer Start, Chromium-Kiosk, Thermodrucker und Herunterfahren |
| **[Funktionen](docs/features.md)** | Ausführliche Übersicht aller Anwendungsfunktionen |
| **[Screenshots](docs/screenshots.md)** | Kasse, Auswertung und Adminbereich |
| **[Entwicklung](docs/development.md)** | Technischer Aufbau und lokale Prüfung |
| **[Rechtliche Hinweise](docs/legal.md)** | Haftungsausschluss, Betreiberverantwortung und Lizenz |

## Projektbeschreibung

Festkasse ist eine lokale Webanwendung für einfache Verkaufs- und
Kassensituationen bei Veranstaltungen. Sie läuft über einen Node.js-Server und
kann dadurch von mehreren Browsern oder Geräten im gleichen Netzwerk verwendet
werden.

Die Anwendung richtet sich insbesondere an:

- Feuerwehren
- Vereine
- Ehrenamtliche Organisationen
- Kleine Veranstaltungen und Feste

## Funktionen

- Anmeldung mit Benutzer- und Administratorrolle
- Touchoptimierte Kassenansicht mit großen Artikelkarten
- Warenkorb mit Erhalten, Rückgeld und kostenlosen Buchungen
- Verwaltung von Artikeln, Kategorien, Preisen und Beständen
- Tagesauswertung und historische Tagesabschlüsse
- Browserdruck, TXT-Testdruck und serieller ESC/POS-Thermodruck
- Speicherung und Wiederverwendung von Festvorlagen
- Helles und dunkles Design

Eine ausführliche Übersicht steht unter [Funktionen](docs/features.md).

## Weitere Einblicke

![Tagesauswertung](docs/pics/tagesauswertung.png)

Die vollständige [Screenshot-Galerie](docs/screenshots.md) zeigt außerdem die
Anmeldung, das helle Design, das Administrationsmenü, die Artikel- und
Kategorieverwaltung, Druckeinstellungen und Festvorlagen.

## Rechtlicher Hinweis

Die Software ist nicht als fiskalisiertes Kassensystem konzipiert und erfüllt
keine gesetzlichen Anforderungen an Registrierkassen, TSE-Systeme oder
vergleichbare Kassensicherungsverordnungen.

Die Verantwortung für gesetzliche Vorgaben, Kassenrichtlinien,
Aufbewahrungspflichten und steuerliche Anforderungen liegt beim Betreiber.
Details stehen in den [rechtlichen Hinweisen](docs/legal.md).

## Support

Fehlerberichte, Verbesserungsvorschläge und Pull Requests sind willkommen. Das
Projekt wird in der Freizeit entwickelt. Eine Bearbeitung, Unterstützung oder
Umsetzung neuer Funktionen kann daher nicht garantiert werden.

## Open Source und Lizenz

Ziel dieses Projekts ist es, Vereinen, Feuerwehren und ehrenamtlichen
Organisationen eine kostenlose Grundlage für eine einfache Festkasse
bereitzustellen.

Dieses Projekt steht unter der MIT-Lizenz. Details stehen in der
[LICENSE](LICENSE).
