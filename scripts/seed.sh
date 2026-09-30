#!/usr/bin/env bash
set -euo pipefail

# Resolve the repository root from this script's location
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Apply committed migrations to the database (safe for existing databases)
npm run db:deploy --workspace @gstflow/api

# Generate the Prisma client from the schema
npm run db:generate --workspace @gstflow/api

# Insert the demo firm, users, client and release records
npm run db:seed --workspace @gstflow/api

printf 'Database migrated and seeded.\n'
