#!/usr/bin/env bash
#
# Point RDM at a public domain via Cloudflare Tunnel. Reusable across servers.
#
#   sudo bash scripts/setup-domain.sh <domain> [tunnel-name] [frontend-port]
#
# Examples:
#   sudo bash scripts/setup-domain.sh rdm.techvatika2026.space
#   sudo bash scripts/setup-domain.sh rdm.example.com techvatika-server-2 3599
#
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "Usage: sudo bash $0 <domain> [tunnel-name] [frontend-port]"
  exit 1
fi
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%/}"

REPO="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO/backend/.env"
CF_CONFIG="${CF_CONFIG:-/etc/cloudflared/config.yml}"
RUN_USER="${SUDO_USER:-$(whoami)}"

# Defaults pulled from backend/.env when not passed as args
get_env() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' ; }
TUNNEL="${2:-$(get_env CF_TUNNEL)}"; TUNNEL="${TUNNEL:-techvatika-tunnel}"
PORT="${3:-$(get_env FRONTEND_PORT)}"; PORT="${PORT:-3599}"

echo "==> Domain:   $DOMAIN"
echo "==> Tunnel:   $TUNNEL"
echo "==> Frontend: http://localhost:$PORT"
echo "==> Repo:     $REPO"

# 1) Update backend/.env (single source of truth for the app)
echo "==> Updating $ENV_FILE"
set_env() {
  local key="$1" val="$2"
  if grep -qE "^$key=" "$ENV_FILE"; then
    sed -i "s|^$key=.*|$key=$val|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}
set_env APP_DOMAIN "$DOMAIN"
set_env CF_TUNNEL "$TUNNEL"
set_env FRONTEND_PORT "$PORT"
chown "$RUN_USER":"$RUN_USER" "$ENV_FILE" 2>/dev/null || true

# 2) Add ingress to the Cloudflare tunnel config (needs root)
if [[ -w "$CF_CONFIG" || "$(id -u)" -eq 0 ]]; then
  echo "==> Adding ingress to $CF_CONFIG"
  python3 - "$CF_CONFIG" "$DOMAIN" "$PORT" <<'PY'
import sys
cfg, domain, port = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(cfg).read().splitlines()
# Drop any existing block for this hostname (the comment+hostname+service+optional originRequest)
out, skip = [], 0
for i, ln in enumerate(lines):
    if skip > 0:
        skip -= 1
        continue
    if ln.strip() == f"- hostname: {domain}":
        # remove this entry's lines until next "- " at same indent or blank gap
        j = i + 1
        while j < len(lines) and (lines[j].startswith("    ") or lines[j].strip()==""):
            j += 1
        skip = j - i - 1
        # also drop a trailing comment line we may have added before
        if out and out[-1].strip().startswith("#") and "RDM" in out[-1]:
            out.pop()
        continue
    out.append(ln)
block = [
    "",
    "  # 📥 RDM Download Manager",
    f"  - hostname: {domain}",
    f"    service: http://localhost:{port}",
]
# Insert before the 404 fallback (must stay last)
idx = next((k for k,l in enumerate(out) if "http_status:404" in l), None)
if idx is None:
    out += block
else:
    # step back over the fallback's comment line if present
    insert_at = idx
    if insert_at>0 and out[insert_at-1].strip().startswith("#"):
        insert_at -= 1
    out[insert_at:insert_at] = block
open(cfg,"w").write("\n".join(out)+"\n")
print("ingress updated")
PY
else
  echo "!! Cannot write $CF_CONFIG (run with sudo). Add manually before the 404 fallback:"
  echo "     - hostname: $DOMAIN"
  echo "       service: http://localhost:$PORT"
fi

# 3) Create the DNS record (CNAME -> tunnel). Uses the user's cloudflared cert.
echo "==> Routing DNS $DOMAIN -> $TUNNEL"
sudo -u "$RUN_USER" env HOME="/home/$RUN_USER" \
  cloudflared tunnel route dns "$TUNNEL" "$DOMAIN" \
  || echo "   (DNS record may already exist — continuing)"

# 4) Restart cloudflared so new ingress takes effect
if command -v systemctl >/dev/null && [[ "$(id -u)" -eq 0 ]]; then
  echo "==> Restarting cloudflared"
  systemctl restart cloudflared || echo "   (restart cloudflared manually)"
fi

# 5) Rebuild frontend + restart app (as the app user)
echo "==> Rebuilding frontend + restarting PM2"
sudo -u "$RUN_USER" bash -lc "cd '$REPO/frontend' && npm run build" || true
sudo -u "$RUN_USER" bash -lc "pm2 restart rdm-backend rdm-worker rdm-frontend" || true

echo ""
echo "Done. Open: https://$DOMAIN"
