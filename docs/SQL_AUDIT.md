# APIC ProtoHub — Deep SQL Correctness & Security Audit

**Audited Files:**
- `schema.sql` (Core entities, constraints, views)
- `match.sql` (Matching algorithm, free-slot projector)
- `manager.sql` (State machine, quote calculation, stock ledger)
- `seed.sql` (Base catalog, centres, machines, users, initial bookings)
- `seed_jobs.sql` (Sample work orders, quotes, event histories)

---

## 1. Executive Summary

This deep correctness audit systematically evaluates all five SQL files against data integrity, concurrency safety, access control, state machine correctness, and reporting reliability.

**Key Findings Overview:**
- **Confirmed Critical Vulnerabilities:** Actor ID spoofing (no server-side or database auth validation), potential negative inventory balances due to missing check constraints, and race conditions during concurrent stock deductions.
- **Confirmed High-Severity Defects:** Foreign key integrity omission allowing cross-machine and cross-user booking links, unvalidated status transitions in `issue_quote()`, and complete omission of batch quantity checking in `match_machines()`.
- **Confirmed Seed Discrepancies:** Cross-machine booking reference in Job 2 and premature booking assignment prior to quote acceptance.
- **Structural Strengths:** The PostgreSQL GiST exclusion constraint on `booking(machine_id, slot)` is mathematically sound and reliably prevents double-booking.

---

## 2. Comprehensive Item-by-Item Audit

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SQL AUDIT SEVERITY SUMMARY                      │
│                                                                        │
│   [CRITICAL]  SEC-01: Actor ID parameter forgery in manager functions  │
│   [CRITICAL]  INT-01: Missing CHECK constraint on negative stock       │
│   [CRITICAL]  CON-01: Concurrency race condition on stock deduction   │
│   [HIGH]      REL-01: Missing composite FK on job(booking_id)          │
│   [HIGH]      STM-01: issue_quote() violates state machine invariants  │
│   [HIGH]      MAT-01: match_machines() ignores batch quantity (p_qty)  │
│   [MEDIUM]    MAT-02: match_machines() returns broken/maint machines   │
│   [MEDIUM]    LIF-01: Desynchronized job and booking lifecycles        │
│   [MEDIUM]    SED-01: Seed Job 2 references wrong machine booking      │
│   [MEDIUM]    SED-02: Premature booking assignment in Seed Job 2       │
│   [LOW]       REP-01: v_machine_utilization ignores ongoing week slots │
│   [LOW]       TZN-01: Timezone boundary assumptions in free_slots()    │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Category A: Foreign Key, Uniqueness & Relational Consistency

#### Issue REL-01: Missing Composite Integrity Constraint on Job Booking
- **Severity:** HIGH
- **Classification:** Confirmed Defect
- **Evidence:** `schema.sql:145`
  ```sql
  booking_id BIGINT UNIQUE REFERENCES booking(id),
  machine_id BIGINT NOT NULL REFERENCES machine(id),
  ```
- **Impact:** `job` references `booking(id)` and `machine(id)` independently. A job assigned to Machine A can legally reference a booking on Machine B, or a booking owned by User X can be linked to a job owned by User Y. This creates contradictory schedules.
- **Recommended Fix:**
  Add a unique composite key on `booking` and reference it from `job`:
  ```sql
  ALTER TABLE booking ADD CONSTRAINT uq_booking_id_machine_user UNIQUE (id, machine_id, user_id);
  ALTER TABLE job ADD CONSTRAINT fk_job_booking_machine_user 
      FOREIGN KEY (booking_id, machine_id, user_id) 
      REFERENCES booking(id, machine_id, user_id) ON DELETE SET NULL;
  ```
- **Regression Test:**
  Attempt to insert a job with `machine_id = 2` referencing a booking created for `machine_id = 1`. The transaction must fail with foreign key violation.

---

### Category B: Transactional Behavior, Inventory & Concurrency

#### Issue INT-01: Missing Check Constraint for Non-Negative Inventory
- **Severity:** CRITICAL
- **Classification:** Confirmed Defect
- **Evidence:** `schema.sql:107` and `manager.sql:30-43`
  ```sql
  -- schema.sql
  in_stock_g NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- manager.sql
  CREATE OR REPLACE FUNCTION apply_stock_movement() RETURNS TRIGGER AS $$
  BEGIN
      UPDATE machine_material
         SET in_stock_g = in_stock_g + NEW.delta_g
       WHERE machine_id = NEW.machine_id
         AND material_code = NEW.material_code;
      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  ```
