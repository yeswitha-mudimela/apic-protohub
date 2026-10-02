/**
 * APIC ProtoHub — Modular Monolith Application Server
 * Serves the REST API and the Google Stitch Blueprint Precision frontend shells.
 */
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

// Load environment configuration
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Environment Configuration & Validation
const PORT = parseInt(process.env.PORT || '3000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const DEMO_MODE = process.env.DEMO_MODE !== 'false';
const PGHOST = process.env.PGHOST || 'localhost';
const PGPORT = parseInt(process.env.PGPORT || '5433', 10);
const PGDATABASE = process.env.PGDATABASE || 'protohub';
const PGUSER = process.env.PGUSER || 'postgres';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_local_demo_session_secret_32_characters_minimum';

// In-memory Session & OTP Stores
const sessionStore = new Map();
const otpStore = new Map();

// Canonical Seeded Demo Personas
const DEMO_PERSONAS = {
  ravi: {
    id: 1,
    name: 'Ravi Teja',
    phone: '+919000000001',
    role: 'innovator',
    centreId: null,
    affiliation: 'student',
    institution: 'JNTU Kakinada',
  },
  sneha: {
    id: 2,
    name: 'Sneha Reddy',
    phone: '+919000000002',
    role: 'innovator',
    centreId: null,
    affiliation: 'startup',
    institution: 'HydroFilter Labs',
  },
  prasad: {
    id: 3,
    name: 'K. Prasad',
    phone: '+919000000003',
    role: 'centre_manager',
    centreId: 1, // Visakhapatnam
    affiliation: null,
    institution: null,
  },
  lakshmi: {
    id: 4,
    name: 'M. Lakshmi',
    phone: '+919000000004',
    role: 'centre_staff',
    centreId: 2, // Vijayawada
    affiliation: null,
    institution: null,
  },
  admin: {
    id: 5,
    name: 'APIS Admin',
    phone: '+919000000005',
    role: 'apis_admin',
    centreId: null,
    affiliation: null,
    institution: null,
  },
};

// Canonical APIC Network Centres in Andhra Pradesh
const CANONICAL_CENTRES = [
  { id: 1, name: 'APIC Visakhapatnam', district: 'Visakhapatnam', campus: 'AU Engineering College Campus', phone: '0891-2844000', lat: 17.730000, lng: 83.319000, isLive: true, machineCount: 3 },
  { id: 2, name: 'APIC Vijayawada', district: 'NTR', campus: 'Siddhartha Engineering College', phone: '0866-2582333', lat: 16.506100, lng: 80.648000, isLive: true, machineCount: 3 },
  { id: 3, name: 'APIC Tirupati', district: 'Tirupati', campus: 'SVU Campus', phone: '0877-2289000', lat: 13.628700, lng: 79.419200, isLive: true, machineCount: 2 },
  { id: 4, name: 'APIC Kakinada', district: 'Kakinada', campus: 'JNTU-K Campus', phone: '0884-2300900', lat: 16.989400, lng: 82.247500, isLive: true, machineCount: 2 },
  { id: 5, name: 'APIC Anantapur', district: 'Anantapur', campus: 'JNTU-A Campus', phone: '08554-272000', lat: 14.681500, lng: 77.600400, isLive: false, machineCount: 2 },
];

// Canonical Machines Catalogue
const CANONICAL_MACHINES = [
  { id: 1, centreId: 1, centreName: 'APIC Visakhapatnam', make: 'Ultimaker', model: 'S5', process: 'fdm', assetTag: 'VZG-3DP-001', status: 'available', ratePerHour: 350.00, setupFee: 100.00, minCharge: 200.00, studentDiscountPct: 50, envelope: { x: 330, y: 240, z: 300 } },
  { id: 2, centreId: 1, centreName: 'APIC Visakhapatnam', make: 'Formlabs', model: 'Form 3L', process: 'sla', assetTag: 'VZG-SLA-001', status: 'available', ratePerHour: 600.00, setupFee: 150.00, minCharge: 400.00, studentDiscountPct: 40, envelope: { x: 335, y: 200, z: 300 } },
  { id: 3, centreId: 1, centreName: 'APIC Visakhapatnam', make: 'Haas', model: 'Mini Mill', process: 'cnc_mill', assetTag: 'VZG-CNC-001', status: 'available', ratePerHour: 1200.00, setupFee: 500.00, minCharge: 1000.00, studentDiscountPct: 30, envelope: { x: 406, y: 305, z: 254 } },
  { id: 4, centreId: 2, centreName: 'APIC Vijayawada', make: 'Bambu Lab', model: 'X1-Carbon', process: 'fdm', assetTag: 'BZA-3DP-001', status: 'available', ratePerHour: 280.00, setupFee: 80.00, minCharge: 150.00, studentDiscountPct: 50, envelope: { x: 256, y: 256, z: 256 } },
  { id: 5, centreId: 2, centreName: 'APIC Vijayawada', make: 'Epilog', model: 'Fusion Pro 32', process: 'laser_cut', assetTag: 'BZA-LSR-001', status: 'available', ratePerHour: 500.00, setupFee: 100.00, minCharge: 250.00, studentDiscountPct: 40, envelope: { x: 812, y: 508, z: 228 } },
  { id: 6, centreId: 2, centreName: 'APIC Vijayawada', make: 'Voltera', model: 'V-One', process: 'pcb', assetTag: 'BZA-PCB-001', status: 'available', ratePerHour: 400.00, setupFee: 150.00, minCharge: 300.00, studentDiscountPct: 40, envelope: { x: 128, y: 116, z: 16 } },
  { id: 7, centreId: 3, centreName: 'APIC Tirupati', make: 'EOS', model: 'Formiga P 110 Velocis', process: 'sls', assetTag: 'TPT-SLS-001', status: 'available', ratePerHour: 1800.00, setupFee: 800.00, minCharge: 1500.00, studentDiscountPct: 35, envelope: { x: 200, y: 250, z: 330 } },
  { id: 8, centreId: 3, centreName: 'APIC Tirupati', make: 'Prusa', model: 'MK4', process: 'fdm', assetTag: 'TPT-3DP-001', status: 'available', ratePerHour: 200.00, setupFee: 50.00, minCharge: 100.00, studentDiscountPct: 50, envelope: { x: 250, y: 210, z: 220 } },
];

// App Creation
const app = express();
app.disable('x-powered-by');

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie Parser
app.use((req, res, next) => {
  req.cookies = {};
  if (req.headers.cookie) {
    req.headers.cookie.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      const name = parts[0]?.trim();
      const val = parts.slice(1).join('=').trim();
      if (name) req.cookies[name] = decodeURIComponent(val);
    });
  }
  next();
});

