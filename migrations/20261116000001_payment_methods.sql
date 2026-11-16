-- Migration: payment_methods table and qr_content column on payments
CREATE TABLE IF NOT EXISTS payment_methods (
    code        TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'va', -- 'va' | 'qris'
    is_active   BOOLEAN NOT NULL DEFAULT true,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS qr_content TEXT;

-- Seed daftar metode pembayaran
INSERT INTO payment_methods (code, name, category, is_active, sort_order) VALUES
    ('bni', 'BNI', 'va', true, 1),
    ('mandiri', 'Mandiri', 'va', true, 2),
    ('bri', 'BRI', 'va', true, 3),
    ('bsi', 'BSI', 'va', true, 4),
    ('permata', 'Permata', 'va', true, 5),
    ('bca', 'BCA', 'va', false, 6),
    ('qris-bni', 'QRIS BNI', 'qris', false, 7),
    ('cimb', 'CIMB Niaga', 'va', false, 8),
    ('danamon', 'Bank Danamon', 'va', false, 9),
    ('hana', 'Keb Hana Bank', 'va', false, 10),
    ('bii', 'BII / Maybank', 'va', false, 11),
    ('permatasyariah', 'Bank Permata Syariah', 'va', false, 12)
ON CONFLICT (code) DO NOTHING;
