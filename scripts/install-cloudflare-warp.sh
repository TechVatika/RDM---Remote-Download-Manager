#!/usr/bin/env bash
# Install Cloudflare WARP and configure local SOCKS proxy (adult sites only in RDM).
set -euo pipefail

WARP="warp-cli --accept-tos"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

. /etc/os-release 2>/dev/null || true
CODENAME="${VERSION_CODENAME:-$(lsb_release -cs 2>/dev/null || echo jammy)}"

echo "==> Adding Cloudflare WARP repository (${CODENAME})"
curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg | gpg --yes --dearmor -o /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ ${CODENAME} main" \
  > /etc/apt/sources.list.d/cloudflare-client.list

apt-get update -qq
apt-get install -y cloudflare-warp

PORT="${WARP_PROXY_PORT:-40000}"

echo "==> Registering WARP (free tier, accepting ToS)"
$WARP registration new 2>/dev/null || $WARP register

echo "==> Ensuring proxy mode ONLY (never full-system WARP tunnel)"
$WARP disconnect 2>/dev/null || true
$WARP mode proxy
$WARP proxy port "${PORT}"

echo "==> WARP left OFF — RDM connects only during adult-site downloads"
$WARP disconnect 2>/dev/null || true

CURRENT_MODE="$($WARP settings 2>/dev/null | grep -i '^(.set).*Mode:' || $WARP settings 2>/dev/null | grep -i 'Mode:' || true)"
echo "WARP mode: ${CURRENT_MODE:-WarpProxy on port ${PORT}}"
echo ""
echo "WARP SOCKS proxy: socks5h://127.0.0.1:${PORT}"
echo "IMPORTANT: RDM uses this SOCKS proxy ONLY for adult-site yt-dlp downloads."
echo "YouTube, Instagram, and direct HTTP downloads are NOT routed through WARP."
echo "Enable in RDM: Platform Auth → Adult sites → Cloudflare WARP"
echo "Or set in backend/.env: ADULT_SITES_USE_WARP=true"
