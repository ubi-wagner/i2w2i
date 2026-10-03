#!/bin/sh
# Boot sequence on Railway: check settings, migrate, make sure the admin
# exists, then serve. Any failure stops the boot, so Railway's healthcheck
# fails and the previous deploy keeps serving.
set -e

# Pin the bind address here rather than trusting the image env: Docker and
# platforms set HOSTNAME to the container name. "::" accepts IPv4 and IPv6
# (Railway's private network is IPv6), but crashes the server on a host with
# no IPv6, so fall back to 0.0.0.0 there. Railway supplies PORT.
if [ -s /proc/net/if_inet6 ]; then export HOSTNAME=::; else export HOSTNAME=0.0.0.0; fi
echo "[entrypoint] listening on ${HOSTNAME} port ${PORT:-3000}"

node scripts/check-env.mjs
node db/migrate.mjs
node scripts/check-db-role.mjs
node scripts/bootstrap-admin.mjs
exec node server.js
