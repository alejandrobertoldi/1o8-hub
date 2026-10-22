#!/usr/bin/env bash
# Per-boot: start the local PostgreSQL cluster and wait until it is ready.
# Idempotent — safe to run when the cluster is already up.
set -euo pipefail

PGVER="$(ls /etc/postgresql 2>/dev/null | sort -n | tail -1 || true)"
if [ -n "${PGVER}" ]; then
  # start returns non-zero if it's already running; that's fine.
  sudo pg_ctlcluster "${PGVER}" main start || true
fi

# Wait for readiness (max ~30s).
for _ in $(seq 1 30); do
  if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    echo "PostgreSQL is ready."
    exit 0
  fi
  sleep 1
done

echo "WARNING: PostgreSQL did not report ready within 30s." >&2
exit 0
