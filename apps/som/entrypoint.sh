#!/bin/sh
# S-O-M's boot on Railway: check settings, migrate its own database, make
# sure the admin exists, then serve. Any failure stops the boot, so the
# healthcheck fails and the previous deploy keeps serving.
set -e

# Bind address: "::" takes IPv4 and IPv6 (Railway's private network is IPv6)
# but crashes on a host without IPv6, so fall back there. Railway sets PORT.
if [ -s /proc/net/if_inet6 ]; then export HOSTNAME=::; else export HOSTNAME=0.0.0.0; fi
echo "[entrypoint] S-O-M listening on ${HOSTNAME} port ${PORT:-3000}"

node scripts/check-env.mjs
node db/migrate.mjs
node scripts/bootstrap.mjs
exec node server.js
