# APIC ProtoHub — Engineering Implementation Plan

**Scope:** Phased Migration, Backend Service Layer, Frontend Integration, and Verification Roadmap  
**Document Status:** Pre-Implementation Specification (Audit Completed, No Code/Schema Changed Yet)  
**Target Database:** Dedicated Local PostgreSQL 18 Instance (`port 5433`, `.postgres_data/`)

---

## 1. Phased Roadmap Overview

The implementation is structured into five sequential phases to ensure stability, safety, and continuous testability:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        IMPLEMENTATION PHASES                           │
│                                                                        │
│   Phase 1: Database Migration & Schema Hardening                       │
│   Phase 2: Service Layer & Core REST APIs                              │
│   Phase 3: Frontend Integration & Role-Scoped Consoles                 │
│   Phase 4: Demo Adapters & Reset Automation                            │
│   Phase 5: Rigorous Test Suite & Verification Walkthrough              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Phase 1: Database Migration & Schema Hardening

### Objective:
Initialize the isolated local PostgreSQL instance on port 5433, apply the five SQL scripts in canonical order, apply explicit migrations to fix all audited defects, and verify database integrity.

### Tasks:
1. **Cluster Initialization & Startup Script (`db/init_db.ps1`):**
   - Initialize PostgreSQL data cluster in `.postgres_data/` using `initdb.exe` with trust authentication and UTF-8 encoding.
   - Start the PostgreSQL engine on port `5433` via `pg_ctl.exe`.
   - Create database `protohub` and enable extension `btree_gist`.
2. **Apply Base Schema & Functions:**
   - Execute in strict dependency order:
     `schema.sql` $\rightarrow$ `match.sql` $\rightarrow$ `manager.sql` $\rightarrow$ `seed.sql` $\rightarrow$ `seed_jobs.sql`.
3. **Apply Explicit Migrations (`db/migrations/001_fix_audit_findings.sql`):**
   - **REL-01 Fix:** Add composite unique constraint `booking(id, machine_id, user_id)` and compound foreign key on `job(booking_id, machine_id, user_id)`.
   - **INT-01 Fix:** Add `CONSTRAINT stock_non_negative CHECK (in_stock_g >= 0)` on `machine_material`.
   - **CON-01 Fix:** Update `advance_job()` to acquire `SELECT ... FOR UPDATE` lock on `machine_material`.
   - **STM-01 Fix:** Update `issue_quote()` to enforce prior status `('quote_pending', 'quote_sent')` and record authentic prior job status in `job_event`.
   - **SEC-01 Fix:** Add actor authorization validation inside `advance_job()` and `issue_quote()` against `app_user.role` and `app_user.centre_id`.
   - **MAT-01 & MAT-02 Fix:** Update `match_machines()` to incorporate batch quantity material calculation and return separate `is_capable` and `is_bookable` booleans.
   - **LIF-01 Fix:** Add booking lifecycle reconciliation upon job cancellation or completion.
   - **SED-01 & SED-02 Fix:** Correct Seed Job 2 to set `booking_id = NULL` and verify all seed records.
4. **Verification Gate:**
   - Execute regression test scripts to prove constraints reject invalid inserts.

---

## 3. Phase 2: Service Layer & Core REST APIs

### Objective:
Implement a modular Node.js/Express application layer that connects to the database via connection pooling (`pg`), performs server-side validation, enforces role- and centre-scoped authorization, and exposes REST endpoints.

### Tasks:
1. **Database Client Pool (`db/client.js`):**
   - Configure `pg.Pool` targeting `postgresql://postgres@localhost:5433/protohub`.
   - Implement `query(text, params)` helper with parameterized statements to prevent SQL injection.
   - Implement `withTransaction(callback)` for atomic multi-statement operations.
2. **Authentication & Session Middleware (`src/middleware/auth.js`):**
   - Maintain session identity via signed HTTP-only cookies or bearer tokens.
   - Resolve `req.user` with verified `id`, `name`, `role`, `centre_id`, `affiliation`.
   - Implement authorization guards: `requireRole(roles)`, `requireCentre(centreId)`, `requireJobOwnership(jobId)`.
3. **Service Modules:**
   - `src/services/matching.js`: Wraps `match_machines()` and `free_slots()`.
   - `src/services/jobs.js`: Wraps job creation, quote issuance, quote acceptance, and `advance_job()`.
   - `src/services/bookings.js`: Transactionally creates bookings with GiST exclusion conflict handling.
   - `src/services/inventory.js`: Manages `stock_movement` records and queries `v_material_alerts`.
   - `src/services/storage.js`: Secure file storage adapter using Multer to write to `uploads/` with UUID keys.
