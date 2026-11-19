#!/bin/bash
set -e

# PUBLIC_ORIGIN dipakai sebagai build-arg, jadi harus ada di environment compose.
set -a; . /opt/qr-payment/.env; set +a

cd /opt/qr-payment/src

echo "== build image web =="
docker build \
  --build-arg VITE_API_BASE_URL="$PUBLIC_ORIGIN" \
  -t qrpay-v-frontend:latest \
  frontend

# Rantai proxy harus dibuat ulang bersama agar nginx tidak menyimpan IP upstream lama.
echo "== recreate api + waf + web =="
docker compose -f deploy/docker-compose.yml up -d --force-recreate api waf web

echo "== images =="
docker images | grep qrpay || true
