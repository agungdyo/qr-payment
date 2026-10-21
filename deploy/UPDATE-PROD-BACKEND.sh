#!/bin/bash
set -e

# PUBLIC_ORIGIN dibaca dari berkas env server supaya compose tidak gagal interpolasi.
set -a; . /opt/qr-payment/.env; set +a

cd /opt/qr-payment/src

echo "== build image api =="
docker build -f deploy/Dockerfile.api -t qrpay-v-backend:latest .

# --force-recreate, bukan restart: container harus dibuat ulang dari image baru.
# `restart` saja akan menjalankan image lama yang masih tersimpan.
echo "== recreate api =="
docker compose -f deploy/docker-compose.yml up -d --force-recreate api

echo "== images =="
docker images | grep qrpay || true
