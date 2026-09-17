# Hinweise für KI-Assistenten

Diese Datei gilt für jeden KI-Assistenten, der in diesem Repository arbeitet,
unabhängig vom Werkzeug. Sie ist die einzige Datei dieser Art; werkzeugeigene
Varianten werden bewusst nicht zusätzlich gepflegt.

Die verbindlichen Regeln für dieses Projekt stehen in [CONTRIBUTING.md](CONTRIBUTING.md).
Lies sie, bevor du Code, Daten oder Git-Geschichte änderst. Sie gelten
unverändert auch für dich.

Diese Punkte gehen in der Praxis am häufigsten schief:

**`data/active-event.json` niemals anfassen.** Die Datei ist der laufende
Kassenstand eines echten Festes und nicht versioniert. Nicht committen, nicht
überschreiben, nicht löschen, nicht als Testgrundlage verwenden.

**Testserver nur mit eigenem Port und eigenem Datenverzeichnis starten.** Ein
Start gegen `data/` zerstört den Kassenstand.

**Kein `git commit -- <datei>` und kein `git commit -a`.** Dateien einzeln mit
`git add` vormerken, mit `git status` prüfen, dann ohne Pfadangabe committen.
Die Pfadangabe übergeht den Index und macht ein `git rm --cached` rückgängig.

**Nicht ungefragt pushen.** Veröffentlichen entscheidet der Betreuer.

**Auf parallele Sitzungen achten.** Mehrere Assistenten teilen sich dieses
Arbeitsverzeichnis. Vor einem Branch-Wechsel, einem `git reset` oder dem
Beenden eines Node-Prozesses prüfen, ob jemand anderes daran arbeitet. Für
längere Arbeiten ein eigenes Worktree anlegen.

**Rechte gehören auf den Server.** Die Oberfläche blendet Bedienelemente nur
aus, das ersetzt keine Prüfung in `handleApi`.

**Deutsch schreiben.** Oberfläche, Dokumentation und Commit-Nachrichten.
