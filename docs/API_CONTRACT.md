# APIC ProtoHub — API Contract & Endpoint Specification

**Version:** 1.0.0-REST  
**Base URL:** `http://localhost:3000/api`  
**Protocol:** HTTP/1.1 JSON (Multipart for technical file uploads)  
**Standard Error Envelope:**
```json
{
  "success": false,
  "error": {
    "code": "STRING_ERROR_CODE",
    "message": "Human-readable explanation of error",
    "details": {}
  }
}
```

---

## 1. Authentication & Session Endpoints

### 1.1. Get Current Session
- **Route:** `GET /auth/session`
- **Access:** Public / Authenticated
- **Description:** Returns the currently authenticated actor, their active role, and assigned centre.
- **Response 200 OK:**
  ```json
  {
    "success": true,
    "user": {
      "id": 1,
      "name": "Ravi Teja",
      "phone": "+919000000001",
      "email": "ravi@jntuk.edu.in",
      "role": "innovator",
      "centre_id": null,
      "affiliation": "student",
      "institution": "JNTU Kakinada"
    }
  }
  ```

### 1.2. Switch Demo Persona (Demo Adapter)
- **Route:** `POST /auth/switch-persona`
- **Access:** Public (Demo Environment Only)
- **Request Body:**
  ```json
  {
    "userId": 3
  }
  ```
- **Response 200 OK:**
  ```json
  {
    "success": true,
    "user": {
      "id": 3,
      "name": "K. Prasad",
      "role": "centre_manager",
      "centre_id": 1,
      "centre_name": "APIC Visakhapatnam"
    }
  }
  ```

### 1.3. Request Phone OTP (Simulation Adapter)
- **Route:** `POST /auth/otp/send`
- **Access:** Public
- **Request Body:**
  ```json
  {
    "phone": "+919000000001"
  }
  ```
- **Response 200 OK:**
  ```json
  {
    "success": true,
    "message": "OTP sent successfully (Simulated)",
    "demo_otp": "123456"
  }
  ```

---

## 2. Capability Matching & Scheduling Endpoints

### 2.1. Match Machines
- **Route:** `POST /match`
- **Access:** Public / All Roles
- **Description:** Evaluates physical build envelopes with rotation, batch stock sufficiency, and distance.
- **Request Body:**
  ```json
  {
    "x_mm": 120.0,
    "y_mm": 60.0,
    "z_mm": 25.0,
    "material": "pla",
    "tolerance_mm": 0.2,
    "quantity": 4,
    "lat": 17.730000,
    "lng": 83.319000
  }
  ```
- **Response 200 OK:**
  ```json
  {
    "success": true,
    "matches": [
      {
        "machine_id": 1,
        "centre_id": 1,
        "centre_name": "APIC Visakhapatnam",
        "district": "Visakhapatnam",
        "machine": "Ultimaker S5",
        "process_label": "Plastic 3D printing",
        "distance_km": 0.0,
        "status": "available",
        "rate_per_hour": "350.00",
        "material_ok": true,
        "in_stock_g": 3915.0,
        "fit_score": 0.076,
        "is_capable": true,
        "is_bookable": true,
        "reason": "fits 330×300×240mm; holds ±0.200mm; 3915g in stock"
      }
    ]
  }
  ```

### 2.2. Query Free Machine Slots
- **Route:** `GET /machines/:id/slots?from=YYYY-MM-DD&days=7`
- **Access:** Public / All Roles
- **Description:** Calls `free_slots()` to project unreserved appointment windows matching facility operating hours.
- **Response 200 OK:**
  ```json
  {
    "success": true,
    "machine_id": 1,
    "slots": [
      {
        "slot_start": "2026-09-30T09:00:00+05:30",
        "slot_end": "2026-09-30T10:00:00+05:30"
      },
      {
        "slot_start": "2026-09-30T12:00:00+05:30",
        "slot_end": "2026-09-30T13:00:00+05:30"
      }
    ]
  }
  ```

---

## 3. Work Orders & Quotation Endpoints

### 3.1. List Jobs
- **Route:** `GET /jobs`
- **Access Scoping:**
  - `innovator`: Filters strictly to `user_id = session.user_id`.
  - `centre_staff` / `centre_manager`: Filters strictly to `machine.centre_id = session.centre_id`.
  - `apis_admin`: Unfiltered statewide access.
- **Response 200 OK:**
  ```json
  {
    "success": true,
    "jobs": [
      {
        "id": 1,
        "title": "Drone arm bracket",
        "status": "ready",
        "machine": "Ultimaker S5",
        "quantity": 4,
        "quote_total": "575.00"
      }
    ]
  }
  ```

