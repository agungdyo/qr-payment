#!/bin/bash
set -e

cd /opt/qr-payment/src

echo "== pull =="
git fetch
git reset --hard origin/master
git log --oneline -1

echo "== status container =="
docker compose -f deploy/docker-compose.yml ps
