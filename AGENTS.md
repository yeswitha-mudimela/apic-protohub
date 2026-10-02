# AGENTS.md — Persistent Developer & AI Coding Agent Instructions

**Workspace:** `APIC ProtoHub`  
**Purpose:** Canonical rules, constraints, architectural boundaries, and operational guidelines that all AI coding assistants and developers must adhere to before reading or writing any code in this repository.

---

## 1. Golden Rules of Development

1. **Inspect Before Editing:** Never assume an object structure, column name, or function signature. Always inspect existing code and documentation (`schema.sql`, `match.sql`, `manager.sql`, `docs/*`) before proposing or executing changes.
2. **Preserve Established Architecture:** Do not perform unsolicited rewrites or replace existing modular SQL models with generic ORMs. Keep the application a modular monolith. Avoid microservices, message queues, Docker, or Kubernetes unless explicitly requested.
3. **Database Is the Source of Truth:** Business rules, state machine transitions, pricing math, and concurrency invariants live in PostgreSQL (enforced via functions, triggers, and constraints). The application layer acts as a secure, authenticated bridge to this database core.
4. **Never Trust Client-Supplied Identities:** Actor IDs (`actor_id`, `user_id`, `centre_id`) must NEVER be accepted from raw client request bodies. Derive user identity and role strictly from server-verified sessions.
5. **No Negative Stock & Zero Double-Booking:** Never bypass the GiST exclusion constraint on bookings or the non-negative check on inventory. Always acquire pessimistic row locks (`FOR UPDATE`) when consuming consumables.
6. **Honest Reporting:** Never claim a test has passed, a migration has been applied, or a defect has been fixed unless the command was physically run and verified in the terminal.

---

## 2. Source-of-Truth Files

The core system is defined across five foundational SQL files and their associated documentation:

| File | Canonical Role | Key Objects & Responsibilities |
|---|---|---|
| `schema.sql` | Database Backbone | Tables (`centre`, `app_user`, `process`, `material`, `machine`, `machine_capability`, `machine_material`, `booking`, `job`, `job_file`, `quote`, `job_event`), Views (`v_machine_utilization`, `v_material_alerts`), GiST exclusion constraint. |
| `match.sql` | Search Brain | Functions `match_machines()` (rotation-aware envelope matching, fit score, distance, material verification) and `free_slots()` (candidate slot projection and collision avoidance). |
| `manager.sql` | Operations Brain | Functions `advance_job()` (finite state machine, material consumption), `issue_quote()` (pricing math, versioning), table `stock_movement`, trigger `trg_stock_movement`, views `v_manager_queue`, `v_centre_today`. |
| `seed.sql` | Master Catalog Seed | Base data: 5 centres, 12 machines, 6 processes, 9 materials, 5 demo users, initial machine stocks, and sample bookings. |
| `seed_jobs.sql` | Operational Sample Jobs | Realistic work orders across lifecycle states (Jobs 1–5), itemized quote records, and immutable event logs. |

---

## 3. Mandatory Context Reading for New Sessions

Before proposing or making modifications, every agent session must read:
1. `AGENTS.md` (This file — core instructions).
2. `docs/PROJECT_UNDERSTANDING.md` (Domain understanding and file relationship graph).
3. `docs/SQL_AUDIT.md` (Exhaustive correctness audit, verified defects, and required fixes).
4. `docs/ARCHITECTURE.md` (Modular boundaries, data flows, and trust perimeters).
5. `docs/ROLE_PERMISSION_MATRIX.md` (Route-level access control and centre scoping).
6. `docs/STATE_MACHINES.md` (State transition invariants for jobs, quotes, and bookings).

---

## 4. Database Setup & Migration Rules

1. **Local PostgreSQL Cluster:** The dedicated local database runs on port `5433` with data directory `.postgres_data/`. Connection string:
   ```
   postgresql://postgres@localhost:5433/protohub
   ```
2. **Deterministic Script Execution Order:**
   ```powershell
   # Cluster startup
   .\db\init_db.ps1
   # Base schema & functions
   schema.sql -> match.sql -> manager.sql -> seed.sql -> seed_jobs.sql
   # Migrations (if any)
   db\migrations\*.sql
   ```
3. **No Direct DDL Mutation in Base Files:** Base files (`schema.sql`, `match.sql`, `manager.sql`) represent the initial state. Subsequent structural improvements must be packaged as numbered migrations in `db/migrations/` (e.g. `001_fix_audit_findings.sql`).

---

## 5. Security & Authorization Rules

- **Innovator Isolation:** Innovators (`app_user.role = 'innovator'`) must ONLY view, update, book, or cancel work orders where `job.user_id = session.user_id`.
- **Centre Isolation:** Centre Staff and Managers (`role IN ('centre_staff', 'centre_manager')`) must ONLY access or modify equipment, jobs, stock, and bookings where `machine.centre_id = session.centre_id`.
- **Admin Supremacy:** Network Administrators (`role = 'apis_admin'`) possess statewide read/write permissions.
- **Private CAD Storage:** Files stored in `uploads/` must NEVER be served statically. File streaming routes must verify ownership or centre assignment before serving bytes.

---

## 6. Verification & Test Execution Protocol

Whenever code or migrations are modified:
1. Run the database concurrency tests:
   - Double-booking exclusion: `node tests/concurrency_booking.js`
   - Stock non-negative protection: `node tests/concurrency_stock.js`
2. Run state machine invariant tests: `node tests/state_machine.js`
3. Run security scoping tests: `node tests/security_scoping.js`
4. Confirm test outcomes and log actual stdout/stderr. Do not report success on failing runs.
