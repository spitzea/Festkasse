#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${FESTKASSE_REPO_URL:-https://github.com/spitzea/Festkasse.git}"
APP_DIR="${FESTKASSE_DIR:-$HOME/Festkasse}"
SERVICE_NAME="${FESTKASSE_SERVICE:-festkasse}"
BACKUP_DIR="${FESTKASSE_BACKUP_DIR:-$HOME/Festkasse-backups}"

echo "Festkasse Update"
echo "Repo:    $REPO_URL"
echo "Ordner:  $APP_DIR"
echo "Service: $SERVICE_NAME"
echo

echo "Stoppe Service, falls vorhanden..."
sudo systemctl stop "$SERVICE_NAME" 2>/dev/null || true
pkill -f "node server.js" 2>/dev/null || true

if [ -f "$APP_DIR/data/fest.json" ]; then
  mkdir -p "$BACKUP_DIR"
  backup_file="$BACKUP_DIR/fest-$(date +%Y%m%d-%H%M%S).json"
  cp "$APP_DIR/data/fest.json" "$backup_file"
  echo "Backup geschrieben: $backup_file"
fi

echo "Installiere Systempakete..."
sudo apt update
sudo apt install -y git nodejs npm build-essential python3 make g++

if [ -d "$APP_DIR/.git" ]; then
  echo "Setze vorhandenes Repo auf origin/main zurueck..."
  cd "$APP_DIR"
  git fetch --tags origin
  git reset --hard origin/main
  git clean -fd
else
  echo "Klonen..."
  rm -rf "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

echo "Installiere npm-Pakete..."
npm install

echo "Aktiviere seriellen Port fuer Benutzer $USER..."
sudo usermod -aG dialout "$USER" || true

echo "Starte Service..."
sudo systemctl daemon-reload
sudo systemctl start "$SERVICE_NAME"
sudo systemctl status "$SERVICE_NAME" --no-pager -l || true

echo
echo "Fertig."
echo "Letzter Commit:"
git log -1 --oneline
echo
echo "Wenn die dialout-Gruppe neu hinzugefuegt wurde, bitte einmal rebooten:"
echo "sudo reboot"
