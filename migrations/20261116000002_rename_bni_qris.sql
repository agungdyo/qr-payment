-- MAJA channel code for BNI QRIS is `bni-qris`, not `qris-bni`.
UPDATE payment_methods SET code = 'bni-qris', updated_at = now() WHERE code = 'qris-bni';
