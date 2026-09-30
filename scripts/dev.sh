#!/usr/bin/env bash
set -euo pipefail

# Resolve the repository root from this script's location
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Ensure a local .env exists before the API starts
if [ ! -f "$ROOT_DIR/.env" ]; then
  # Seed the local environment from the committed example
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  printf 'Created .env from .env.example\n'
fi

# Start PostgreSQL in a container when Docker is available
if command -v docker >/dev/null 2>&1; then
  # Bring up only the database service; no application containers are defined
  docker compose up -d postgres
else
  # No Docker: the developer must provide PostgreSQL 15 another way
  printf 'Docker not found. Start PostgreSQL 15 manually and point DATABASE_URL at it.\n'
fi

# Run the API dev server in the background
npm run api:dev &
API_PID=$!

# Run the web dev server in the background
npm run web:dev &
WEB_PID=$!

# Run the admin dev server in the background
npm run admin:dev &
ADMIN_PID=$!

# Stop every background server when this script exits or is interrupted
cleanup() {
  # Kill the tracked PIDs; ignore processes that already exited
  kill "$API_PID" "$WEB_PID" "$ADMIN_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Keep the script alive while the dev servers run
wait
