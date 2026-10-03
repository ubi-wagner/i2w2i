#!/bin/sh
# Migrate, make sure the admin exists, then serve. A failed migration stops
# the boot: serving against a schema the code doesn't match is worse.
set -e
node db/migrate.mjs
node scripts/bootstrap-admin.mjs
exec node server.js
