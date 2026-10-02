# APIC ProtoHub — Canonical Product Specification

**Version:** 1.0.0-PROD-SPEC  
**Authoring Context:** Solution Architecture & Product Engineering  
**Target Platform:** Multi-Centre Prototyping-as-a-Service Network (Andhra Pradesh)

---

## 1. System Overview & Product Goals

APIC ProtoHub connects innovators, researchers, startups, and students with high-value digital manufacturing equipment across Andhra Pradesh's government-funded prototyping centres (APICs). 

### Primary Value Drivers:
1. **Geometry-First Equipment Discovery:** Innovators specify part dimensions and manufacturing constraints; the platform matches capable equipment without requiring users to possess specialist manufacturing knowledge.
2. **Transparent, Standardized Pricing:** Automated quoting applies published hourly machine rates, raw material costs by density, setup fees, and student subsidies.
3. **Collision-Proof Production Scheduling:** Guaranteed zero double-booking via PostgreSQL GiST exclusion constraints.
4. **Governed Shop-Floor Operations:** Strict finite-state machine controls job transitions from CAD review through quality control to final pickup.
5. **Double-Entry Consumable Accounting:** Real-time inventory tracking prevents production start without confirmed stock.
6. **Statewide Telemetry:** Comprehensive utilization analytics for the AP Innovation Society (APIS).

---

## 2. User Roles & Personas

The system enforces four primary roles grounded in `app_user.role`:

### 2.1. Innovator / Customer (`innovator`)
- **Primary Goal:** Transform digital CAD designs into physical prototypes efficiently and economically.
- **Key Capabilities:**
  - Search machines statewide by bounding box ($X, Y, Z\text{ mm}$), process, material, tolerance, and geographic distance.
  - View explainable capability matches (snugness fit score, achievable tolerances, available stock).
  - Submit formal job requests and securely upload technical files (CAD models, 2D drawings, Gerber files).
  - Review itemized quote versions, accept quotes, or decline with feedback.
  - Select and reserve available time slots from a live calendar.
  - Track job milestones in real-time with granular event histories.
  - Reschedule or cancel bookings in compliance with facility policy.
  - Access personal work order history exclusively.

### 2.2. Centre Staff / Technician (`centre_staff`)
- **Primary Goal:** Execute physical machine operations, maintain quality standards, and log actual material usage.
- **Key Capabilities:**
  - View the live production queue scoped strictly to their assigned centre.
  - Inspect approved CAD models and technical requirements.
  - Execute allowed operational status transitions: `queued` $\rightarrow$ `setup` $\rightarrow$ `running` $\rightarrow$ `qc` $\rightarrow$ `ready` $\rightarrow$ `collected`.
  - Record actual material consumption (grams) during job execution.
  - Log quality control inspection notes and trigger rework cycles if tolerances are breached.
  - Mark parts ready for customer collection and hand over parts upon verification.

### 2.3. Centre Manager (`centre_manager`)
- **Primary Goal:** Ensure high machine utilization, accurate job pricing, stock availability, and smooth daily operations.
- **Key Capabilities:**
  - Monitor the prioritized centre work queue (`v_manager_queue`) and daily KPIs (`v_centre_today`).
  - Review incoming job submissions and author/revise itemized quotes.
  - Manage equipment operational availability (toggle `available`, `maintenance`, `broken`, `in_use`).
  - Oversee slot reservations, reschedule conflicts, and record customer no-shows.
  - Maintain the consumable stock ledger: log restock shipments, inventory adjustments, and scrap write-offs.
  - Monitor low-stock alerts (`v_material_alerts`) to trigger reorders before stockouts halt production.

### 2.4. Network Administrator (`apis_admin`)
- **Primary Goal:** Optimize statewide capex efficiency, onboard new centres, and oversee network health.
- **Key Capabilities:**
  - Statewide view of all centres and cross-network operational metrics.
  - Commission new centres (e.g., flipping `centre.is_live` from `FALSE` to `TRUE`).
  - Manage the master equipment, material, and process catalog.
  - Manage user roles, affiliations, and centre assignments.
  - Review network-wide equipment utilization trends (`v_machine_utilization`).

---

