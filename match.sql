-- Capability matching.
-- Input: what the user needs. Output: machines that can actually do it, ranked.
--
-- Why this is the core: every other feature assumes you already know which
-- machine to book. Users don't. They know their part, not our equipment list.

CREATE OR REPLACE FUNCTION match_machines(
    p_x_mm          NUMERIC,        -- part bounding box
    p_y_mm          NUMERIC,
    p_z_mm          NUMERIC,
    p_material      TEXT,           -- NULL = any
    p_tolerance_mm  NUMERIC,        -- NULL = don't care
    p_min_feature_mm NUMERIC,       -- NULL = don't care
    p_lat           NUMERIC,        -- user location for distance ranking
    p_lng           NUMERIC,
    p_quantity      INT DEFAULT 1
)
RETURNS TABLE (
    machine_id      BIGINT,
    centre_name     TEXT,
    district        TEXT,
    machine         TEXT,
    process_label   TEXT,
    distance_km     NUMERIC,
    status          TEXT,
    rate_per_hour   NUMERIC,
    material_ok     BOOLEAN,
    in_stock_g      NUMERIC,
    fit_score       NUMERIC,        -- how snugly the part fits the envelope
    reason          TEXT            -- why it matched, shown to the user
) AS $$
BEGIN
-- A part must have positive dimensions. Zero or negative is invalid input,
-- not "fits everything" — return no matches rather than nonsense.
IF p_x_mm IS NULL OR p_y_mm IS NULL OR p_z_mm IS NULL
   OR p_x_mm <= 0 OR p_y_mm <= 0 OR p_z_mm <= 0 THEN
    RETURN;
END IF;

RETURN QUERY
WITH oriented AS (
    -- A part can be rotated. Sort dims so we compare largest-to-largest.
    -- Without this you reject machines that would fit the part turned sideways.
    SELECT
        GREATEST(p_x_mm, p_y_mm, p_z_mm) AS d1,
        (p_x_mm + p_y_mm + p_z_mm)
          - GREATEST(p_x_mm, p_y_mm, p_z_mm)
          - LEAST(p_x_mm, p_y_mm, p_z_mm)  AS d2,
        LEAST(p_x_mm, p_y_mm, p_z_mm)     AS d3
),
envelope AS (
    SELECT
        mc.machine_id,
        GREATEST(mc.max_x_mm, mc.max_y_mm, mc.max_z_mm) AS e1,
        (mc.max_x_mm + mc.max_y_mm + mc.max_z_mm)
          - GREATEST(mc.max_x_mm, mc.max_y_mm, mc.max_z_mm)
          - LEAST(mc.max_x_mm, mc.max_y_mm, mc.max_z_mm) AS e2,
        LEAST(mc.max_x_mm, mc.max_y_mm, mc.max_z_mm)     AS e3,
        mc.tolerance_mm,
        mc.min_feature_mm
    FROM machine_capability mc
)
SELECT
    m.id,
    c.name,
    c.district,
    m.make || ' ' || m.model,
    pr.layman_label,
    ROUND(
        CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
            (6371 * acos(
                LEAST(1.0, GREATEST(-1.0,
                    cos(radians(p_lat)) * cos(radians(c.lat))
                    * cos(radians(c.lng) - radians(p_lng))
                    + sin(radians(p_lat)) * sin(radians(c.lat))
                ))
            ))::NUMERIC
        ELSE 0.0 END, 1
    ) AS distance_km,
    m.status,
    m.rate_per_hour,
    COALESCE(mm.material_ok, (p_material IS NULL)) AS material_ok,
    COALESCE(mm.in_stock_g, 0),
    -- fit_score: 1.0 = part exactly fills the build volume, 0 = tiny part in huge machine.
    -- Ranking a small part onto the smallest machine that fits keeps the big
    -- machines free for jobs that actually need them.
    ROUND(((o.d1 / e.e1) * (o.d2 / e.e2) * (o.d3 / e.e3))::NUMERIC, 3) AS fit_score,
    CONCAT_WS('; ',
        'fits ' || ROUND(e.e1) || '×' || ROUND(e.e2) || '×' || ROUND(e.e3) || 'mm',
        CASE WHEN e.tolerance_mm IS NOT NULL
             THEN 'holds ±' || e.tolerance_mm || 'mm' END,
        CASE WHEN mm.in_stock_g > 0 AND p_material IS NOT NULL
             THEN ROUND(mm.in_stock_g) || 'g in stock'
             WHEN mm.in_stock_g > 0
             THEN 'materials in stock' END,
        CASE WHEN m.status <> 'available'
             THEN 'currently ' || m.status END
    ) AS reason