### 3.2. Create Job Request with Technical Files
- **Route:** `POST /jobs`
- **Access:** `innovator`, `apis_admin`
- **Content-Type:** `multipart/form-data`
- **Form Fields:** `machine_id`, `material_code`, `title`, `description`, `req_x_mm`, `req_y_mm`, `req_z_mm`, `quantity`, `files` (binary).
- **Response 201 Created:**
  ```json
  {
    "success": true,
    "job": {
      "id": 6,
      "title": "Robotic Gripper",
      "status": "quote_pending",
      "created_at": "2026-09-29T13:00:00Z"
    }
  }
  ```

### 3.3. Issue / Revise Quotation
- **Route:** `POST /jobs/:id/quote`
- **Access Scoping:** `centre_manager` (Scoped to own centre), `apis_admin`
- **Request Body:**
  ```json
  {
    "minutes": 90,
    "grams": 85.0,
    "note": "Quote v1 issued after CAD review"
  }
  ```
- **Response 200 OK:**
  ```json
  {
    "success": true,
    "quote": {
      "job_id": 3,
      "version": 1,
      "est_minutes": 90,
      "machine_cost": "525.00",
      "material_grams": "85.00",
      "material_cost": "212.50",
      "setup_cost": "100.00",
      "discount": "262.50",
      "total": "575.00",
      "valid_until": "2026-10-06T13:00:00Z"
    }
  }
  ```

### 3.4. Accept or Decline Quotation
- **Route:** `POST /jobs/:id/quote/action`
- **Access Scoping:** `innovator` (Must own job)
- **Request Body:**
  ```json
  {
    "action": "accept" // or "decline"
  }
  ```
- **Response 200 OK:**
  ```json
  {
    "success": true,
    "status": "quote_accepted"
  }
  ```

---

## 4. Scheduling & Lifecycle Reconciliation Endpoints

### 4.1. Book Slot for Accepted Job
- **Route:** `POST /jobs/:id/book`
- **Access Scoping:** `innovator` (Must own job), `centre_manager` (Own centre)
- **Prerequisite:** Job status must equal `'quote_accepted'`.
- **Request Body:**
  ```json
  {
    "slot_start": "2026-09-30T10:00:00+05:30",
    "slot_end": "2026-09-30T12:00:00+05:30"
  }
  ```
- **Response 200 OK:**
  ```json
  {
    "success": true,
    "booking_id": 10,
    "job_status": "queued"
  }
  ```
- **Response 409 Conflict (Double-Booking Rejection):**
  ```json
  {
    "success": false,
    "error": {
      "code": "SLOT_CONFLICT",
      "message": "The requested time slot overlaps an existing booking on this machine."
    }
  }
  ```

### 4.2. Advance Job State
- **Route:** `POST /jobs/:id/transition`
- **Access Scoping:**
  - `centre_staff` / `centre_manager`: Scoped to own centre.
  - `innovator`: Can only trigger `'cancelled'`.
- **Request Body:**
  ```json
  {
    "to_status": "running",
    "grams": 85.0,
    "note": "Print cycle initiated on Ultimaker S5"
  }
  ```
- **Response 200 OK:**
  ```json
  {
    "success": true,
    "status": "running"
  }
  ```
- **Response 400 Bad Request (Stock Out):**
  ```json
  {
    "success": false,
    "error": {
      "code": "INSUFFICIENT_STOCK",
      "message": "Insufficient stock: need 85g of pla, only 20g on hand"
    }
  }
  ```

---

## 5. Consumable Inventory Endpoints

### 5.1. Query Stock Balances & Alerts
- **Route:** `GET /inventory`
- **Access Scoping:** `centre_staff`, `centre_manager` (Scoped to own centre), `apis_admin`
- **Response 200 OK:**
  ```json
  {
    "success": true,
    "inventory": [
      {
        "machine_id": 1,
        "machine": "Ultimaker S5",
        "material_code": "pla",
        "material": "PLA",
        "in_stock_g": 3915.0,
        "reorder_at_g": 500.0,
        "is_low_stock": false
      }
    ]
  }
  ```

### 5.2. Record Stock Movement
- **Route:** `POST /inventory/movement`
- **Access Scoping:** `centre_manager` (Own centre), `apis_admin`
- **Request Body:**
  ```json
  {
    "machine_id": 1,
    "material_code": "pla",
    "delta_g": 1000.0,
    "reason": "restock",
    "note": "Shipment #PO-2026-092 from vendor"
  }
  ```
- **Response 201 Created:**
  ```json
  {
    "success": true,
    "new_balance_g": 4915.0
  }
  ```

---

## 6. System & Reset Endpoints

### 6.1. Deterministic Demo Reset
- **Route:** `POST /system/reset`
- **Access:** `apis_admin` (Demo Mode Only)
- **Description:** Re-applies base schema and reconciled seed scripts in an atomic transaction.
- **Response 200 OK:**
  ```json
  {
    "success": true,
    "message": "Database successfully reset to canonical seed state"
  }
  ```