// Correlation ID
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || `req_${crypto.randomBytes(8).toString('hex')}`;
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
});

// Session & Scoping Middleware
app.use((req, res, next) => {
  const token = req.cookies['protohub_session'] || (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));
  if (token && sessionStore.has(token)) {
    req.user = sessionStore.get(token);
  } else {
    // Default demo session for instant local interaction
    req.user = DEMO_PERSONAS.ravi;
  }
  next();
});

// Static Assets
app.use(express.static(path.resolve(process.cwd(), 'public')));

// -------------------------------------------------------------
// REST API ROUTES
// -------------------------------------------------------------

// Health Endpoint (Strictly no exposed secrets)
const startTime = Date.now();
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'APIC ProtoHub API',
    version: '1.0.0',
    environment: NODE_ENV,
    demoMode: DEMO_MODE,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    database: {
      targetHost: PGHOST,
      targetPort: PGPORT,
      targetDatabase: PGDATABASE,
      status: 'configured',
    },
  });
});

// Session Details
app.get('/api/auth/session', (req, res) => {
  const currentUser = req.user || DEMO_PERSONAS.ravi;
  res.status(200).json({
    authenticated: true,
    user: currentUser,
    availablePersonas: Object.entries(DEMO_PERSONAS).map(([key, p]) => ({
      key,
      id: p.id,
      name: p.name,
      role: p.role,
      centreId: p.centreId,
      affiliation: p.affiliation,
      description: `${p.name} (${p.role.replace('_', ' ')}${p.centreId ? ` • Centre ${p.centreId}` : ''})`,
    })),
  });
});

// Switch Persona
app.post('/api/auth/switch-persona', (req, res) => {
  const { personaKey } = req.body;
  if (!personaKey || !DEMO_PERSONAS[personaKey]) {
    return res.status(400).json({
      error: { code: 'INVALID_PERSONA', message: `Unknown persona key '${personaKey}'.` },
    });
  }
  const selectedPersona = DEMO_PERSONAS[personaKey];
  const sessionId = `sess_${personaKey}_${Date.now()}`;
  sessionStore.set(sessionId, selectedPersona);

  res.cookie('protohub_session', sessionId, { httpOnly: true, sameSite: 'lax', maxAge: 86400 * 1000 });
  res.status(200).json({
    success: true,
    message: `Switched session to ${selectedPersona.name} (${selectedPersona.role}).`,
    user: selectedPersona,
    sessionId,
  });
});

