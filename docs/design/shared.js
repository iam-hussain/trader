// Shared chrome: sidebar nav, topbar, theme toggle, lucide icons, command palette stub
(function() {
  const NAV = [
    { section: 'Workspace' },
    { id: 'dashboard', label: 'Today', icon: 'layout-dashboard', href: 'dashboard.html', key: 'g d' },
    { id: 'briefs', label: 'Briefs', icon: 'newspaper', href: 'brief.html', key: 'g b' },
    { id: 'orders', label: 'Orders', icon: 'arrow-right-left', href: 'orders.html', key: 'g o' },
    { id: 'journal', label: 'Journal', icon: 'book-open', href: 'journal.html', key: 'g j' },
    { section: 'Markets' },
    { id: 'watchlist', label: 'Watchlist', icon: 'star', href: 'watchlist.html', key: 'g w' },
    { id: 'forecast', label: 'Forecast', icon: 'line-chart', href: 'forecast.html', key: 'g f' },
    { id: 'backtest', label: 'Backtest', icon: 'flask-conical', href: 'backtest.html', key: 'g t' },
    { section: 'Reference' },
    { id: 'components', label: 'Components', icon: 'shapes', href: 'components.html' },
    { id: 'settings', label: 'Settings', icon: 'settings', href: 'settings.html', key: 'g s' },
  ];

  function icon(name) {
    return `<i data-lucide="${name}"></i>`;
  }

  window.renderChrome = function(activeId, opts = {}) {
    const sb = document.getElementById('sidebar');
    if (sb) {
      sb.innerHTML = `
        <a href="index.html" style="display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:8px;text-decoration:none;color:var(--text);">
          <span style="width:22px;height:22px;border-radius:5px;background:linear-gradient(135deg,var(--primary),oklch(50% 0.15 280));display:flex;align-items:center;justify-content:center;font-family:'Geist Mono',monospace;font-weight:600;font-size:12px;color:white;">T</span>
          <span style="font-weight:600;font-size:13px;letter-spacing:-0.01em;">Trader</span>
          <span class="chip" style="margin-left:auto;height:16px;padding:0 4px;font-size:9px;">v0.4</span>
        </a>
        <div style="position:relative;margin-bottom:6px;">
          <input class="input" placeholder="Search · jump to" style="width:100%;padding-left:26px;height:26px;font-size:11px;" />
          <i data-lucide="search" style="position:absolute;left:8px;top:7px;width:12px;height:12px;color:var(--text-dim);"></i>
          <span class="kbd" style="position:absolute;right:6px;top:5px;">⌘K</span>
        </div>
        ${NAV.map(item => {
          if (item.section) return `<div class="sb-section">${item.section}</div>`;
          return `<a class="sb-item ${item.id === activeId ? 'active' : ''}" href="${item.href}">
            ${icon(item.icon)}
            <span>${item.label}</span>
            ${item.key ? `<span class="sb-key">${item.key}</span>` : ''}
          </a>`;
        }).join('')}
        <div style="margin-top:auto;padding:8px;border-top:1px solid var(--border);display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text-muted);">
          <span class="pulse-dot"></span>
          <span>IBKR · Paper</span>
          <span style="margin-left:auto;" class="mono t-muted">09:41 ET</span>
        </div>
      `;
    }

    const tb = document.getElementById('topbar');
    if (tb && opts.topbar !== false) {
      tb.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:500;">
          ${opts.crumbs ? opts.crumbs.map((c, i) => `
            <span style="color:${i === opts.crumbs.length - 1 ? 'var(--text)' : 'var(--text-muted)'};">${c}</span>
            ${i < opts.crumbs.length - 1 ? '<span style="color:var(--text-dim);">/</span>' : ''}
          `).join('') : (opts.title || '')}
        </div>
        <div style="margin-left:auto;display:flex;align-items:center;gap:8px;">
          ${opts.topbarRight || ''}
          <button class="btn btn-ghost btn-sm" onclick="toggleTheme()" aria-label="Toggle theme" title="Toggle theme">
            <i data-lucide="sun-moon"></i>
          </button>
          <button class="btn btn-ghost btn-sm" aria-label="Notifications" title="Notifications" style="position:relative;">
            <i data-lucide="bell"></i>
            <span style="position:absolute;top:4px;right:4px;width:6px;height:6px;background:var(--primary);border-radius:50%;"></span>
          </button>
          <div style="width:24px;height:24px;border-radius:50%;background:var(--bg-elev-3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;border:1px solid var(--border);">JK</div>
        </div>
      `;
    }
    if (window.lucide) lucide.createIcons();
  };

  window.toggleTheme = function() {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('trader-theme', next); } catch(e) {}
  };

  // restore theme
  try {
    const saved = localStorage.getItem('trader-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  } catch(e) {}

  // sparkline generator
  window.spark = function(data, opts = {}) {
    const w = opts.w || 80, h = opts.h || 24;
    const pad = 2;
    const min = Math.min(...data), max = Math.max(...data);
    const range = max - min || 1;
    const last = data[data.length - 1], first = data[0];
    const isPos = last >= first;
    const color = opts.color || (isPos ? 'var(--success)' : 'var(--danger)');
    const fillColor = opts.fill !== false ? color : 'none';
    const pts = data.map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (v - min) / range) * (h - pad * 2);
      return [x, y];
    });
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const dArea = d + ` L${pts[pts.length-1][0].toFixed(1)},${h} L${pts[0][0].toFixed(1)},${h} Z`;
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      ${opts.fill !== false ? `<path d="${dArea}" fill="${color}" opacity="0.15"/>` : ''}
      <path d="${d}" fill="none" stroke="${color}" stroke-width="1.2" stroke-linejoin="round"/>
    </svg>`;
  };

  // pseudo-random walk for mock sparklines (deterministic per seed)
  window.walk = function(seed, n, drift) {
    drift = drift || 0;
    let v = 100, out = [];
    let s = seed;
    for (let i = 0; i < n; i++) {
      s = (s * 9301 + 49297) % 233280;
      const r = s / 233280 - 0.5;
      v += r * 4 + drift;
      out.push(v);
    }
    return out;
  };
})();
