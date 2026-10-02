# APIC ProtoHub — Demo Environment & Mock Adapter Specification

**Version:** 1.0.0-DEMO  
**Purpose:** Architecture and behavioral guidelines for offline, fully interactive demo execution without third-party external dependencies.

---

## 1. Demo Mode Philosophy & Honest Labeling

The APIC ProtoHub prototype is engineered to deliver a **convincing, fully interactive evaluation experience backed by a real local PostgreSQL database**. To achieve full end-to-end journey demonstration without requiring paid SMS gateways, email SMTP relays, or bank merchant accounts, the system utilizes clearly labeled **Demo Adapters**.

### Strict Labeling Invariants:
1. **Persistent Visual Indicator:** A high-contrast global top banner is displayed across all screens:
   ```
   [ ⚡ DEMO ENVIRONMENT — Backed by Real Local PostgreSQL 18 Database ]
   ```
2. **No False Telemetry:** The platform never claims an external SMS or email was transmitted when a local mock adapter simulated it. On-screen feedback explicitly clarifies: `"Simulated in local demo mode — no external network SMS sent"`.
3. **No Hidden Hardcoded Client State:** All demo data resides in the PostgreSQL database. Frontends read and write through backend REST APIs backed by live SQL transactions.

---

## 2. Seeded Demo Personas

The application features a 1-click **Persona Switcher** in the navigation header, allowing reviewers to effortlessly experience all four user roles:

| Persona Name | Role | Affiliation & Facility | Demo Verification Journey |
|---|---|---|---|
| **Ravi Teja** (`user_id = 1`) | `innovator` | Student, JNTU Kakinada | Tests 50% student discount on machine time, submits PLA jobs, accepts quotes, books free slots. |
| **Sneha Reddy** (`user_id = 2`) | `innovator` | Startup, HydroFilter Labs | Tests full commercial pricing, resin & CNC milling requirements, multi-part quote inspection. |
| **K. Prasad** (`user_id = 3`) | `centre_manager`| Visakhapatnam APIC (Centre 1)| Reviews prioritized work queue (`v_manager_queue`), prices pending jobs (`issue_quote`), manages stock ledger. |
| **M. Lakshmi** (`user_id = 4`) | `centre_staff` | Vijayawada APIC (Centre 2) | Executes shop-floor transitions (`setup` $\rightarrow$ `running` $\rightarrow$ `qc` $\rightarrow$ `ready`), records actual grams used. |
| **APIS Admin** (`user_id = 5`) | `apis_admin` | Network Headquarters | Inspects statewide equipment utilization (`v_machine_utilization`), toggles centre live status (Anantapur). |

---

## 3. Simulated Demo Adapters

### 3.1. Phone OTP & Authentication Adapter
- **Endpoint:** `POST /api/auth/otp/send`
- **Behavior:**
  - In production: Dispatches an SMS via Twilio or CDAC SMS Gateway with an OTP token.
  - In Demo Mode: The server generates a deterministic 6-digit OTP code (`123456` or random 6 digits) and returns it in the JSON response payload.
  - The UI captures this payload and displays an interactive modal with a "Quick Fill OTP" button, explaining that the SMS delivery was simulated locally.

### 3.2. Technical File Storage Adapter
- **Location:** Local private directory `uploads/`.
- **Behavior:**
  - Files uploaded via multipart forms are stored with UUID storage keys (`uploads/<uuid>.<ext>`).
  - Metadata is inserted into `job_file`.
  - Downloads are gated by session ownership checks via `GET /api/files/:key`.
  - Swappable in production with AWS S3 / MinIO via `StorageAdapter` interface.

### 3.3. Payment Gateway Adapter
- **Behavior:**
  - Prototyping jobs require advance payment upon quote acceptance.
  - In Demo Mode, the quote acceptance screen presents a mock payment checkout displaying the exact calculated INR amount, generating a simulated transaction reference (`TXN-DEMO-XXXXX`), and immediately advancing the job to `'quote_accepted'`.

---

## 4. Deterministic Database Reset Procedure

### 4.1. Reset Endpoint (`POST /api/system/reset`)
- **Safety Precondition:** The reset command is strictly disabled if `NODE_ENV === 'production'`.
- **Execution Mechanism:**
  1. Opens an exclusive database transaction on PostgreSQL.
  2. Drops and recreates the base tables from `schema.sql`.
  3. Reloads `match.sql` and `manager.sql`.
  4. Loads reconciled `seed.sql` and `seed_jobs.sql`.
  5. Purges test files from `uploads/`.
  6. Returns HTTP 200 with confirmation.

### 4.2. CLI Reset Command
Developers can reset the database directly from PowerShell:
```powershell
.\db\reset_db.ps1
```
This guarantees that automated test runs and manual jury demonstrations can restart from a pristine baseline within 3 seconds.