// Simulated OTP Send
app.post('/api/auth/otp/send', (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.length < 10) {
    return res.status(400).json({ error: { code: 'INVALID_PHONE', message: 'Valid 10-digit phone number required.' } });
  }
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(phone, { code, phone, expiresAt: Date.now() + 300000, attempts: 0 });

  res.status(200).json({
    success: true,
    message: 'OTP generated for simulated demo mode (no external SMS transmitted).',
    phone,
    demoOtpDisplay: code,
    expiresInSeconds: 300,
  });
});

// Simulated OTP Verify
app.post('/api/auth/otp/verify', (req, res) => {
  const { phone, code } = req.body;
  const entry = otpStore.get(phone);
  if (!entry || Date.now() > entry.expiresAt) {
    return res.status(401).json({ error: { code: 'OTP_EXPIRED', message: 'OTP expired or not requested.' } });
  }
  if (entry.code !== code?.trim()) {
    return res.status(401).json({ error: { code: 'INVALID_OTP', message: 'Invalid OTP code.' } });
  }
  otpStore.delete(phone);

  const matched = Object.values(DEMO_PERSONAS).find(p => p.phone === phone) || {
    id: 99,
    name: 'Verified Innovator',
    phone,
    role: 'innovator',
    centreId: null,
  };
  const sessionId = `sess_${matched.id}_${Date.now()}`;
  sessionStore.set(sessionId, matched);
  res.cookie('protohub_session', sessionId, { httpOnly: true, sameSite: 'lax', maxAge: 86400 * 1000 });
  res.status(200).json({ success: true, user: matched, sessionId });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies['protohub_session'];
  if (token) sessionStore.delete(token);
  res.clearCookie('protohub_session');
  res.status(200).json({ success: true, message: 'Signed out.' });
});

// Centres List
app.get('/api/centres', (req, res) => {
  res.status(200).json({ total: CANONICAL_CENTRES.length, centres: CANONICAL_CENTRES });
});

// Machines List
app.get('/api/machines', (req, res) => {
  res.status(200).json({ total: CANONICAL_MACHINES.length, machines: CANONICAL_MACHINES });
});

// Capability Matching Engine (Preliminary screening endpoint)
app.post('/api/match', (req, res) => {
  const { x_mm, y_mm, z_mm, process, quantity = 1 } = req.body;
  const x = parseFloat(x_mm) || 100;
  const y = parseFloat(y_mm) || 100;
  const z = parseFloat(z_mm) || 50;

  // Envelope and rotation matching against canonical machines
  const matches = CANONICAL_MACHINES.map(m => {
    const env = m.envelope;
    // Check if parts fit inside bounding box
    const dims = [x, y, z].sort((a, b) => b - a);
    const box = [env.x, env.y, env.z].sort((a, b) => b - a);
    const fits = dims[0] <= box[0] && dims[1] <= box[1] && dims[2] <= box[2];
    const processMatch = !process || m.process === process;
    const isCapable = fits && processMatch;
    const isBookable = isCapable && m.status === 'available';

    const fitScore = isCapable ? Math.round(((dims[0]/box[0]) * (dims[1]/box[1]) * (dims[2]/box[2])) * 100) : 0;
    const estHours = Math.max(1, Math.round(((x * y * z) / 25000) * quantity));
    const estCost = Math.round((m.ratePerHour * estHours) + m.setupFee);

    return {
      machineId: m.id,
      centreName: m.centreName,
      make: m.make,
      model: m.model,
      process: m.process,
      status: m.status,
      isCapable,
      isBookable,
      fitScore: Math.min(100, Math.max(12, fitScore)),
      estHours,
      estCostINR: estCost,
      statusNote: isBookable ? 'Capable • Certified & Ready to Book' : (isCapable ? 'Capable • In Maintenance' : 'Envelope Exceeded'),
    };
  }).filter(m => m.isCapable);

  res.status(200).json({
    query: { x_mm: x, y_mm: y, z_mm: z, process, quantity },
    totalMatches: matches.length,
    matches,
  });
});

