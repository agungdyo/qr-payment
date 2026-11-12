-- Billing modes per workspace:
--   duration_enabled  → fixed-price duration packages (workspace_tiers)
--   hourly_enabled    → fallback per-hour pricing for durations without a package
--   periodic_enabled  → monthly/annual pass, paid once per calendar period
--                       (no auto-charge; MAJA only supports one invoice per period)
ALTER TABLE workspaces
    ADD COLUMN duration_enabled BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN hourly_enabled   BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN periodic_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN monthly_price    BIGINT  NOT NULL DEFAULT 0,
    ADD COLUMN annual_price     BIGINT  NOT NULL DEFAULT 0;

-- Which price mode a booking/payment was made with. `hours` stays the anchor
-- for duration bookings and is 0 for monthly/annual periods.
ALTER TABLE bookings
    ADD COLUMN billing_mode TEXT NOT NULL DEFAULT 'duration'
    CHECK (billing_mode IN ('duration', 'monthly', 'annual'));

ALTER TABLE payments
    ADD COLUMN billing_mode TEXT NOT NULL DEFAULT 'duration'
    CHECK (billing_mode IN ('duration', 'monthly', 'annual'));
