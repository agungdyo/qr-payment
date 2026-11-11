-- QR payment initial schema (walk-in coworking payments via MAJA billing gateway)

-- Workspaces (meja/ruangan) — `code` is the QR payload key and the immutable id.
CREATE TABLE workspaces (
    code        TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'desk' CHECK (type IN ('desk', 'room')),
    location    TEXT,
    capacity    INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    hourly_rate BIGINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fixed-price duration packages per workspace (tarif per durasi: 1/3/8/24 jam).
CREATE TABLE workspace_tiers (
    workspace_code TEXT NOT NULL REFERENCES workspaces(code) ON DELETE CASCADE,
    duration_hours INTEGER NOT NULL,
    label          TEXT,
    price          BIGINT NOT NULL,
    PRIMARY KEY (workspace_code, duration_hours)
);

CREATE TABLE lockers (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code       TEXT NOT NULL UNIQUE,
    location   TEXT,
    status     TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied')),
    note       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Single-row venue settings.
CREATE TABLE settings (
    id                    INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    venue_name            TEXT NOT NULL DEFAULT 'Coworking Space',
    wifi_ssid             TEXT NOT NULL DEFAULT '',
    wifi_password         TEXT NOT NULL DEFAULT '',
    show_wifi_to_customer BOOLEAN NOT NULL DEFAULT true,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO settings (id) VALUES (1);

-- Booking = slot reservation. `code` doubles as the MAJA invoice number.
CREATE TABLE bookings (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code           TEXT NOT NULL UNIQUE,
    workspace_code TEXT NOT NULL REFERENCES workspaces(code),
    start_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    end_at         TIMESTAMPTZ NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    hold_until     TIMESTAMPTZ,
    total          BIGINT NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bookings_workspace ON bookings (workspace_code);
CREATE INDEX idx_bookings_status ON bookings (status);

-- Payment = one MAJA invoice/VA attempt for a booking.
CREATE TABLE payments (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_code     TEXT NOT NULL REFERENCES bookings(code),
    status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'paid', 'cancelled', 'failed')),
    maja_invoice_id  TEXT,
    invoice_number   TEXT,
    va               TEXT,
    payment_method   TEXT,
    hours            INTEGER NOT NULL DEFAULT 0,
    subtotal         BIGINT NOT NULL DEFAULT 0,
    tax_amount       BIGINT NOT NULL DEFAULT 0,
    admin_fee        BIGINT NOT NULL DEFAULT 0,
    amount           BIGINT NOT NULL DEFAULT 0,
    paid_amount      BIGINT,
    remaining_amount BIGINT,
    bank_code        TEXT,
    channel          TEXT,
    ref              TEXT,
    inactive_date    TIMESTAMPTZ,
    paid_at          TIMESTAMPTZ,
    raw_callback     JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_booking ON payments (booking_code);
CREATE INDEX idx_payments_status ON payments (status);
CREATE INDEX idx_payments_invoice ON payments (invoice_number);

-- Idempotency guard for MAJA notifications: at most one paid payment per invoice.
CREATE UNIQUE INDEX uq_payments_paid_invoice ON payments (invoice_number) WHERE status = 'paid';

-- Append-only audit log for payment/booking state changes.
CREATE TABLE payment_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id   UUID REFERENCES payments(id) ON DELETE CASCADE,
    booking_code TEXT NOT NULL REFERENCES bookings(code),
    status       TEXT NOT NULL,
    actor        TEXT,
    note         TEXT,
    raw_payload  JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_payment ON payment_events (payment_id);