// Jobs List & Deliberate State Placeholders for Unbuilt Features
app.get('/api/jobs', (req, res) => {
  // Sample scoped jobs from seed data
  const sampleJobs = [
    { id: 1, title: 'Drone Arm Prototype', process: 'fdm', status: 'ready', centre: 'APIC Visakhapatnam', machine: 'Ultimaker S5', date: '2026-09-28' },
    { id: 2, title: 'Venturi Impeller Housing', process: 'sla', status: 'running', centre: 'APIC Vijayawada', machine: 'Formlabs Form 3L', date: '2026-09-29' },
    { id: 3, title: 'Titanium Bracket Fixture', process: 'cnc_mill', status: 'quote_pending', centre: 'APIC Visakhapatnam', machine: 'Haas Mini Mill', date: '2026-09-29' },
  ];
  res.status(200).json({ total: sampleJobs.length, jobs: sampleJobs });
});

// Explicit Deliberate Placeholder Handlers for Advanced Mutation Routes
['/api/jobs/:id/transition', '/api/jobs/:id/quote', '/api/jobs/:id/book', '/api/inventory/movement', '/api/system/reset'].forEach(route => {
  app.post(route, (req, res) => {
    res.status(501).json({
      status: 'unavailable',
      code: 'FEATURE_PHASE_PENDING',
      message: `Endpoint '${req.method} ${req.path}' is registered in route layout and scheduled for database activation in subsequent phase.`,
      correlationId: req.correlationId,
    });
  });
});

// -------------------------------------------------------------
// HTML NAVIGATION SHELLS (Stitch Design Foundation)
// -------------------------------------------------------------
app.get('/', (req, res) => res.sendFile(path.resolve(process.cwd(), 'public', 'index.html')));
app.get('/customer', (req, res) => res.sendFile(path.resolve(process.cwd(), 'public', 'customer.html')));
app.get('/staff', (req, res) => res.sendFile(path.resolve(process.cwd(), 'public', 'staff.html')));
app.get('/manager', (req, res) => res.sendFile(path.resolve(process.cwd(), 'public', 'manager.html')));
app.get('/admin', (req, res) => res.sendFile(path.resolve(process.cwd(), 'public', 'admin.html')));
app.get('/signin', (req, res) => res.sendFile(path.resolve(process.cwd(), 'public', 'signin.html')));

// -------------------------------------------------------------
// CENTRALIZED 404 & ERROR HANDLERS
// -------------------------------------------------------------
app.use((req, res) => {
  const isApi = req.path.startsWith('/api/') || req.xhr || req.headers.accept?.includes('application/json');
  if (isApi) {
    return res.status(404).json({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Endpoint '${req.method} ${req.path}' not found.`,
        correlationId: req.correlationId,
      },
    });
  }
  res.status(404).send(`
    <!DOCTYPE html>
    <html><head><title>404 — APIC ProtoHub</title>
    <style>body { font-family: sans-serif; background: #f8f9ff; color: #0b1c30; padding: 40px; text-align: center; }
    .card { max-width: 480px; margin: 40px auto; background: white; border: 1px solid #c4c5d7; padding: 32px; border-radius: 8px; }
    a { color: white; background: #0037b0; padding: 10px 18px; border-radius: 4px; text-decoration: none; font-weight: bold; }
    </style></head><body>
    <div class="card"><h2>404 — Page Not Found</h2><p>Page <code>${req.path}</code> does not exist.</p><br><a href="/">Return Home</a></div>
    </body></html>
  `);
});

app.use((err, req, res, next) => {
  const correlationId = req.correlationId || 'unknown';
  console.error(`[ERROR] [${correlationId}] ${req.method} ${req.path}:`, err.message);
  res.status(err.statusCode || 500).json({
    error: {
      code: err.errorCode || 'INTERNAL_SERVER_ERROR',
      message: NODE_ENV === 'production' ? 'An internal error occurred.' : err.message,
      correlationId,
    },
  });
});

// Server Listen (Only when executed directly)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log('================================================================');
    console.log('   APIC ProtoHub — Prototyping Network Service Platform         ');
    console.log(`   Server Running: http://localhost:${PORT}                      `);
    console.log(`   Environment:    ${NODE_ENV}                                  `);
    console.log(`   Demo Mode:      ${DEMO_MODE ? 'Active (Demo Adapters)' : 'Disabled'} `);
    console.log('----------------------------------------------------------------');
    console.log(`   • Health Check:  http://localhost:${PORT}/api/health          `);
    console.log(`   • Customer Hub:  http://localhost:${PORT}/customer            `);
    console.log(`   • Staff Queue:   http://localhost:${PORT}/staff               `);
    console.log(`   • Manager Hub:   http://localhost:${PORT}/manager             `);
    console.log(`   • Admin Portal:  http://localhost:${PORT}/admin               `);
    console.log('================================================================');
  });
}

module.exports = { app, DEMO_PERSONAS, CANONICAL_CENTRES, CANONICAL_MACHINES };
