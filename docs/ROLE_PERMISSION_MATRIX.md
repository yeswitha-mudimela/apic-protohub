# APIC ProtoHub — Role and Permission Matrix

**Classification:** Access Control Specification & Authorization Policy  
**Scope:** Server-Side Security, Route Middleware & Database Invariants  
**Source of Truth Role Column:** `app_user.role` (`innovator`, `centre_staff`, `centre_manager`, `apis_admin`)

---

## 1. Role Definitions & Scoping Boundaries

| Role Code | System Role | Assigned Scoping Boundary | Operational Responsibility |
|---|---|---|---|
| `innovator` | Customer / Innovator / Student / Startup | **Personal Scope:** Can only access rows where `user_id = session.user_id`. Cannot access internal centre logs or other users' files. | Submits prototyping requests, views quotes, accepts/declines quotes, reserves slots, tracks personal jobs. |
| `centre_staff` | Workshop Technician / Machine Operator | **Centre Scope:** Scoped to `centre_id = session.centre_id`. Cannot view or modify jobs at other centres. | Executes production (`setup`, `running`, `qc`, `ready`), logs actual material usage, records QC results, marks collected. |
| `centre_manager` | APIC Facility Operations Manager | **Centre Scope:** Scoped to `centre_id = session.centre_id`. Cannot manage equipment or budget at other centres. | Prices jobs, authors quotes, manages centre schedule and no-shows, oversees equipment status, manages consumable ledger. |
| `apis_admin` | State Network Administrator | **Network Scope:** Full cross-centre administrative access across all Andhra Pradesh facilities. | Commissions centres, manages equipment master catalog, manages user roles, monitors statewide utilization metrics. |

---

## 2. Granular Operation Permission Matrix

Legend:
- `ALLOW`: Permitted unconditionally
- `OWN`: Permitted only if the resource is owned by the authenticated user (`user_id = session.user_id`)
- `CENTRE`: Permitted only if the resource belongs to the user's assigned facility (`centre_id = session.centre_id`)
- `DENY`: Explicitly forbidden (HTTP 403 Forbidden)

| Business Operation | Target Entity / Route | `innovator` | `centre_staff` | `centre_manager` | `apis_admin` |
|---|---|---|---|---|---|
| **Discover Machines** | `POST /api/match` | ALLOW | ALLOW | ALLOW | ALLOW |
| **View Machine Details** | `GET /api/machines/:id` | ALLOW (Live only) | CENTRE | CENTRE | ALLOW |
| **Inspect Free Slots** | `GET /api/machines/:id/slots`| ALLOW | CENTRE | CENTRE | ALLOW |
| **Create Job Submission** | `POST /api/jobs` | ALLOW (As self) | DENY | DENY | ALLOW (Assisted)|
| **Upload Technical CAD** | `POST /api/jobs/:id/files` | OWN | DENY | DENY | ALLOW |
| **Download Technical CAD** | `GET /api/files/:key` | OWN | CENTRE | CENTRE | ALLOW |
| **View Job Details** | `GET /api/jobs/:id` | OWN | CENTRE | CENTRE | ALLOW |
| **List Work Queue** | `GET /api/jobs` | OWN (My Jobs) | CENTRE (Active queue)| CENTRE (Full queue)| ALLOW (Statewide)|
| **Issue / Revise Quote** | `POST /api/jobs/:id/quote` | DENY | DENY | CENTRE | ALLOW |
| **Accept / Decline Quote** | `POST /api/jobs/:id/quote/action`| OWN | DENY | DENY | DENY |
| **Book Free Slot** | `POST /api/jobs/:id/book` | OWN | CENTRE (Assisted) | CENTRE | ALLOW |
| **Reschedule Booking** | `POST /api/jobs/:id/reschedule`| OWN | CENTRE | CENTRE | ALLOW |
| **Cancel Booking** | `POST /api/jobs/:id/cancel` | OWN | CENTRE | CENTRE | ALLOW |
| **Record Customer No-Show**| `POST /api/bookings/:id/no-show`| DENY | CENTRE | CENTRE | ALLOW |
| **Advance Job: Queued $\rightarrow$ Setup** | `POST /api/jobs/:id/transition` | DENY | CENTRE | CENTRE | ALLOW |
| **Advance Job: Setup $\rightarrow$ Running** | `POST /api/jobs/:id/transition` | DENY | CENTRE (Consumes stock)| CENTRE | ALLOW |
| **Advance Job: Running $\rightarrow$ QC** | `POST /api/jobs/:id/transition` | DENY | CENTRE | CENTRE | ALLOW |
| **Advance Job: QC $\rightarrow$ Rework** | `POST /api/jobs/:id/transition` | DENY | CENTRE | CENTRE | ALLOW |
| **Advance Job: QC $\rightarrow$ Ready** | `POST /api/jobs/:id/transition` | DENY | CENTRE | CENTRE | ALLOW |
| **Advance Job: Ready $\rightarrow$ Collected**| `POST /api/jobs/:id/transition` | DENY | CENTRE | CENTRE | ALLOW |
| **Cancel Job** | `POST /api/jobs/:id/transition` | OWN (Pre-run only)| DENY | CENTRE | ALLOW |
| **View Consumable Stock** | `GET /api/inventory` | DENY | CENTRE | CENTRE | ALLOW |
| **Record Stock Movement** | `POST /api/inventory/movement`| DENY | CENTRE (Waste only)| CENTRE (Full ledger)| ALLOW |
| **Update Machine Status** | `PATCH /api/machines/:id/status`| DENY | CENTRE (Report issue)| CENTRE (Maint/Up) | ALLOW |
| **Toggle Centre `is_live`** | `PATCH /api/centres/:id/live` | DENY | DENY | DENY | ALLOW |
| **View Manager Queue View** | `GET /api/manager/queue` | DENY | CENTRE | CENTRE | ALLOW |
| **View Centre Today KPIs** | `GET /api/manager/today` | DENY | CENTRE | CENTRE | ALLOW |
| **View Utilization Report**| `GET /api/admin/utilization` | DENY | DENY | CENTRE | ALLOW |
| **Trigger Database Reset** | `POST /api/system/reset` | DENY | DENY | DENY | ALLOW (Demo only)|

---

## 3. Server-Side Security Enforcement Rules

### Rule 1: No Browser-Supplied Actor Trust
The browser must never provide an `actor_id` or `user_id` in request payloads to identify who is performing an action. The server middleware authenticates the session cookie/token and binds the verified `app_user` record to `req.user`.

```typescript
// SECURE PATTERN:
const actorId = req.user.id;
const userRole = req.user.role;
const userCentreId = req.user.centre_id;
```

### Rule 2: Centre Scoping Middleware
Any endpoint operating on centre-assigned resources (jobs, machines, stock movements, quotes) must verify:

```typescript
if (req.user.role !== 'apis_admin') {
  if (!req.user.centre_id || req.user.centre_id !== resource.centre_id) {
    throw new ForbiddenError("Cross-centre access forbidden");
  }
}
```

### Rule 3: Customer Job Ownership Middleware
Any endpoint operating on customer work orders (`job`, `booking`, `job_file`) accessed by an `innovator` must verify:

```typescript
if (req.user.role === 'innovator') {
  if (job.user_id !== req.user.id) {
    throw new ForbiddenError("Access to foreign work orders is prohibited");
  }
}
```

### Rule 4: CAD File Privacy Guard
Direct static file serving of the `uploads/` directory is strictly forbidden. All CAD models and engineering drawings must be streamed through an authorized handler that inspects ownership and centre assignment before sending file bytes.