- **Impact:** While `advance_job` includes an application-level `IF v_have < p_grams` check, any direct `stock_movement` insert (waste, adjustment, manual consumption) or concurrent race condition can drive `in_stock_g` into negative values.
- **Recommended Fix:**
  Add a check constraint to `machine_material`:
  ```sql
  ALTER TABLE machine_material ADD CONSTRAINT chk_stock_non_negative CHECK (in_stock_g >= 0);
  ```
- **Regression Test:**
  Insert a `stock_movement` row with `delta_g = -50000` on a machine holding 1,000g. The transaction must abort with `chk_stock_non_negative` violation.

#### Issue CON-01: Unlocked Read-Modify-Write in `advance_job` Stock Consumption
- **Severity:** CRITICAL
- **Classification:** Confirmed Defect
- **Evidence:** `manager.sql:100-108`
  ```sql
  SELECT in_stock_g INTO v_have
  FROM machine_material
  WHERE machine_id = v_machine AND material_code = v_material;

  IF v_have IS NULL OR v_have < p_grams THEN
      RAISE EXCEPTION 'insufficient stock: need %g of %, only %g on hand', p_grams, v_material, COALESCE(v_have,0);
  END IF;
  ```
- **Impact:** The select statement does NOT lock the row (`FOR UPDATE`). If two staff members simultaneously start two jobs requiring 80g each on a machine holding 100g, both read `v_have = 100`, both pass validation, and both insert deductions. Total deducted = 160g, leaving -60g.
- **Recommended Fix:**
  Acquire an exclusive row lock on `machine_material`:
  ```sql
  SELECT in_stock_g INTO v_have
  FROM machine_material
  WHERE machine_id = v_machine AND material_code = v_material
  FOR UPDATE;
  ```
- **Regression Test:**
  Execute two simultaneous asynchronous transactions that attempt to consume 80g from a 100g balance. One must succeed and the second must be rejected with insufficient stock.

---

### Category C: State Machine & Event History Integrity

#### Issue STM-01: `issue_quote()` Bypasses State Machine Invariants
- **Severity:** HIGH
- **Classification:** Confirmed Defect
- **Evidence:** `manager.sql:140-188`
  ```sql
  SELECT m.rate_per_hour, m.setup_fee, m.min_charge, m.student_discount_pct,
         j.material_code, au.affiliation, j.status
  INTO v_machine
  FROM job j ... WHERE j.id = p_job_id FOR UPDATE OF j;

  -- ... (No check on v_machine.status!)

  UPDATE job SET status = 'quote_sent' WHERE id = p_job_id;
  INSERT INTO job_event (job_id, from_status, to_status, note, actor_id)
  VALUES (p_job_id, v_machine.status, 'quote_sent', ...);
  ```
- **Impact:**
  1. Any job in any state (e.g., `completed`, `ready`, `running`, `cancelled`) can be re-quoted, arbitrarily resetting its status back to `quote_sent`.
  2. The query selects `j.status` into `v_machine` without alias distinction, confusing job status with machine status and logging misleading transitions.
- **Recommended Fix:**
  Explicitly validate prior job status before updating:
  ```sql
  IF v_machine.status NOT IN ('quote_pending', 'quote_sent') THEN
      RAISE EXCEPTION 'Illegal quote: job % is in status %, expected quote_pending or quote_sent', p_job_id, v_machine.status;
  END IF;
  ```
- **Regression Test:**
  Call `issue_quote` on Job 1 (which is in status `'ready'`). Must raise an exception and leave Job 1 unchanged.

---

### Category D: Security, Authorization & Function Definer Context

#### Issue SEC-01: Actor ID Parameter Forgery and Missing Centre Scoping
- **Severity:** CRITICAL
- **Classification:** Confirmed Defect
- **Evidence:** `manager.sql:51, 125`
  ```sql
  CREATE OR REPLACE FUNCTION advance_job(
      p_job_id BIGINT, p_to TEXT, p_actor BIGINT, ...
  ) ...
  CREATE OR REPLACE FUNCTION issue_quote(
      p_job_id BIGINT, p_actor BIGINT, ...
  ) ...
  ```
