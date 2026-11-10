#!/bin/bash
set -e

# Muat env jika tersedia agar docker compose tidak gagal interpolasi PUBLIC_ORIGIN
if [ -f /opt/qr-payment/.env ]; then
  set -a; . /opt/qr-payment/.env; set +a
fi

cd /opt/qr-payment/src

echo "== pull =="
git fetch
git reset --hard origin/master
git log --oneline -1

echo "== status container =="
docker compose -f deploy/docker-compose.yml ps

