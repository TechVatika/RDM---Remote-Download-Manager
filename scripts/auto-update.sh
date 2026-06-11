#!/usr/bin/env bash
# Pull latest from GitHub, rebuild frontend, restart PM2.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="${RDM_UPDATE_LOG:-$APP_DIR/backend/data/update.log}"
BRANCH="${RDM_GIT_BRANCH:-main}"
REMOTE="${RDM_GIT_REMOTE:-origin}"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  local line="[$(date -Iseconds)] $*"
  echo "$line"
  echo "$line" >> "$LOG_FILE"
}

cd "$APP_DIR"

log "=== RDM update started ==="

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  log "ERROR: not a git repository"
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
  log "Checking out branch $BRANCH (was $CURRENT_BRANCH)"
  git checkout "$BRANCH"
fi

log "Fetching from $REMOTE/$BRANCH…"
git fetch "$REMOTE" "$BRANCH" --quiet

LOCAL="$(git rev-parse HEAD)"
REMOTE_HASH="$(git rev-parse "$REMOTE/$BRANCH")"

if [ "$LOCAL" = "$REMOTE_HASH" ]; then
  log "Already up to date ($(git rev-parse --short HEAD))"
  exit 0
fi

BEHIND="$(git rev-list --count "HEAD..$REMOTE/$BRANCH" 2>/dev/null || echo "?")"
log "Pulling $BEHIND commit(s)…"
git pull "$REMOTE" "$BRANCH" --ff-only

log "Installing backend dependencies…"
(cd "$APP_DIR/backend" && npm install --omit=dev)

log "Installing frontend dependencies…"
(cd "$APP_DIR/frontend" && npm install)

log "Building frontend…"
(cd "$APP_DIR/frontend" && npm run build)

if command -v pm2 >/dev/null 2>&1; then
  log "Restarting PM2 services…"
  pm2 restart rdm-backend rdm-worker rdm-frontend --update-env || pm2 restart all --update-env
  pm2 save 2>/dev/null || true
else
  log "WARN: pm2 not found — restart services manually"
fi

log "=== Update complete — now at $(git rev-parse --short HEAD) ==="
