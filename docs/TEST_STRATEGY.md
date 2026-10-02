# APIC ProtoHub — Comprehensive Test Strategy & Quality Assurance Plan

**Version:** 1.0.0-TEST  
**Target Quality Level:** TRL 4 (Validated Prototype under Concurrency Stress)  
**Test Harness:** Node.js Native Test Runner / Integration Scripts

---

## 1. Test Pyramid & Quality Dimensions

```
                   ▲
                  / \
                 /E2E\     5 End-to-End User Journeys
                /-----\    (Innovator, Manager, Staff, Admin, Reset)
               / Secur \   IDOR, Role Spoofing, Centre Isolation
              /---------\
             / Integrat. \ Concurrency, State Machine Invariants,
            /             \ GiST Exclusion, Stock Row Locks
           /---------------\
          /   Unit Tests    \ Pricing Formula, Snugness Fit,
         /                   \ Axis-Aligned Rotation Math
        /─────────────────────\
```

---

## 2. Test Layer Specifications

### 2.1. Layer 1: Unit & Algorithmic Tests (`tests/unit/`)
Tests pure mathematical and formatting functions without external database dependencies:
- **Axis-Aligned Rotation:** Verify that bounding box sorting correctly matches parts turned on their side ($[100, 250, 50]$ fits $[260, 110, 60]$).
- **Snugness Fit Score Calculation:** Verify $(d_1/e_1) \times (d_2/e_2) \times (d_3/e_3)$ matches expected ratio.
- **Pricing Formula:** Verify machine rate $\times$ minutes, material grams $\times$ density cost, student discount deduction, and minimum charge floor.

### 2.2. Layer 2: Database Integration & Concurrency Tests (`tests/integration/`)
Directly verifies PostgreSQL constraints and transactional functions under high concurrency:

#### Test INT-01: Double-Booking Exclusion Stress Test (`tests/concurrency_booking.js`)
- **Objective:** Prove that two simultaneous requests cannot reserve overlapping slots on the same machine.
- **Mechanism:**
  1. Spawn 10 concurrent asynchronous HTTP requests attempting to insert a booking for Machine 1 tomorrow from 10:00 to 12:00 IST.
  2. Await all 10 responses.
- **Expected Result:** Exactly 1 request returns HTTP 200/201 (Database commit). Exactly 9 requests return HTTP 409 Conflict with error code `23P01` (exclusion violation).
- **Success Criteria:** Database contains exactly 1 booking row for that slot.

#### Test INT-02: Negative Inventory Prevention Stress Test (`tests/concurrency_stock.js`)
- **Objective:** Prove that inventory balances cannot become negative through concurrent consumption.
- **Mechanism:**
  1. Set PLA stock on Machine 1 to exactly 100g.
  2. Spawn 2 simultaneous requests to `advance_job(..., 'running')` demanding 80g each.
- **Expected Result:**
  - First transaction acquires row lock (`FOR UPDATE`), confirms $100 \ge 80$, subtracts 80g, and commits (balance = 20g).
  - Second transaction waits for lock release, reads balance = 20g, detects $20 < 80$, and aborts with `insufficient stock` exception.
- **Success Criteria:** Final stock balance is exactly 20g. It must NEVER reach -60g.

#### Test INT-03: State Machine Invariant Test (`tests/state_machine.js`)
- **Objective:** Prove that illegal state jumps are structurally blocked.
- **Test Cases:**
  - Jump from `quote_pending` directly to `running` $\rightarrow$ REJECTED (HTTP 400).
  - Jump from `ready` to `quote_sent` $\rightarrow$ REJECTED (HTTP 400).
  - Valid progression: `quote_accepted` $\rightarrow$ `queued` $\rightarrow$ `setup` $\rightarrow$ `running` $\rightarrow$ `qc` $\rightarrow$ `ready` $\rightarrow$ `collected` $\rightarrow$ SUCCESS.
  - Rework loop: `qc` $\rightarrow$ `running` $\rightarrow$ `qc` $\rightarrow$ `ready` $\rightarrow$ SUCCESS.

### 2.3. Layer 3: Security & Authorization Tests (`tests/security/`)
- **SEC-01: Foreign Job Access (IDOR):** Innovator 1 attempts `GET /api/jobs/2` (owned by Innovator 2). Expected: HTTP 403 Forbidden.
- **SEC-02: Foreign CAD Download:** Innovator 1 attempts `GET /api/files/:key` of a drawing uploaded by Innovator 2. Expected: HTTP 403 Forbidden.
- **SEC-03: Cross-Centre Management:** Manager of Centre 1 (Visakhapatnam) attempts `POST /api/jobs/:id/quote` on a job at Centre 2 (Vijayawada). Expected: HTTP 403 Forbidden.
- **SEC-04: Client-Supplied Actor Spoofing:** Customer sends `{ "actor_id": 3, "to_status": "ready" }`. Expected: Server rejects body override and executes in context of authenticated session.

---

## 3. End-to-End User Journey Scripts

### Journey 1: Innovator Journey (Ravi Teja — Student)
1. Sign in as Ravi Teja (Student, JNTU Kakinada).
2. Enter part dimensions: $120 \times 60 \times 25\text{ mm}$, Material: `PLA`, Tolerance: $0.2\text{ mm}$, Quantity: 4.
3. Review match results: Ultimaker S5 at Vizag matches with fit score and 0 km distance.
4. Submit job request titled "Drone Arm Bracket v2" and upload STL model.
5. Wait for manager quote $\rightarrow$ Review itemized quote (confirm 50% student discount applied to machine time).
6. Click "Accept Quote" $\rightarrow$ Pick slot tomorrow at 10:00 IST $\rightarrow$ Booking confirmed.
7. Track live status timeline from `queued` to `ready for collection`.

### Journey 2: Centre Manager Operations (K. Prasad)
1. Sign in as K. Prasad (Vizag APIC).
2. Open Manager Console $\rightarrow$ Inspect prioritized queue (`v_manager_queue`).
3. Click "Price this job" on new submission $\rightarrow$ Enter 90 minutes, 85 grams $\rightarrow$ Submit.
4. Inspect Equipment panel $\rightarrow$ Toggle Machine 4 (`Trotec Speedy 400`) to `'maintenance'` with note "Lens alignment".
5. Open Stock Ledger $\rightarrow$ Record restock of 2,000g PLA $\rightarrow$ Verify ledger reflects movement.

### Journey 3: Centre Staff Execution (M. Lakshmi)
1. Sign in as M. Lakshmi (Vijayawada APIC).
2. Inspect active centre queue $\rightarrow$ Pick Job #4.
3. Advance: `setup` $\rightarrow$ `running` (verify material balance decrements automatically).
4. Advance: `running` $\rightarrow$ `qc`.
5. Trigger QC failure $\rightarrow$ Rework back to `running` with note "Surface roughness excess".
6. Complete rework $\rightarrow$ `qc` $\rightarrow$ `ready`. Hand over part $\rightarrow$ `collected`.

### Journey 4: APIS Administrator Network Overview
1. Sign in as APIS Admin.
2. View statewide centre map $\rightarrow$ Inspect Anantapur (`is_live = false`).
3. Toggle Anantapur to `is_live = true`.
4. Run machine search for Anantapur region $\rightarrow$ Confirm Bambu Lab X1 Carbon now appears in search results.
5. Review statewide equipment utilization view (`v_machine_utilization`).

### Journey 5: Deterministic Demo Reset
1. Trigger `POST /api/system/reset`.
2. Confirm all tables return to initial seed state within 3 seconds.
3. Re-verify that all 5 seed jobs and bookings load with zero integrity errors.