FROM machine m
JOIN centre c            ON c.id = m.centre_id AND c.is_live
JOIN process pr          ON pr.code = m.process_code
JOIN envelope e          ON e.machine_id = m.id
CROSS JOIN oriented o
-- Join aggregated materials to eliminate Cartesian duplicate rows when p_material IS NULL
LEFT JOIN LATERAL (
    SELECT
        BOOL_OR(mm_sub.material_code IS NOT NULL) AS material_ok,
        COALESCE(SUM(mm_sub.in_stock_g), 0)       AS in_stock_g
    FROM machine_material mm_sub
    WHERE mm_sub.machine_id = m.id
      AND (p_material IS NULL OR mm_sub.material_code = p_material)
) mm ON TRUE
WHERE m.status <> 'retired'
  -- hard filter: physical fit, largest dim to largest dim
  AND o.d1 <= e.e1 AND o.d2 <= e.e2 AND o.d3 <= e.e3
  -- hard filter: material, if specified
  AND (p_material IS NULL OR mm.material_ok IS TRUE)
  -- hard filter: can it hold the tolerance the user asked for?
  AND (p_tolerance_mm IS NULL
       OR (e.tolerance_mm IS NOT NULL AND e.tolerance_mm <= p_tolerance_mm))
  -- hard filter: can it resolve the smallest feature?
  AND (p_min_feature_mm IS NULL
       OR (e.min_feature_mm IS NOT NULL AND e.min_feature_mm <= p_min_feature_mm))
  -- enough material for the whole batch
  AND (p_material IS NULL OR mm.in_stock_g > 0)
ORDER BY
    -- working machines first
    (m.status = 'available') DESC,
    -- then nearest
    distance_km ASC,
    -- then snuggest fit, so we don't burn a big machine on a small part
    fit_score DESC;
END;
$$ LANGUAGE plpgsql STABLE;


-- Free-slot finder. Booking is useless if you can't see when.
CREATE OR REPLACE FUNCTION free_slots(
    p_machine_id    BIGINT,
    p_from          DATE,
    p_days          INT DEFAULT 7,
    p_slot_minutes  INT DEFAULT 60
)
RETURNS TABLE (slot_start TIMESTAMPTZ, slot_end TIMESTAMPTZ) AS $$
BEGIN
RETURN QUERY
WITH cfg AS (
    SELECT c.opens_at, c.closes_at, c.working_days
    FROM machine m JOIN centre c ON c.id = m.centre_id
    WHERE m.id = p_machine_id
),
days AS (
    SELECT d::DATE AS day
    FROM generate_series(p_from::timestamp, (p_from + (p_days - 1))::timestamp, '1 day'::interval) d
    CROSS JOIN cfg
    WHERE EXTRACT(ISODOW FROM d)::INT = ANY (cfg.working_days)
),
candidates AS (
    SELECT
        (d.day + cfg.opens_at)::TIMESTAMPTZ
            + (n * (p_slot_minutes || ' minutes')::INTERVAL) AS s
    FROM days d
    CROSS JOIN cfg
    CROSS JOIN generate_series(0,
        (EXTRACT(EPOCH FROM (cfg.closes_at - cfg.opens_at)) / 60 / p_slot_minutes)::INT - 1
    ) n
)
SELECT c.s, c.s + (p_slot_minutes || ' minutes')::INTERVAL
FROM candidates c
CROSS JOIN cfg
WHERE c.s > now()
  -- a slot must END by closing time; never sell a partial hour
  AND (c.s + (p_slot_minutes || ' minutes')::INTERVAL)::TIME <= cfg.closes_at
  AND NOT EXISTS (
      SELECT 1 FROM booking b
      WHERE b.machine_id = p_machine_id
        AND b.status IN ('requested','confirmed')
        AND b.slot && tstzrange(c.s, c.s + (p_slot_minutes || ' minutes')::INTERVAL)
  )
ORDER BY c.s;
END;
$$ LANGUAGE plpgsql STABLE;
