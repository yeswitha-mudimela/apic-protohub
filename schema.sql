-- APIC ProtoHub — core schema
-- Design note: the hard problem is capability matching, not booking.
-- Everything below hangs off machine_capability.

-- btree_gist is required for EXCLUDE USING gist with integer/bigint keys (machine_id)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================
-- CENTRES & PEOPLE
-- ============================================================

CREATE TABLE centre (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    district        TEXT NOT NULL,           -- AP district, used for "near me"
    address         TEXT NOT NULL,
    lat             NUMERIC(9,6) NOT NULL,
    lng             NUMERIC(9,6) NOT NULL,
    phone           TEXT,
    -- operational reality: centres have opening hours and holidays
    opens_at        TIME NOT NULL DEFAULT '09:00',
    closes_at       TIME NOT NULL DEFAULT '17:30',
    working_days    INT[] NOT NULL DEFAULT '{1,2,3,4,5,6}',  -- ISO dow
    is_live         BOOLEAN NOT NULL DEFAULT FALSE,  -- planned vs operational
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE app_user (
    id              BIGSERIAL PRIMARY KEY,
    phone           TEXT UNIQUE NOT NULL,    -- OTP is the realistic auth here
    name            TEXT NOT NULL,
    email           TEXT,
    role            TEXT NOT NULL CHECK (role IN
                        ('innovator','centre_staff','centre_manager','apis_admin')),
    -- staff/managers belong to a centre; innovators don't
    centre_id       BIGINT REFERENCES centre(id),
    -- helps APIS report on who the network actually serves
    affiliation     TEXT CHECK (affiliation IN
                        ('student','startup','industry','individual','institution')),
    institution     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT staff_needs_centre CHECK (
        role IN ('innovator','apis_admin') OR centre_id IS NOT NULL
    )
);

-- ============================================================
-- MACHINES & CAPABILITY  (the core)
-- ============================================================

-- A process is what a machine DOES. Users think in outcomes, not brand names.
CREATE TABLE process (
    code            TEXT PRIMARY KEY,        -- 'fdm', 'sla', 'cnc_mill', 'laser_cut'
    family          TEXT NOT NULL,           -- 'additive','subtractive','electronics','testing'
    label           TEXT NOT NULL,           -- 'FDM 3D Printing'
    layman_label    TEXT NOT NULL            -- 'Plastic 3D printing'
);

CREATE TABLE material (
    code            TEXT PRIMARY KEY,        -- 'pla','abs','nylon_pa12','al_6061'
    label           TEXT NOT NULL,
    class           TEXT NOT NULL CHECK (class IN
                        ('thermoplastic','resin','metal','composite','wood','other')),
    density_g_cm3   NUMERIC(6,3)             -- needed for weight-based quoting
);

CREATE TABLE machine (
    id              BIGSERIAL PRIMARY KEY,
    centre_id       BIGINT NOT NULL REFERENCES centre(id),
    process_code    TEXT NOT NULL REFERENCES process(code),
    make            TEXT NOT NULL,
    model           TEXT NOT NULL,
    asset_tag       TEXT,                    -- govt asset register number
    status          TEXT NOT NULL DEFAULT 'available' CHECK (status IN
                        ('available','in_use','maintenance','broken','retired')),
    -- pricing inputs live on the machine, not a separate table, until they need to
    rate_per_hour   NUMERIC(10,2) NOT NULL,
    setup_fee       NUMERIC(10,2) NOT NULL DEFAULT 0,
    min_charge      NUMERIC(10,2) NOT NULL DEFAULT 0,
    -- subsidised rates are a real thing in govt facilities
    student_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
    commissioned_on DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (centre_id, asset_tag)
);

-- THE capability record. Answers: "can this machine make my part?"
CREATE TABLE machine_capability (
    machine_id      BIGINT PRIMARY KEY REFERENCES machine(id) ON DELETE CASCADE,
    -- build envelope in mm — the first filter anyone actually needs
    max_x_mm        NUMERIC(8,2) NOT NULL,
    max_y_mm        NUMERIC(8,2) NOT NULL,
    max_z_mm        NUMERIC(8,2) NOT NULL,
    -- what it can hold
    tolerance_mm    NUMERIC(6,3),            -- +/- achievable
    min_feature_mm  NUMERIC(6,3),            -- thinnest wall / smallest hole
    layer_min_mm    NUMERIC(6,3),            -- additive only
    surface_finish  TEXT CHECK (surface_finish IN ('rough','standard','fine','mirror')),
    notes           TEXT
);

-- Many-to-many: one machine runs several materials, each with its own limits
CREATE TABLE machine_material (
    machine_id      BIGINT NOT NULL REFERENCES machine(id) ON DELETE CASCADE,
    material_code   TEXT NOT NULL REFERENCES material(code),
    cost_per_gram   NUMERIC(8,3),            -- NULL = centre supplies free / BYO
    in_stock_g      NUMERIC(10,2) NOT NULL DEFAULT 0,
    reorder_at_g    NUMERIC(10,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (machine_id, material_code)
);

-- ============================================================
-- SCHEDULING
-- ============================================================
-- Design note: machine time != job time. A booking reserves a slot;
-- the job that runs in it has its own lifecycle and may overrun.

CREATE TABLE booking (
    id              BIGSERIAL PRIMARY KEY,
    machine_id      BIGINT NOT NULL REFERENCES machine(id),
    user_id         BIGINT NOT NULL REFERENCES app_user(id),
    slot            TSTZRANGE NOT NULL,
    status          TEXT NOT NULL DEFAULT 'requested' CHECK (status IN
                        ('requested','confirmed','cancelled','no_show','completed')),
    -- staff block out time for maintenance using the same table
    is_block        BOOLEAN NOT NULL DEFAULT FALSE,
    block_reason    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- this is the constraint that makes double-booking structurally impossible
    EXCLUDE USING gist (
        machine_id WITH =,
        slot WITH &&
    ) WHERE (status IN ('requested','confirmed'))
);

CREATE INDEX booking_slot_idx ON booking USING gist (slot);
CREATE INDEX booking_user_idx ON booking (user_id, created_at DESC);

-- ============================================================
-- JOBS & QUOTES
-- ============================================================

CREATE TABLE job (
    id              BIGSERIAL PRIMARY KEY,
    booking_id      BIGINT UNIQUE REFERENCES booking(id),
    user_id         BIGINT NOT NULL REFERENCES app_user(id),
    machine_id      BIGINT NOT NULL REFERENCES machine(id),
    material_code   TEXT REFERENCES material(code),
    title           TEXT NOT NULL,
    description     TEXT,
    -- what the user says they need — drives capability matching
    req_x_mm        NUMERIC(8,2),
    req_y_mm        NUMERIC(8,2),
    req_z_mm        NUMERIC(8,2),
    req_tolerance_mm NUMERIC(6,3),
    quantity        INT NOT NULL DEFAULT 1,
    -- the state machine. staff move it forward; user watches.
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
                        ('draft','quote_pending','quote_sent','quote_accepted',
                         'queued','setup','running','qc','ready','collected',
                         'failed','cancelled')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE job_file (
    id              BIGSERIAL PRIMARY KEY,
    job_id          BIGINT NOT NULL REFERENCES job(id) ON DELETE CASCADE,
    filename        TEXT NOT NULL,
    storage_key     TEXT NOT NULL,
    kind            TEXT NOT NULL CHECK (kind IN ('model','drawing','gerber','photo','other')),
    bytes           BIGINT,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quotes are versioned: staff revise after inspecting the file.
CREATE TABLE quote (
    id              BIGSERIAL PRIMARY KEY,
    job_id          BIGINT NOT NULL REFERENCES job(id) ON DELETE CASCADE,
    version         INT NOT NULL DEFAULT 1,
    -- the line items, kept explicit so the user sees WHY it costs what it costs
    est_minutes     INT NOT NULL,
    machine_cost    NUMERIC(10,2) NOT NULL,
    material_grams  NUMERIC(10,2),
    material_cost   NUMERIC(10,2) NOT NULL DEFAULT 0,
    setup_cost      NUMERIC(10,2) NOT NULL DEFAULT 0,
    discount        NUMERIC(10,2) NOT NULL DEFAULT 0,
    total           NUMERIC(10,2) NOT NULL,
    -- auto = engine guessed, manual = staff overrode. Track this to improve the engine.
    source          TEXT NOT NULL CHECK (source IN ('auto','manual')),
    prepared_by     BIGINT REFERENCES app_user(id),
    valid_until     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (job_id, version)
);

-- Every status change, append-only. This IS the tracking feature,
-- and it's also the utilization dataset APIS wants.
CREATE TABLE job_event (
    id              BIGSERIAL PRIMARY KEY,
    job_id          BIGINT NOT NULL REFERENCES job(id) ON DELETE CASCADE,
    from_status     TEXT,
    to_status       TEXT NOT NULL,
    note            TEXT,
    actor_id        BIGINT REFERENCES app_user(id),
    at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX job_event_job_idx ON job_event (job_id, at);

-- ============================================================
-- VIEWS — what the dashboards read
-- ============================================================

-- Machine utilization: the number APIS is actually buying this platform for.
CREATE VIEW v_machine_utilization AS
SELECT
    m.id                AS machine_id,
    m.centre_id,
    c.name              AS centre_name,
    m.make || ' ' || m.model AS machine,
    date_trunc('week', lower(b.slot)) AS week,
    COALESCE(SUM(EXTRACT(EPOCH FROM (upper(b.slot) - lower(b.slot))) / 3600.0), 0) AS booked_hours,
    COUNT(*) FILTER (WHERE b.status = 'no_show') AS no_shows
FROM machine m
JOIN centre c ON c.id = m.centre_id
LEFT JOIN booking b ON b.machine_id = m.id
    AND b.status IN ('confirmed','completed','no_show')
    AND NOT b.is_block
GROUP BY m.id, m.centre_id, c.name, m.make, m.model, date_trunc('week', lower(b.slot));

-- Low stock, so managers reorder before a job fails.
CREATE VIEW v_material_alerts AS
SELECT
    c.name AS centre_name,
    m.make || ' ' || m.model AS machine,
    mat.label AS material,
    mm.in_stock_g,
    mm.reorder_at_g
FROM machine_material mm
JOIN machine m ON m.id = mm.machine_id
JOIN centre c ON c.id = m.centre_id
JOIN material mat ON mat.code = mm.material_code
WHERE mm.in_stock_g <= mm.reorder_at_g;
