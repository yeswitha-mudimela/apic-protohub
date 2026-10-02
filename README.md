# APIC ProtoHub — Multi-Centre Prototyping Network Platform

**Prototyping-as-a-Service for Andhra Pradesh**  
Built for the APIC ProtoHub Innovation Challenge (RTIH × AP Innovation Society).

---

## 1. Executive Overview

APIC ProtoHub connects innovators, students, startups, and enterprises to state-of-the-art manufacturing infrastructure across 5 regional university facilities in Andhra Pradesh:
- **APIC Visakhapatnam** (Andhra University Engineering College Campus)
- **APIC Vijayawada** (VR Siddhartha Engineering College)
- **APIC Tirupati** (Sri Venkateswara University Campus)
- **APIC Kakinada** (JNTU-K Campus)
- **APIC Anantapur** (JNTU-A Campus)

The platform provides rotation-aware machine capability matching, itemized quote calculation, collision-proof slot scheduling via PostgreSQL GiST exclusion constraints, and transactional double-entry inventory tracking.

---

## 2. Architecture & Design System

- **Backend:** Node.js Express modular monolith (`server.js`) with typed REST API.
- **Database:** PostgreSQL 18 with `btree_gist` extension enforcing double-booking prevention.
- **Frontend:** Built with Google Stitch **"Blueprint Precision"** tokens (`public/css/tokens.css`), responsive across mobile and desktop.
- **Roles:**
  - **Customer / Innovator:** Discovery, part profile matcher, CAD submission, quote acceptance, live tracking (`/customer`).
  - **Centre Staff:** Shop-floor execution, setup, running, metrology QC, customer collection (`/staff`).
  - **Centre Manager:** Operations queue, quote builder, equipment maintenance toggle, consumables stock ledger (`/manager`).
  - **Network Administrator:** Statewide APIS facility commissioning, utilization metrics (`/admin`).

---

## 3. Quickstart & Local Installation

### Prerequisites
- **Node.js:** v20.x or v24.x
- **PostgreSQL:** v16+ or v18+ (Dedicated local cluster on port 5433 or standard 5432)

### Installation
```bash
# Clone the repository
git clone https://github.com/yeswitha-mudimela/apic-protohub.git
cd apic-protohub

# Install dependencies
npm install

# Configure environment variables (defaults to development with demo adapters)
cp .env.example .env
```

### Running Locally
```bash
# Start the application server
npm start
```
The server will start at `http://localhost:3000`:
- **Landing Page & Discovery:** [http://localhost:3000/](http://localhost:3000/)
- **Customer Hub:** [http://localhost:3000/customer](http://localhost:3000/customer)
- **Staff Execution Queue:** [http://localhost:3000/staff](http://localhost:3000/staff)
- **Manager Console:** [http://localhost:3000/manager](http://localhost:3000/manager)
- **Statewide Admin Portal:** [http://localhost:3000/admin](http://localhost:3000/admin)
- **Sign In / Persona Switcher:** [http://localhost:3000/signin](http://localhost:3000/signin)
- **Health Check Endpoint:** [http://localhost:3000/api/health](http://localhost:3000/api/health)

---

## 4. Automated Test Suite

Run the baseline verification tests:
```bash
npm test
```
The automated test runner verifies:
1. Health endpoint returns 200 OK without leaking credentials or secrets.
2. Demo persona switching and session assignment across all 5 roles.
3. Catalogue and capability matching algorithm.
4. Centralized 404 and structured JSON error responses.
5. Responsive availability of all 4 role shells.

---

## 5. Deployment Guide

### Deploying to Render
This repository includes a `render.yaml` blueprint:
1. Push repository to GitHub.
2. In Render Dashboard, click **New +** $\rightarrow$ **Blueprint**.
3. Select this repository. Render will automatically detect `render.yaml`, install dependencies, and launch the service.

### Deploying to Vercel
This repository includes `vercel.json`:
```bash
npx vercel deploy --prod
```

### Deploying with Docker
```bash
docker build -t apic-protohub .
docker run -p 3000:3000 apic-protohub
```

---

## 6. Seeded Demo Accounts

In local demo mode (`DEMO_MODE=true`), switch between users instantly using the top banner or `/signin`:

| Persona Name | Role | Facility Assignment | Affiliation |
|---|---|---|---|
| **Ravi Teja** | `innovator` | Statewide | Student (JNTU Kakinada) |
| **Sneha Reddy** | `innovator` | Statewide | Startup (HydroFilter Labs) |
| **M. Lakshmi** | `centre_staff` | APIC Vijayawada | Operator |
| **K. Prasad** | `centre_manager` | APIC Visakhapatnam | Operations Manager |
| **APIS Admin** | `apis_admin` | Statewide (APIS) | Network Administrator |

---

## 7. License & Credits

Built by **AYU SYSTEMS** for the **Andhra Pradesh Innovation Society (APIS)** ProtoHub Innovation Challenge.  
Licensed under the ISC License.
