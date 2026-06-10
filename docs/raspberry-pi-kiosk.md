# Einrichtung als Raspberry-Pi-Kiosk

Diese Anleitung beschreibt die Einrichtung eines Raspberry Pi mit Raspberry Pi
OS Lite als lokale Festkasse. Sie umfasst den Node.js-Server, Chromium im
Kiosk-Modus auf einem angeschlossenen Monitor und das Herunterfahren über die
Anwendung.

## Voraussetzungen

- Raspberry Pi OS Lite ist installiert.
- SSH ist aktiviert.
- Die Beispiele verwenden den aktuell angemeldeten Linux-Benutzer.
- Das Repository wird unter `$HOME/Festkasse` gespeichert.

## System aktualisieren

```bash
sudo apt update
sudo apt full-upgrade -y
sudo reboot
```

Melden Sie sich nach dem Neustart erneut über SSH oder direkt am Gerät an.

## Pakete installieren

```bash
sudo apt update
sudo apt install -y git nodejs npm lsof curl build-essential python3 make g++
sudo apt install -y --no-install-recommends xserver-xorg xinit openbox unclutter x11-xserver-utils numlockx python3-xdg
```

Chromium installieren:

```bash
sudo apt install -y --no-install-recommends chromium
```

Installation überprüfen:

```bash
node --version
npm --version
git --version
command -v startx
command -v openbox-session
command -v chromium
command -v unclutter
command -v xmodmap
command -v numlockx
python3 -c "import xdg; print('pyxdg OK')"
```

## Repository herunterladen oder aktualisieren

Erstinstallation:

```bash
cd ~
git clone https://github.com/spitzea/Festkasse.git
cd Festkasse
npm install
```

Vorhandene Installation aktualisieren:

```bash
cd ~/Festkasse
git pull
npm install
```

## Thermodrucker über USB-RS232

Getestete Konfiguration:

- Port: `/dev/ttyUSB0`
- Baudrate: `9600`
- Datenformat: `8N1`
- Flusskontrolle: XON/XOFF
- Druckprotokoll: ESC/POS direkt über `serialport`

Der Linux-Benutzer benötigt Zugriff auf den seriellen Port:

```bash
sudo usermod -aG dialout $(whoami)
sudo reboot
```

Verbindung nach dem Neustart überprüfen:

```bash
ls -l /dev/ttyUSB0
printf '\x1B\x40TEST\r\n\r\n\x1D\x56\x01' > /dev/ttyUSB0
```

Anschließend unter **Admin > Drucken** konfigurieren:

- Druckmodus: `Serieller Thermodrucker`
- Drucker-Port: `/dev/ttyUSB0`
- Speichern
- `Testbon schreiben`

## Systemdienst für die Festkasse

```bash
sudo nano /etc/systemd/system/festkasse.service
```

Inhalt:

```ini
[Unit]
Description=Festkasse Node Server
After=network.target

[Service]
Type=simple
User=<linux-user>
WorkingDirectory=/home/<linux-user>/Festkasse
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

Ersetzen Sie `<linux-user>` durch den tatsächlichen Linux-Benutzernamen. Dieser
kann mit `whoami` ermittelt werden.

Dienst aktivieren und starten:

```bash
sudo systemctl daemon-reload
sudo systemctl enable festkasse
sudo systemctl start festkasse
sudo systemctl status festkasse
```

Erreichbarkeit überprüfen:

```bash
curl http://localhost:3000
```

## Kiosk-Modus konfigurieren

Die Taste F5 kann im Kiosk-Modus bei bestimmten Kombinationen aus Raspberry Pi
und Chromium zu einem schwarzen Bildschirm führen. Sie wird deshalb in der
X-Sitzung deaktiviert. NumLock wird beim Start für den Nummernblock aktiviert.

```bash
nano ~/.xinitrc
```

Inhalt:

```bash
xset s off
xset -dpms
xset s noblank
xmodmap -e "keycode 71 ="
numlockx on
unclutter -idle 1 &
openbox-session &

while ! curl -fsS http://localhost:3000 >/dev/null; do
  sleep 1
done

while true; do
  chromium \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --no-first-run \
    --disable-translate \
    --disable-gpu \
    --disable-gpu-compositing \
    http://localhost:3000
  sleep 1
done
```

Kiosk-Modus manuell testen:

```bash
startx
```

## Automatische Anmeldung

Automatische Anmeldung über systemd konfigurieren:

```bash
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d
sudo nano /etc/systemd/system/getty@tty1.service.d/autologin.conf
```

Inhalt:

```ini
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin <linux-user> --noclear %I $TERM
```

Ersetzen Sie `<linux-user>` erneut durch den tatsächlichen
Linux-Benutzernamen.

Konfiguration übernehmen und überprüfen:

```bash
sudo systemctl daemon-reload
sudo systemctl cat getty@tty1.service
```

In der Ausgabe muss die Überschreibungsdatei `autologin.conf` aufgeführt sein.

## Grafische Oberfläche nach der Anmeldung starten

```bash
nano ~/.bash_profile
```

Inhalt:

```bash
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
  while true; do
    startx
    sleep 2
  done
fi
```

Chromium wird neu gestartet, wenn nur der Browser beendet wurde. Nach dem Ende
der gesamten X-Sitzung startet `startx` nach kurzer Pause erneut. Der
vorgesehene Weg zum Beenden des Systems bleibt die Schaltfläche zum
Herunterfahren in der Festkasse.

> **Sicherheitshinweis:** Mit physischem Zugriff auf Tastatur, Datenträger oder
> SSH lässt sich ein Linux-System nicht vollständig absichern. Der
> Kiosk-Benutzer sollte keine unnötigen `sudo`-Berechtigungen erhalten. Eine
> passwortlose Ausführung sollte ausschließlich für `/usr/sbin/shutdown`
> eingerichtet werden.

## Herunterfahren über die Anwendung

Damit die Schaltfläche **Raspberry herunterfahren** ohne Passwortabfrage
funktioniert:

```bash
sudo visudo -f /etc/sudoers.d/festkasse-shutdown
```

Inhalt:

```text
<linux-user> ALL=(root) NOPASSWD: /usr/sbin/shutdown
```

Ersetzen Sie auch hier `<linux-user>` durch den tatsächlichen
Linux-Benutzernamen.

Berechtigung überprüfen:

```bash
sudo -n /usr/sbin/shutdown --help >/dev/null && echo OK
```

## Einrichtung abschließen und überprüfen

```bash
sudo reboot
```

Nach dem Neustart sollte sich der Raspberry Pi automatisch anmelden, `startx`
ausführen und die Festkasse in Chromium im Kiosk-Modus öffnen.

Fehleranalyse, wenn nur die Anmeldeaufforderung erscheint:

```bash
sudo systemctl cat getty@tty1.service
cat ~/.bash_profile
```

Fehleranalyse, wenn die Anmeldung funktioniert, aber Chromium nicht startet:

```bash
startx
cat ~/.xinitrc
sudo systemctl status festkasse
```
