# Entwicklung

Die Anwendung nutzt bewusst keine Frontend-Frameworks.

```text
server.js              Node-HTTP-Server, JSON-Daten, Anmeldung und Druck-Endpunkte
public/app.js          Browserlogik und UI-Rendering
public/styles.css      Designsystem, Layout und Print-CSS
data/defaults.json     Neutrale Grunddaten und Systemvorlage
data/active-event.json Aktueller Laufzeitstand
```

## Lokale Qualitätsprüfung

Vor einem Commit sollten mindestens die JavaScript-Dateien auf Syntaxfehler
geprüft werden:

```bash
node --check server.js
node --check public/app.js
```

Anwendung lokal starten:

```bash
npm start
```

Die Anwendung ist anschließend unter `http://localhost:3000` erreichbar.

[Zurück zur README](../README.md)
