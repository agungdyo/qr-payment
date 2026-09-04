-- Seed: demo workspaces, tiers and lockers (dev convenience)

INSERT INTO workspaces (code, name, type, location, capacity, description, is_active, hourly_rate) VALUES
    ('meja-01', 'Meja 01', 'desk', 'Lantai 1', 1, 'Meja dekat jendela', true, 15000),
    ('meja-12', 'Meja 12', 'desk', 'Lantai 1', 1, 'Meja dekat pintu', true, 15000),
    ('ruang-01', 'Ruang Rapat 01', 'room', 'Lantai 2', 6, 'Ruang rapat kapasitas 6 orang', true, 50000)
ON CONFLICT (code) DO NOTHING;

INSERT INTO workspace_tiers (workspace_code, duration_hours, label, price) VALUES
    ('meja-01', 1, '1 jam', 20000),
    ('meja-01', 3, '3 jam', 55000),
    ('meja-01', 8, '8 jam', 120000),
    ('meja-01', 24, 'Harian', 200000),
    ('meja-12', 1, '1 jam', 20000),
    ('meja-12', 3, '3 jam', 55000),
    ('meja-12', 8, '8 jam', 120000),
    ('meja-12', 24, 'Harian', 200000),
    ('ruang-01', 1, '1 jam', 75000),
    ('ruang-01', 3, '3 jam', 200000),
    ('ruang-01', 8, '8 jam', 480000),
    ('ruang-01', 24, 'Harian', 1200000)
ON CONFLICT (workspace_code, duration_hours) DO NOTHING;

INSERT INTO lockers (code, location, status, note) VALUES
    ('L-01', 'Depan', 'available', NULL),
    ('L-02', 'Depan', 'available', NULL),
    ('L-03', 'Belakang', 'occupied', 'Sewa bulanan')
ON CONFLICT (code) DO NOTHING;