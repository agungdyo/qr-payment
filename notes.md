
======================================
npm install
docker-compose up -d

if there any blocking port, change it with docker-compose down -vm the  docker-compose up -d again

npm install
cargo run

===============
Rebuild Frontend__
cd frontend && npm run build

Restart Backend__
cargo run
=============================================
setting keycloak
- menggunakan account.maja.id , untuk DEV di MAKARA
- di keycloak, di realm maja, menggunakan CLIENT-ID qr-payment, sesuai di .env
- membuat TAB roles 'admin' di clients qr-payment
- assign TAB role mapping, 'admin' untuk client 'qr-payment'


