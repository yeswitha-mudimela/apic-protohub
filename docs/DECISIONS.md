# APIC ProtoHub — Architecture Decision Records & Unresolved Questions

**Document Status:** Approved Canonical Decisions & Open Stakeholder Inquiries  
**Context:** APIC ProtoHub Platform Engineering

---

## 1. Architectural Decision Records (ADRs)

### ADR-01: Retain PostgreSQL GiST Exclusion Constraint for Slot Scheduling
- **Context:** Online scheduling often suffers from race conditions where two simultaneous requests book the same machine slot. Application-level locks (e.g. Redis locks or row-level `SELECT FOR UPDATE`) can fail if nodes crash or transactions misbehave.
- **Decision:** Retain and rely strictly on PostgreSQL's `btree_gist` extension and the GiST exclusion constraint on `booking(machine_id, slot)`:
  ```sql
  EXCLUDE USING gist (machine_id WITH =, slot WITH &&) WHERE (status IN ('requested','confirmed'))
  ```
- **Rationale:** Double-booking becomes mathematically impossible at the database engine level. Even under concurrent web requests across multiple application instances, the database rejects overlapping ranges with error code `23P01`.
- **Consequences:** All booking insertions and updates must handle PostgreSQL constraint violation errors gracefully and return clear HTTP 409 Conflict messages to the frontend.

---

### ADR-02: Dedicated Local PostgreSQL 18 Instance on Port 5433
- **Context:** The development machine hosts an existing PostgreSQL 18 Windows service running on standard port 5432 with unknown credentials and restricted service-control permissions.
- **Decision:** Initialize an isolated PostgreSQL database cluster in `.postgres_data/` listening on port `5433` using the local `initdb.exe` and `pg_ctl.exe` binaries with trust authentication.
- **Rationale:** Guarantees 100% deterministic local database execution, migration repeatability, and instant reset capabilities without requiring Windows administrative privileges or risking corruption of third-party databases.
- **Consequences:** The application connection string defaults to `postgresql://postgres@localhost:5433/protohub`.

---

### ADR-03: Lightweight Modular Monolith over Heavy Framework Bundles
- **Context:** Attempting to install heavy fullstack frameworks with hundreds of megabytes of binary dependencies over constrained local connections risks timeouts and `ECONNRESET` errors.
- **Decision:** Build the backend as a modular Node.js/Express service using verified, lean dependencies (`pg`, `dotenv`, `express`, `multer`), serving high-contrast, responsive HTML/JS interfaces (`app.html`, `manager.html`).
- **Rationale:** Express + `pg` installs in seconds, boots in sub-second time, has zero compilation overhead on Windows, and exposes clean, testable RESTful endpoints that map directly to the SQL functions and views.
- **Consequences:** Frontend views communicate with the backend via standard `fetch()` calls to `/api/*` endpoints rather than React Server Component RPCs.

---

### ADR-04: Mandatory Quote Acceptance Prior to Slot Booking
- **Context:** In the initial seed data (`seed_jobs.sql`), Job 2 had an assigned booking while still in `quote_sent` status. There was ambiguity about whether users can hold a slot while considering a price.
- **Decision:** Enforce that a customer must review and formally accept a quotation (`status = 'quote_accepted'`) before the system permits reserving a machine slot.
- **Rationale:** Machine capacity at APICs is scarce. Allowing uncommitted innovators to lock machine slots while negotiating quotes creates phantom bottlenecks that deprive active jobs of equipment access.
- **Consequences:** Seed Job 2 is corrected to have `booking_id = NULL`. The booking UI is enabled only after quote acceptance.

---

### ADR-05: Volumetric Density Formula for Batch Material Matching
- **Context:** `match.sql` accepted `p_quantity` but never evaluated it. Innovators submit bounding box dimensions ($X, Y, Z$), but 3D parts are rarely solid prisms.
- **Decision:** Implement a standardized volumetric estimation formula in `match_machines`:
  $$\text{Batch Mass (g)} = \left(\frac{X \times Y \times Z}{1000}\right) \times \rho_{\text{material}} \times 0.35 \times \text{Quantity}$$
  where $0.35$ represents the typical average infill/geometry factor for digital prototyping.