4. **REST API Endpoints:**
   - Auth: `GET /api/auth/session`, `POST /api/auth/login`, `POST /api/auth/switch-persona`
   - Matching: `POST /api/match`, `GET /api/machines/:id/slots`
   - Jobs & Quotes: `GET /api/jobs`, `POST /api/jobs`, `GET /api/jobs/:id`, `POST /api/jobs/:id/quote`, `POST /api/jobs/:id/quote/action`, `POST /api/jobs/:id/transition`
   - Bookings: `POST /api/jobs/:id/book`, `POST /api/jobs/:id/reschedule`, `POST /api/jobs/:id/cancel`
   - Inventory: `GET /api/inventory`, `POST /api/inventory/movement`
   - Reporting: `GET /api/manager/queue`, `GET /api/manager/today`, `GET /api/admin/metrics`

---

## 4. Phase 3: Frontend Integration & Role-Scoped Consoles

### Objective:
Upgrade the static frontend files (`app.html`, `manager.html`) from browser `localStorage` to dynamic REST API consumers, and add dedicated Staff and Admin views.

### Tasks:
1. **Global Demo Navigation Bar:**
   - Display persistent demo environment badge ("Demo Environment — Backed by PostgreSQL 18").
   - Include 1-click **Persona Switcher** allowing instant role switching between:
     - Ravi Teja (`innovator`, Student)
     - Sneha Reddy (`innovator`, Startup)
     - K. Prasad (`centre_manager`, Visakhapatnam)
     - M. Lakshmi (`centre_staff`, Vijayawada)
     - APIS Admin (`apis_admin`)
2. **Innovator Hub (`app.html`):**
   - Replace hardcoded `MACHINES` array with live `fetch('/api/match')`.
   - Display explainable match cards with snugness fit, distance, rates, and capability vs. bookability badges.
   - Implement technical file upload (STL, STEP, DXF) attaching to new jobs.
   - Implement itemized quote inspector with 1-click "Accept Quote" and "Decline Quote".
   - Implement interactive slot picker pulling real-time availability from `/api/machines/:id/slots`.
   - Implement personal job timeline tracking reading live `job_event` logs.
3. **Manager Console (`manager.html`):**
   - Replace hardcoded `JOBS` array with live `fetch('/api/manager/queue')`.
   - Bind top stat strip to `fetch('/api/manager/today')`.
   - Wire "Price this job" modal to `POST /api/jobs/:id/quote`.
   - Implement machine operational status toggling (`available`, `maintenance`, `broken`).
   - Implement stock ledger panel reading `/api/inventory` with low-stock alerts and restock modal.
4. **Staff & Admin Views:**
   - Staff floor worklist scoped to assigned centre for job transitions and actual material entry.
   - Admin portal displaying statewide machine utilization (`v_machine_utilization`) and centre activation toggle.

---

## 5. Phase 4: Demo Adapters & Deterministic Reset

### Objective:
Provide simulated identity, OTP, and payment adapters, alongside a safe, one-click database reset workflow.

### Tasks:
1. **Interactive Phone OTP Simulation:**
   - Entering a phone number triggers `POST /api/auth/otp/send`.
   - The server generates a deterministic OTP (e.g., `123456`) and returns it in the response payload for display in an on-screen demo toast.
2. **Deterministic Reset Endpoint (`POST /api/system/reset`):**
   - Re-executes the schema and reconciled seed scripts within an atomic transaction.
   - Restores the initial baseline data (5 centres, 12 machines, 5 reconciled jobs).
   - Guarded by `NODE_ENV === 'demo'` check to prevent execution against production databases.

---

## 6. Phase 5: Verification & Testing Gates

### Automated Test Suite:
1. **Double-Booking Concurrency Test (`tests/concurrency_booking.js`):**
   - Fires 10 concurrent requests to book the exact same machine slot.
   - Verifies exactly 1 succeeds and 9 fail with HTTP 409 Conflict.
2. **Inventory Protection Test (`tests/concurrency_stock.js`):**
   - Sets stock to 100g.
   - Fires 2 simultaneous job consumption requests for 80g each.
   - Verifies 1 succeeds and 1 fails; stock remains at 20g (never negative).
3. **State Machine Invariant Test (`tests/state_machine.js`):**
   - Attempts illegal transitions (e.g. `quote_pending` $\rightarrow$ `running`).
   - Verifies server rejects transitions with HTTP 400 and database rollback.
4. **Access Control & Scoping Test (`tests/security_scoping.js`):**
   - Verifies Innovator cannot query foreign jobs.
   - Verifies Manager of Centre 1 cannot update jobs or stock of Centre 2.

---

## 7. Status Check & Commitments

> [!IMPORTANT]
> **Honest Reporting Commitment:** In accordance with prompt instructions, no claim is made that any fix, migration, or test has been completed until the script has been physically executed and the output verified. All items in this plan represent the validated roadmap to be executed upon stakeholder authorization.
