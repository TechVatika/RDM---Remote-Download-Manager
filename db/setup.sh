#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${DB_NAME:-rdm}"
DB_USER="${DB_USER:-admin}"
DB_PASSWORD="${DB_PASSWORD:-db#h33t@6147}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v mysql >/dev/null 2>&1; then
  echo "MySQL client not found."
  echo "Install on Ubuntu: sudo apt update && sudo apt install -y mysql-server"
  exit 1
fi

echo "Creating database and user (requires sudo mysql access)..."

sudo mysql <<EOF
CREATE DATABASE IF NOT EXISTS ${DB_NAME}
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
EOF

echo "Applying schema..."
mysql -u "${DB_USER}" -p"${DB_PASSWORD}" < "${SCRIPT_DIR}/schema.sql"

echo "Done. Database '${DB_NAME}' is ready."