- **Rationale:** Ensures that batch orders (e.g. 50 drone brackets) will not be routed to a machine with only a partial spool of filament, while acknowledging that bounding box volume overestimates solid mass.
- **Consequences:** Machines with insufficient localized inventory are flagged as capable but stock-deficient for the requested batch.

---

### ADR-06: Double-Entry Consumable Ledger with Strict Database CHECK Invariants
- **Context:** Trigger `apply_stock_movement()` updated `machine_material.in_stock_g`, but lacked a non-negative constraint. Concurrency could cause negative balances.
- **Decision:**
  1. Add `CONSTRAINT stock_non_negative CHECK (in_stock_g >= 0)` to `machine_material`.
  2. Require `SELECT in_stock_g FROM machine_material ... FOR UPDATE` inside `advance_job` before deducting material.
- **Rationale:** Provides defense-in-depth: the application acquires pessimistic row locks to prevent race conditions, and the database engine acts as a second line of defense by rolling back any transaction attempting to produce negative stock.
- **Consequences:** Out-of-stock conditions fail cleanly with understandable user error messages instead of corrupting inventory counts.

---

### ADR-07: Isolated Local Private Storage Adapter with Authorized CAD Streaming
- **Context:** Innovators upload proprietary 3D CAD models (STL, STEP) and 2D engineering drawings.
- **Decision:** Store files in an unindexed private directory (`uploads/`) with hashed UUID storage keys. Never expose direct static file URLs. Serve file content exclusively through an authenticated route (`GET /api/files/:key`) that validates role and job ownership.
- **Rationale:** Prevents Intellectual Property leaks and Insecure Direct Object References (IDOR).
- **Consequences:** The file storage layer is behind an abstract interface (`StorageAdapter`), making it trivial to switch from local disk to AWS S3/GCS in production.

---

### ADR-08: Explicit Demo Adapters for SMS, Email, and Payments
- **Context:** The prototype requires fully interactive demonstration of login, quote notifications, and payment collection without external third-party subscriptions.
- **Decision:** Provide clearly labelled mock adapters in the UI:
  1. **Demo Persona Switcher:** One-click login as Ravi Teja (Student), Sneha Reddy (Startup), K. Prasad (Manager), M. Lakshmi (Staff), or APIS Admin.
  2. **Simulated OTP Modal:** Displays the generated 6-digit OTP code directly in an on-screen dialog with an explicit "Demo Environment" badge.
  3. **Mock Payment Flow:** Simulates payment receipt during quote acceptance with instant ledger acknowledgement.
- **Rationale:** Reviewers and judges can experience complete end-to-end workflows without being blocked by unconfigured SMS gateways or external payment credentials.
- **Consequences:** No claims are made that real SMS messages or payments were transmitted.

---

## 2. Explicit Unresolved Questions for Stakeholders

| Question ID | Stakeholder Domain | Description & Context | Proposed Default Assumption |
|---|---|---|---|
| **UQ-01** | **Business Policy** | **Cancellation Refund & Penalty Window:** If an innovator cancels a booking less than 24 hours prior to the slot, what penalty applies? | Innovators can cancel freely in pre-run states; cancellations free the slot immediately. Financial penalties deferred to Phase 2. |
| **UQ-02** | **Subsidy Rules** | **Student Subsidy Scope:** Does the `student_discount_pct` apply only to machine time, or should it also subsidize raw material consumables? | Discount applies strictly to machine hourly rate. Materials are billed at cost to prevent facility consumable depletion. |
| **UQ-03** | **CAD Analysis** | **Automated vs. Manual Slicing:** Will the platform eventually integrate server-side geometry analysis (e.g. slicing STL files for exact volume and support mass)? | Phase 1 relies on manager file inspection and manual parameter entry; formula-based volume estimation used for pre-filtering. |
| **UQ-04** | **No-Show Policy** | **Slot Release on No-Show:** When a customer fails to arrive within 15 minutes of slot start, does the manager mark `no_show` and re-release the machine? | Manager records `no_show`; booking status transitions to `'no_show'`. Slot remains blocked for safety unless manager manually schedules maintenance or another job. |
| **UQ-05** | **File Retention** | **CAD File Retention Period:** How long should proprietary CAD files remain on the server after job completion or cancellation? | Retained indefinitely in demo mode; production recommendation is 30 days post-collection followed by secure shredding. |
