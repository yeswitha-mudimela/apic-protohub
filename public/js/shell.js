/**
 * APIC ProtoHub — Shared Navigation Shell & Demo Persona Switcher
 */
(function() {
  async function fetchSession() {
    try {
      const res = await fetch('/api/auth/session');
      return await res.json();
    } catch (e) {
      return { authenticated: false };
    }
  }

  async function checkHealth() {
    try {
      const res = await fetch('/api/health');
      return await res.json();
    } catch (e) {
      return { status: 'error' };
    }
  }

  async function switchPersona(key) {
    try {
      const res = await fetch('/api/auth/switch-persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaKey: key }),
      });
      if (res.ok) {
        window.location.reload();
      }
    } catch (e) {
      alert('Failed to switch persona: ' + e.message);
    }
  }

  async function initShell() {
    const session = await fetchSession();
    const health = await checkHealth();
    const currentPath = window.location.pathname;

    // Create top demo banner
    const banner = document.createElement('div');
    banner.className = 'proto-banner';
    banner.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px;">
        <span style="font-weight:700; color:#89f5e7;">● APIC PROTOHUB DEMO</span>
        <span>Dedicated Local PostgreSQL Monolith</span>
        <span class="proto-badge ${health.status === 'ok' ? 'badge-live' : 'badge-amber'}" style="font-size:10px;">
          API: ${health.status === 'ok' ? 'HEALTHY' : 'CONNECTING'}
        </span>
      </div>
      <div style="display:flex; align-items:center; gap:16px;">
        <span style="color:#cad3ff;">Active Persona: <strong>${session.user?.name || 'Guest'}</strong> (${session.user?.role?.replace('_', ' ') || 'None'})</span>
        <select id="proto-persona-select" style="background:#0b1c30; color:#ffffff; border:1px solid #1d4ed8; font-size:11px; padding:3px 8px; border-radius:4px; cursor:pointer;">
          <option value="ravi" ${session.user?.id === 1 ? 'selected' : ''}>Ravi Teja (Innovator / Student)</option>
          <option value="sneha" ${session.user?.id === 2 ? 'selected' : ''}>Sneha Reddy (Innovator / Startup)</option>
          <option value="lakshmi" ${session.user?.id === 4 ? 'selected' : ''}>M. Lakshmi (Staff — Vijayawada)</option>
          <option value="prasad" ${session.user?.id === 3 ? 'selected' : ''}>K. Prasad (Manager — Vizag)</option>
          <option value="admin" ${session.user?.id === 5 ? 'selected' : ''}>APIS Admin (Statewide)</option>
        </select>
      </div>
    `;

    // Create Navigation Header
    const nav = document.createElement('header');
    nav.className = 'proto-nav';
    nav.innerHTML = `
      <div style="max-width:1280px; margin:0 auto; padding:12px 24px; display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:24px;">
          <a href="/" style="text-decoration:none; display:flex; align-items:center; gap:10px;">
            <div style="width:32px; height:32px; background:#0037b0; border-radius:6px; display:flex; align-items:center; justify-content:center; color:white; font-weight:800; font-size:16px;">AP</div>
            <div>
              <div style="font-weight:800; font-size:16px; color:#0b1c30; letter-spacing:-0.02em;">APIC ProtoHub</div>
              <div style="font-size:10px; color:#434655; font-weight:600; text-transform:uppercase; letter-spacing:0.04em;">Andhra Pradesh Prototyping Network</div>
            </div>
          </a>
          <nav style="display:flex; gap:6px; margin-left:16px;">
            <a href="/customer" class="proto-btn ${currentPath.includes('/customer') || currentPath === '/' ? 'proto-btn-primary' : 'proto-btn-secondary'}">
              Customer Hub
            </a>
            <a href="/staff" class="proto-btn ${currentPath.includes('/staff') ? 'proto-btn-primary' : 'proto-btn-secondary'}">
              Staff Queue
            </a>
            <a href="/manager" class="proto-btn ${currentPath.includes('/manager') ? 'proto-btn-primary' : 'proto-btn-secondary'}">
              Manager Console
            </a>
            <a href="/admin" class="proto-btn ${currentPath.includes('/admin') ? 'proto-btn-primary' : 'proto-btn-secondary'}">
              Admin Portal
            </a>
          </nav>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <a href="/signin" class="proto-btn proto-btn-secondary" style="font-size:12px;">
            Sign In / Onboarding
          </a>
          <a href="/api/health" target="_blank" class="proto-btn" style="background:#f1f5f9; color:#475569; font-size:11px;" title="View Health JSON">
            Health Check ↗
          </a>
        </div>
      </div>
    `;

    document.body.prepend(nav);
    document.body.prepend(banner);

    // Event listener for persona switcher
    document.getElementById('proto-persona-select')?.addEventListener('change', (e) => {
      switchPersona(e.target.value);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShell);
  } else {
    initShell();
  }
})();
