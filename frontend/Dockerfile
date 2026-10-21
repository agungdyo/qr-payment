# Image frontend qr-payment (Vite + React, disajikan nginx).
#
# Konteks build = folder ini:
#   docker build --build-arg VITE_API_BASE_URL=https://<domain> -t qrpay-v-frontend:latest .

FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Frontend memilih transport dari nilai ini (src/lib/api/client.ts):
#   tidak diset  → mode demo, memakai data palsu di browser
#   diisi        → memanggil backend sungguhan
# Karena itu nilai kosong harus menggagalkan build, bukan diam-diam menghasilkan
# image yang menampilkan data demo di production.
ARG VITE_API_BASE_URL
RUN if [ -z "$VITE_API_BASE_URL" ]; then \
      echo "ERROR: VITE_API_BASE_URL kosong — bundle akan berjalan di mode demo. Isi PUBLIC_ORIGIN." >&2; \
      exit 1; \
    fi

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build


FROM nginx:1.27-alpine

# Templating resmi image nginx: ${API_UPSTREAM} diisi dari environment container.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
