# Raspberry Pi Kiosk Setup

Diese Anleitung richtet einen Raspberry Pi mit Raspberry Pi OS Lite als lokale Festkasse ein: Node-Server, Chromium-Kiosk auf dem angeschlossenen Monitor und Herunterfahren aus der App.

## Voraussetzungen

- Raspberry Pi OS Lite ist installiert.
- SSH ist aktiviert.
- Die Beispiele verwenden den aktuell angemeldeten Linux-Benutzer über `$USER`.
- Das Repo wird unter `$HOME/Festkasse` geklont.

## System aktualisieren

```bash
sudo apt update
sudo apt full-upgrade -y
sudo reboot
```

Nach dem Neustart wieder per SSH oder lokal anmelden.

## Pakete installieren

```bash
sudo apt update
sudo apt install -y git nodejs npm lsof curl
sudo apt install -y --no-install-recommends xserver-xorg xinit openbox unclutter
```

Chromium installieren:

```bash
sudo apt install -y --no-install-recommends chromium
```

Prüfen:

```bash
node --version
npm --version
git --version
command -v startx
command -v openbox-session
command -v chromium
command -v unclutter
```

## Festkasse holen

Wenn das Repo noch nicht geklont ist:

```bash
cd ~
git clone git@github.com:spitzea/Festkasse.git
cd Festkasse
npm install
```

Wenn das Repo schon vorhanden ist:

```bash
cd ~/Festkasse
git pull
npm install
```

## Festkasse-Service

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

`<linux-user>` durch den tatsächlichen Linux-Benutzernamen ersetzen, zum Beispiel den Wert aus `whoami`.

Aktivieren:

```bash
sudo systemctl daemon-reload
sudo systemctl enable festkasse
sudo systemctl start festkasse
sudo systemctl status festkasse
```

Test:

```bash
curl http://localhost:3000
```

## Kiosk-Start

```bash
nano ~/.xinitrc
```

Inhalt:

```bash
xset s off
xset -dpms
xset s noblank
unclutter -idle 1 &
openbox-session &

while ! curl -fsS http://localhost:3000 >/dev/null; do
  sleep 1
done

exec chromium --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble http://localhost:3000
```

Manuell testen:

```bash
startx
```

## Autologin

Autologin per systemd setzen:

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

`<linux-user>` wieder durch den tatsächlichen Linux-Benutzernamen ersetzen.

Aktivieren:

```bash
sudo systemctl daemon-reload
sudo systemctl cat getty@tty1.service
```

In der Ausgabe muss der Override `autologin.conf` sichtbar sein.

## Startx nach Login

```bash
nano ~/.bash_profile
```

Inhalt:

```bash
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
  startx
fi
```

## Shutdown aus der App

Damit der Button **Raspberry herunterfahren** ohne Passwort funktioniert:

```bash
sudo visudo -f /etc/sudoers.d/festkasse-shutdown
```

Inhalt:

```text
<linux-user> ALL=(root) NOPASSWD: /usr/sbin/shutdown
```

Auch hier `<linux-user>` durch den tatsächlichen Linux-Benutzernamen ersetzen.

Prüfen:

```bash
sudo -n /usr/sbin/shutdown --help >/dev/null && echo OK
```

## Neustart und Test

```bash
sudo reboot
```

Nach dem Neustart sollte der Raspberry automatisch einloggen, `startx` starten und Chromium im Kiosk-Modus mit Festkasse öffnen.

Wenn nur der Login-Prompt erscheint:

```bash
sudo systemctl cat getty@tty1.service
cat ~/.bash_profile
```

Wenn Login funktioniert, aber kein Browser startet:

```bash
startx
cat ~/.xinitrc
sudo systemctl status festkasse
```