## 3. Core Functional Workflows & Business Rules

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CORE JOB WORKFLOW PIPELINE                      │
│                                                                        │
│   [1. Match & Search] ────► [2. Job Submission & CAD Upload]           │
│                                           │                            │
│                                           ▼                            │
│   [4. Quote Acceptance] ◄─── [3. Review & Quote Issuance]              │
│            │                                                           │
│            ▼                                                           │
│   [5. Slot Booking] ────────► [6. Shop-Floor Production]               │
│                               (Setup -> Running -> QC)                 │
│                                           │                            │
│                                           ▼                            │
│                              [7. Pickup & Collection]                  │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1. Capability Matching & Machine Discovery (`match_machines`)
- **Inputs:** Part dimensions $X, Y, Z$ (in mm), Material Code, Achievable Tolerance ($\pm\text{ mm}$), Minimum Feature Size ($\text{mm}$), User Geolocation (Latitude, Longitude), Batch Quantity ($Q \ge 1$).
- **Business Rules:**
  1. **Strict Input Sanitization:** Dimensions must be positive real numbers ($X, Y, Z > 0$). Negative, zero, or null dimensions return zero matches immediately.
  2. **Axis-Aligned Rotation:** Part dimensions must be sorted descending ($d_1 \ge d_2 \ge d_3$) and compared against sorted machine envelope dimensions ($e_1 \ge e_2 \ge e_3$). If $d_1 \le e_1 \land d_2 \le e_2 \land d_3 \le e_3$, the part physically fits inside the chamber.
  3. **Process & Material Eligibility:** The machine must support the selected material in `machine_material`.
  4. **Batch Material Sufficiency:** The system estimates raw material required:
     $$\text{Estimated Mass (g)} = \left(\frac{X \times Y \times Z}{1000}\right) \times \rho_{\text{material}} \times 0.35 \times Q$$
     The machine must satisfy $\text{in\_stock\_g} \ge \text{Estimated Mass}$.
  5. **Tolerance & Precision:** If specified, machine tolerance must be tighter than or equal to required tolerance ($e_{\text{tol}} \le p_{\text{tol}}$).
  6. **Separation of Capability vs. Bookability:**
     - `is_capable`: Part fits envelope, material supported, tolerance achievable.
     - `is_bookable`: `is_capable` is TRUE, machine status is `'available'`, centre `is_live` is TRUE, and batch stock is on hand.
  7. **Ranking Algorithm:**
     - Primary: Operational status (`status = 'available'` first).
     - Secondary: Geodesic Haversine distance from innovator (nearest first).
     - Tertiary: Snugness Fit Score $\left(\frac{d_1}{e_1} \times \frac{d_2}{e_2} \times \frac{d_3}{e_3}\right)$ descending, preventing oversized machines from consuming small parts.

### 3.2. Quotation & Pricing Engine (`issue_quote`)
- **Pricing Formula:**
  $$\text{Machine Cost} = \text{ROUND}\left(\text{rate\_per\_hour} \times \frac{\text{est\_minutes}}{60.0}, 2\right)$$
  $$\text{Material Cost} = \text{ROUND}(\text{cost\_per\_gram} \times \text{material\_grams}, 2)$$
  $$\text{Student Discount} = \begin{cases} \text{ROUND}\left(\text{Machine Cost} \times \frac{\text{student\_discount\_pct}}{100.0}, 2\right) & \text{if } \text{affiliation} = \text{'student'} \\ 0.00 & \text{otherwise} \end{cases}$$
  $$\text{Subtotal} = \text{Machine Cost} + \text{Material Cost} + \text{setup\_fee} - \text{Student Discount}$$
  $$\text{Final Total} = \max(\text{Subtotal}, \text{min\_charge})$$
- **Business Rules:**
  1. Quotations may only be issued for jobs in status `'quote_pending'` (initial quote) or `'quote_sent'` (re-quote).
  2. Quotes are strictly versioned ($1, 2, \dots$) and immutable once issued.
  3. Quotes carry a default validity window of 7 days (`valid_until = now() + INTERVAL '7 days'`).
  4. Student discounts apply solely to hourly machine run time, never to raw material consumables or setup fees.

