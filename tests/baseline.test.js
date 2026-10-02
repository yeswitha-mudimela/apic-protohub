/**
 * APIC ProtoHub — Baseline Test Suite
 * Tests health endpoint, environment configuration, role shells, and error handling.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { app, DEMO_PERSONAS, CANONICAL_CENTRES } = require('../server.js');

let server;
let baseUrl;

before(async () => {
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  return new Promise((resolve) => {
    server.close(resolve);
  });
});

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(`${baseUrl}${path}`, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          json: () => {
            try { return JSON.parse(data); } catch (e) { return null; }
          }
        });
      });
    }).on('error', reject);
  });
}

function post(path, body = {}, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const req = http.request(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          json: () => {
            try { return JSON.parse(data); } catch (e) { return null; }
          }
        });
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

describe('1. Health Endpoint & Secret Sanitization', () => {
  test('GET /api/health returns 200 OK and valid operational status', async () => {
    const res = await get('/api/health');
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'APIC ProtoHub API');
    assert.equal(body.version, '1.0.0');
    assert.ok(body.uptimeSeconds >= 0);
  });

  test('GET /api/health never exposes database passwords, secrets, or raw connection strings', async () => {
    const res = await get('/api/health');
    const raw = res.body.toLowerCase();
    assert.equal(raw.includes('password'), false, 'Should not contain password');
    assert.equal(raw.includes('secret'), false, 'Should not contain secret');
    assert.equal(raw.includes('session_secret'), false, 'Should not expose session secret');
  });
});

describe('2. Authentication & Demo Personas', () => {
  test('GET /api/auth/session returns default persona and all 5 demo accounts', async () => {
    const res = await get('/api/auth/session');
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.authenticated, true);
    assert.equal(body.availablePersonas.length, 5);
    assert.ok(body.availablePersonas.some(p => p.role === 'apis_admin'));
    assert.ok(body.availablePersonas.some(p => p.role === 'centre_manager'));
  });

  test('POST /api/auth/switch-persona successfully changes persona to K. Prasad (Manager)', async () => {
    const res = await post('/api/auth/switch-persona', { personaKey: 'prasad' });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.success, true);
    assert.equal(body.user.role, 'centre_manager');
    assert.equal(body.user.centreId, 1);
  });
});

describe('3. Catalog & Matching Engine', () => {
  test('GET /api/centres returns 5 canonical regional facilities in AP', async () => {
    const res = await get('/api/centres');
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.total, 5);
    assert.ok(body.centres.some(c => c.name.includes('Visakhapatnam')));
    assert.ok(body.centres.some(c => c.name.includes('Vijayawada')));
  });

  test('POST /api/match returns capable machines for small part envelope', async () => {
    const res = await post('/api/match', { x_mm: 100, y_mm: 60, z_mm: 40, quantity: 2 });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(body.totalMatches > 0);
    assert.ok(body.matches[0].fitScore > 0);
    assert.ok(body.matches[0].estCostINR > 0);
  });
});

describe('4. Centralized Error Handling & Not Found', () => {
  test('Unknown API route returns structured 404 JSON with correlationId', async () => {
    const res = await get('/api/unregistered-route-xyz');
    assert.equal(res.statusCode, 404);
    const body = res.json();
    assert.equal(body.error.code, 'ROUTE_NOT_FOUND');
    assert.ok(body.error.correlationId);
  });

  test('Unbuilt mutation endpoint returns 501 Not Implemented with deliberate placeholder code', async () => {
    const res = await post('/api/jobs/1/transition', { status: 'running' });
    assert.equal(res.statusCode, 501);
    const body = res.json();
    assert.equal(body.code, 'FEATURE_PHASE_PENDING');
  });
});

describe('5. Responsive Role Shells Availability', () => {
  test('Customer shell /customer renders with HTTP 200', async () => {
    const res = await get('/customer');
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.includes('Customer Hub'));
  });

  test('Staff shell /staff renders with HTTP 200', async () => {
    const res = await get('/staff');
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.includes('Staff Queue'));
  });

  test('Manager shell /manager renders with HTTP 200', async () => {
    const res = await get('/manager');
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.includes('Manager Console'));
  });

  test('Admin shell /admin renders with HTTP 200', async () => {
    const res = await get('/admin');
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.includes('Admin Portal'));
  });
});