- **Impact:** Neither function verifies:
  1. Whether `p_actor` exists in `app_user`.
  2. Whether `p_actor` possesses a manager/staff role.
  3. Whether `p_actor.centre_id` matches the centre owning the machine.
  If the application forwards browser-supplied actor IDs, any customer could advance arbitrary jobs or issue quotes on behalf of centre managers.
- **Recommended Fix:**
  1. **Application Layer:** Session authentication must derive `p_actor` strictly from the verified session token.
  2. **Database Function Defense:** Enforce authorization check inside `advance_job` and `issue_quote`:
  ```sql
  IF NOT EXISTS (
      SELECT 1 FROM app_user u
      JOIN machine m ON m.id = v_machine
      WHERE u.id = p_actor
        AND (u.role = 'apis_admin' OR (u.role IN ('centre_manager', 'centre_staff') AND u.centre_id = m.centre_id))
  ) THEN
      RAISE EXCEPTION 'User % is not authorized to manage jobs at centre for machine %', p_actor, v_machine;
  END IF;
  ```
- **Regression Test:**
  Call `issue_quote(3, 1, 60, 50)` where User 1 is an `innovator`. Must reject with unauthorized exception.

---

### Category E: Capability Matching & Operational Availability

#### Issue MAT-01: `match_machines()` Completely Ignores Requested Batch Quantity
- **Severity:** HIGH
- **Classification:** Confirmed Defect
- **Evidence:** `match.sql:16, 125`
  ```sql
  CREATE OR REPLACE FUNCTION match_machines(
      ...
      p_quantity INT DEFAULT 1
  ) ...
  WHERE ...
    -- enough material for the whole batch
    AND (p_material IS NULL OR mm.in_stock_g > 0)
  ```
- **Impact:** `p_quantity` is passed as a parameter but never used in calculations or filters. A customer requesting a batch of 50 units will be matched to a machine holding only 5 grams of filament.
- **Recommended Fix:**
  Estimate required material per batch based on part volume, material density, and quantity:
  ```sql
  -- Calculate estimated batch weight in grams
  -- Volume (cm3) = (p_x_mm * p_y_mm * p_z_mm) / 1000.0 * 0.35 (infill factor)
  -- Batch grams = Volume * COALESCE(mat.density_g_cm3, 1.2) * p_quantity
  AND (p_material IS NULL OR mm.in_stock_g >= (
      ((p_x_mm * p_y_mm * p_z_mm / 1000.0) * 0.35 * COALESCE(mat.density_g_cm3, 1.2)) * p_quantity
  ))
  ```
- **Regression Test:**
  Search for part dimensions $100 \times 100 \times 50\text{ mm}$ in PLA with `p_quantity = 100` (requires $>10\text{ kg}$). Machine 6 (Prusa MK4 with 250g) must be excluded or flagged as insufficient stock.

#### Issue MAT-02: `match_machines()` Conflates Physical Capability with Operational Bookability
- **Severity:** MEDIUM
- **Classification:** Design Gap
- **Evidence:** `match.sql:113, 128`
  ```sql
  WHERE m.status <> 'retired'
  ...
  ORDER BY (m.status = 'available') DESC, ...
  ```
- **Impact:** Machines that are `maintenance` or `broken` are returned in the match results. While showing capable equipment is useful, returning them without clear operational separation causes innovators to book or request quotes on down equipment.
- **Recommended Fix:**
  Return explicit flags `is_capable BOOLEAN` and `is_bookable BOOLEAN`:
  ```sql
  (m.status = 'available' AND c.is_live AND mm.in_stock_g > 0) AS is_bookable,
  m.status AS machine_status,
  ```
- **Regression Test:**
  Search for laser cutting in Vizag. Machine 4 (`Trotec Speedy 400`, status `'maintenance'`) must return `is_capable = TRUE` but `is_bookable = FALSE` with reason `"currently maintenance"`.

---

### Category F: Booking & Job Lifecycle Reconciliation

#### Issue LIF-01: Job Cancellation Leaves Active Booking Reservations
- **Severity:** MEDIUM
- **Classification:** Confirmed Defect
- **Evidence:** `manager.sql:85` and `schema.sql:133`
  ```sql
  WHEN p_to = 'cancelled' AND v_from IN (...) THEN TRUE
  ```
  `advance_job()` updates `job.status = 'cancelled'`, but never touches `booking.status`.