### 3.3. Production Scheduling & Slot Booking (`free_slots`, `booking`)
- **Business Rules:**
  1. **Prerequisite:** A customer can only book an appointment for a job in status `'quote_accepted'`.
  2. **Operating Hours:** Slots are constrained by `centre.opens_at`, `centre.closes_at`, and active `centre.working_days`.
  3. **No Partial Overruns:** A slot must terminate on or before `closes_at`.
  4. **Past Slot Rejection:** No slot may start in the past ($s_{\text{start}} > \text{now()}$).
  5. **Exclusion Guard:** A slot request cannot overlap an existing active reservation on that machine (`WHERE status IN ('requested', 'confirmed')`).
  6. **Ownership Constraint:** A booking can only be linked to a job if `booking.user_id = job.user_id` and `booking.machine_id = job.machine_id`.

### 3.4. Finite State Machine & Job Execution (`advance_job`)
- **State Transition Graph:**
  ```
  [draft] ──► [quote_pending] ──► [quote_sent] ──► [quote_accepted] ──► [queued]
                                                        │                  │
                                                        ▼                  ▼
                                                   [cancelled]        [setup]
                                                                          │
                                                                          ▼
                                                                      [running] ◄───┐
                                                                          │         │ (Rework)
                                                                          ▼         │
                                                                        [qc] ───────┘
                                                                          │
                                                                          ▼
                                                                       [ready]
                                                                          │
                                                                          ▼
                                                                     [collected]
  ```
- **Terminal & Exceptional Transitions:**
  - `failed`: Permitted from `queued`, `setup`, `running`, or `qc`.
  - `cancelled`: Permitted from pre-production states (`draft`, `quote_pending`, `quote_sent`, `quote_accepted`, `queued`, `setup`).
  - `rework`: Permitted from `qc` back to `running`.
- **Material Consumption Safeguards:**
  - Material is deducted when advancing to `'running'`.
  - Row lock (`FOR UPDATE`) must be acquired on `machine_material`.
  - Available stock must satisfy requested grams; otherwise transaction aborts.

### 3.5. Inventory Ledger & Stock Accounting (`stock_movement`)
- **Accounting Principles:**
  - Stock is never directly overwritten. Every balance change requires an immutable `stock_movement` row.
  - Permitted movement reasons: `'restock'`, `'job_consume'`, `'adjustment'`, `'waste'`, `'stocktake'`.
  - Balance constraint: `machine_material.in_stock_g >= 0`.
  - Low-stock alerts trigger when `in_stock_g <= reorder_at_g`.

---

## 4. Testable Acceptance Criteria

### AC-01: Capability Matching Precision
- **Given:** A part of dimensions $320 \times 220 \times 280\text{ mm}$ in PLA.
- **When:** `match_machines` is queried.
- **Then:** Machine 1 (`Ultimaker S5`, $330 \times 240 \times 300\text{ mm}$) must match with `is_bookable = TRUE`. Machine 6 (`Prusa MK4`, $250 \times 210 \times 220\text{ mm}$) must be excluded due to envelope breach.

### AC-02: Double-Booking Structural Rejection
- **Given:** An existing confirmed booking on Machine 1 for tomorrow 10:00 to 12:00 IST.
- **When:** A second booking is submitted for Machine 1 tomorrow 11:00 to 13:00 IST.
- **Then:** The database must abort the insert with exclusion constraint violation (`booking_machine_id_slot_excl`).

### AC-03: Student Discount Calculation
- **Given:** Ravi Teja (`affiliation = 'student'`), Machine 1 (rate ₹350/hr, student discount 50%, setup fee ₹100), job requiring 90 minutes and 85g PLA (₹2.50/g).
- **When:** `issue_quote` is executed.
- **Then:** Machine cost = ₹525.00, Material cost = ₹212.50, Student discount = ₹262.50, Setup = ₹100.00. Total must equal exactly ₹575.00.

### AC-04: Concurrent Inventory Protection
- **Given:** Machine 1 with PLA stock at 100g.
- **When:** Two staff members simultaneously trigger `advance_job(..., 'running')` demanding 80g each.
- **Then:** Exactly one transaction succeeds (stock reduced to 20g); the second transaction fails with `insufficient stock`. Inventory must never drop below 0.

### AC-05: Unauthorized Access Isolation
- **Given:** User 1 (Ravi Teja) and User 2 (Sneha Reddy).
- **When:** User 1 attempts to query Job 2 or download files attached to Job 2.
- **Then:** The server returns HTTP 403 Forbidden.