- **Impact:** Because `booking.status` remains `'requested'` or `'confirmed'`, the GiST exclusion constraint permanently blocks that time slot from all other users.
- **Recommended Fix:**
  Add lifecycle reconciliation logic when advancing to `'cancelled'`:
  ```sql
  IF p_to = 'cancelled' THEN
      UPDATE booking 
         SET status = 'cancelled' 
       WHERE id = (SELECT booking_id FROM job WHERE id = p_job_id);
  END IF;
  ```
- **Regression Test:**
  Create a booking, link it to a job, and cancel the job. Query `free_slots()` for that machine and verify that the previously blocked slot is once again available.

---

### Category G: Seed Data Inconsistencies

#### Issue SED-01: Machine Discrepancy in Seed Booking ID 2 vs. Job 2
- **Severity:** MEDIUM
- **Classification:** Confirmed Defect
- **Evidence:**
  `seed.sql:98-99`:
  ```sql
  (1, 2, tstzrange(now()::date + INTERVAL '1 day' + INTERVAL '14 hours',
                   now()::date + INTERVAL '1 day' + INTERVAL '15 hours'), 'confirmed');
  ```
  `seed_jobs.sql:11-14`:
  ```sql
  INSERT INTO job (booking_id, user_id, machine_id, material_code, title, ...)
  VALUES (2, 2, 2, 'resin_std', 'Micro-fluidic test chip', ...);
  ```
- **Impact:** Booking ID 2 was reserved on Machine 1 (`Ultimaker S5`), but Job 2 is configured for Machine 2 (`Formlabs Form 3L`).
- **Recommended Fix:**
  In `seed_jobs.sql`, change Job 2 `booking_id` to `NULL` (since Job 2 is only in `'quote_sent'` state and has not yet been accepted or scheduled).
- **Regression Test:**
  After seeding, verify with:
  ```sql
  SELECT j.id FROM job j JOIN booking b ON b.id = j.booking_id WHERE j.machine_id <> b.machine_id;
  ```
  Must return 0 rows.

#### Issue SED-02: Premature Booking in Seed Job 2
- **Severity:** LOW
- **Classification:** Design Discrepancy
- **Evidence:** `seed_jobs.sql:14`
  Job 2 is in `quote_sent` state with an existing booking. Under target business rules, booking occurs after quote acceptance.
- **Recommended Fix:** Set `booking_id = NULL` for Job 2 until quote is accepted.

---

### Category H: Analytical Views & Metrics

#### Issue REP-01: `v_machine_utilization` Week Truncation and Ongoing Slot Calculation
- **Severity:** LOW
- **Classification:** Design Gap
- **Evidence:** `schema.sql:221-229`
  ```sql
  date_trunc('week', lower(b.slot)) AS week,
  COALESCE(SUM(EXTRACT(EPOCH FROM (upper(b.slot) - lower(b.slot))) / 3600.0), 0) AS booked_hours
  ```
- **Impact:** If a machine has zero bookings in a week, it does not appear in the aggregation for that week, creating holes in dashboard time-series charts.
- **Recommended Fix:** Use `generate_series` against active reporting periods or perform outer joins on date ranges.

---

## 3. Summary of Audit Findings Matrix

| Finding ID | Object | Type | Severity | Status |
|---|---|---|---|---|
| **REL-01** | `job.booking_id` | Missing Composite Foreign Key | HIGH | Confirmed Defect |
| **INT-01** | `machine_material.in_stock_g` | Missing Non-Negative Check | CRITICAL | Confirmed Defect |
| **CON-01** | `advance_job()` | Missing Row Lock (`FOR UPDATE`) | CRITICAL | Confirmed Defect |
| **STM-01** | `issue_quote()` | Missing Prior State Validation | HIGH | Confirmed Defect |
| **SEC-01** | `advance_job()`, `issue_quote()` | Unchecked Actor Parameter | CRITICAL | Confirmed Defect |
| **MAT-01** | `match_machines()` | Unused `p_quantity` Parameter | HIGH | Confirmed Defect |
| **MAT-02** | `match_machines()` | Conflates Capability & Bookability | MEDIUM | Design Gap |
| **LIF-01** | `advance_job()` | Disconnected Booking Cancellation | MEDIUM | Confirmed Defect |
| **SED-01** | `seed_jobs.sql` | Job 2 Mismatched Machine Booking | MEDIUM | Confirmed Defect |
| **SED-02** | `seed_jobs.sql` | Premature Booking in Quote Sent | LOW | Design Discrepancy |
| **REP-01** | `v_machine_utilization` | Incomplete Utilization Series | LOW | Design Gap |
