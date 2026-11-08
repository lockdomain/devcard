// DevCard UI. Calls the public GitHub REST API straight from the browser (60 requests/hour per IP).
(() => {
  const $ = (id) => document.getElementById(id);
  const { summarize, compact } = window.DevCardStats;
  const canvas = $('card');
  const ctx = canvas.getContext('2d');
  const W = 1200, H = 675;
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  const THEMES = [
    { name: 'GitHub', a: '#0d1117', b: '#161b22', text: '#e6edf3', muted: '#8b949e', line: '#30363d', box: 'rgba(255,255,255,.04)', cells: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'], accent: '#39d353' },
    { name: 'Midnight', a: '#0b1026', b: '#1e1b4b', text: '#eef2ff', muted: '#a5b4fc', line: '#312e81', box: 'rgba(255,255,255,.05)', cells: ['#1e1b4b', '#3730a3', '#4f46e5', '#818cf8', '#c7d2fe'], accent: '#818cf8' },
    { name: 'Sunset', a: '#1c0f0a', b: '#3b1219', text: '#fff7ed', muted: '#fdba74', line: '#5b2a1c', box: 'rgba(255,255,255,.05)', cells: ['#3b1d16', '#7c2d12', '#c2410c', '#f97316', '#fdba74'], accent: '#fb923c' },
    { name: 'Paper', a: '#ffffff', b: '#f1f5f9', text: '#0f172a', muted: '#64748b', line: '#e2e8f0', box: 'rgba(15,23,42,.035)', cells: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'], accent: '#16a34a' },
  ];
  let theme = THEMES[0];
  let data = null;
  let avatar = null;

  THEMES.forEach((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = t.name;
    b.setAttribute('aria-label', t.name + ' theme');
    b.style.background = `linear-gradient(135deg, ${t.a}, ${t.cells[3]})`;
    if (!i) b.classList.add('on');
    b.onclick = () => {
      theme = t;
      $('themes').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      draw();
    };
    $('themes').appendChild(b);
  });

  // ---------- data ----------
  async function gh(path) {
    const r = await fetch('https://api.github.com' + path, { headers: { Accept: 'application/vnd.github+json' } });
    if (r.status === 404) throw new Error('No GitHub user with that name.');
    if (r.status === 403 || r.status === 429) {
      const reset = +r.headers.get('x-ratelimit-reset');
      const mins = reset ? Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60000)) : 60;
      throw new Error(`GitHub limits anonymous requests to 60 an hour. Try again in about ${mins} min.`);
    }
    if (!r.ok) throw new Error('GitHub did not answer. Try again in a moment.');
    return r.json();
  }
  async function load(login) {
    login = login.trim().replace(/^@/, '').replace(/^https?:\/\/github\.com\//, '').split(/[/?#]/)[0];
    if (!login) return;
    $('err').textContent = '';
    const btn = $('form').querySelector('button');
    btn.disabled = true; btn.textContent = 'Loading…';
    try {
      const user = await gh(`/users/${encodeURIComponent(login)}`);
      const pages = Math.min(3, Math.ceil((user.public_repos || 0) / 100)) || 1;
      const repoPages = await Promise.all(Array.from({ length: pages }, (_, i) => gh(`/users/${user.login}/repos?per_page=100&sort=pushed&page=${i + 1}`)));
      // GitHub keeps ~90 days of public events, 100 per page, at most 3 pages
      const events = [];
      for (let page = 1; page <= 3; page++) {
        const batch = await gh(`/users/${user.login}/events/public?per_page=100&page=${page}`).catch(() => []);
        events.push(...batch);
        if (batch.length < 100) break;
      }
      data = summarize(user, repoPages.flat(), events);
      avatar = await loadAvatar(user.avatar_url + '&s=240');
      $('out').hidden = false;
      history.replaceState(null, '', '#' + user.login);
      draw();
      $('out').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      $('err').textContent = e.message;
    } finally {
      btn.disabled = false; btn.textContent = 'Make my card';
    }
  }
  function loadAvatar(src) {
    return new Promise((res) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = src;
    });
  }

  // ---------- drawing ----------
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function text(s, x, y, size, weight, color, align = 'left') {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, y); ctx.textAlign = 'left';
  }
  function clip(s, max, size, weight) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(s).width <= max) return s;
    while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1);
    return s.trimEnd() + '…';
  }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

  function draw() {
    if (!data) return;
    const d = data, t = theme;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, t.a); g.addColorStop(1, t.b);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W, 0, 10, W, 0, 600);
    glow.addColorStop(0, hexA(t.accent, 0.18)); glow.addColorStop(1, hexA(t.accent, 0));
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

    // header: avatar, name, handle, bio
    const ax = 56, ay = 52, as = 104;
    ctx.save();
    ctx.beginPath(); ctx.arc(ax + as / 2, ay + as / 2, as / 2, 0, Math.PI * 2); ctx.clip();
    if (avatar) ctx.drawImage(avatar, ax, ay, as, as);
    else { ctx.fillStyle = t.accent; ctx.fillRect(ax, ay, as, as); text(d.login[0].toUpperCase(), ax + as / 2, ay + 70, 52, 800, t.a, 'center'); }
    ctx.restore();
    ctx.strokeStyle = t.line; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(ax + as / 2, ay + as / 2, as / 2 + 1.5, 0, Math.PI * 2); ctx.stroke();

    const nx = ax + as + 26;
    text(clip(d.name, 470, 40, 800), nx, ay + 44, 40, 800, t.text);
    text('@' + d.login, nx, ay + 78, 22, 600, t.muted);
    if (d.bio) text(clip(d.bio.replace(/\s+/g, ' '), 470, 18, 500), nx, ay + 106, 18, 500, t.muted);

    // stat boxes (top right)
    const stats = [['Stars', d.stars], ['Repos', d.publicRepos], ['Followers', d.followers]];
    const bw = 150, bh = 104, gap = 14, bx0 = W - 56 - stats.length * bw - (stats.length - 1) * gap;
    stats.forEach(([k, v], i) => {
      const x = bx0 + i * (bw + gap);
      rr(x, ay, bw, bh, 16); ctx.fillStyle = t.box; ctx.fill();
      ctx.strokeStyle = t.line; ctx.lineWidth = 1.5; ctx.stroke();
      text(compact(v), x + bw / 2, ay + 58, 38, 800, t.text, 'center');
      text(k.toUpperCase(), x + bw / 2, ay + 86, 14, 700, t.muted, 'center');
    });

    // languages (left middle)
    const ly = 214;
    text('TOP LANGUAGES', 56, ly, 14, 700, t.muted);
    const barX = 56, barY = ly + 18, barW = 500, barH = 14;
    rr(barX, barY, barW, barH, 7); ctx.fillStyle = t.box; ctx.fill();
    ctx.save(); rr(barX, barY, barW, barH, 7); ctx.clip();
    let cx = barX;
    d.langs.forEach((l) => { const w = (l.pct / 100) * barW; ctx.fillStyle = l.color; ctx.fillRect(cx, barY, w + 0.5, barH); cx += w; });
    ctx.restore();
    d.langs.forEach((l, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = 56 + col * 260, y = barY + 54 + row * 34;
      ctx.beginPath(); ctx.arc(x + 7, y - 6, 7, 0, Math.PI * 2); ctx.fillStyle = l.color; ctx.fill();
      text(clip(l.name, 150, 19, 600), x + 24, y, 19, 600, t.text);
      text(l.pct.toFixed(0) + '%', x + 230, y, 19, 600, t.muted, 'right');
    });
    if (!d.langs.length) text('No public code yet', 56, barY + 54, 19, 600, t.muted);

    // best repos (right middle)
    const rx = 620, rw = W - 56 - rx;
    text('MOST STARRED', rx, ly, 14, 700, t.muted);
    d.top.forEach((r, i) => {
      const y = ly + 18 + i * 64;
      rr(rx, y, rw, 54, 12); ctx.fillStyle = t.box; ctx.fill();
      ctx.strokeStyle = t.line; ctx.lineWidth = 1.2; ctx.stroke();
      text(clip(r.name, rw - 130, 20, 700), rx + 18, y + 34, 20, 700, t.text);
      text('★ ' + compact(r.stars), rx + rw - 18, y + 34, 19, 700, t.accent, 'right');
    });
    if (!d.top.length) text('No public repos yet', rx, ly + 50, 19, 600, t.muted);

    // activity heatmap (bottom)
    const hy = 452;
    const a = d.act;
    text('LAST 12 WEEKS', 56, hy, 14, 700, t.muted);
    const cell = 16, cg = 4, cols = 12, gx = 56, gy = hy + 18;
    // squares per week column, 7 rows
    const max = Math.max(1, ...a.grid);
    for (let c = 0; c < cols; c++) for (let r = 0; r < 7; r++) {
      const v = a.grid[c * 7 + r];
      const lvl = v === 0 ? 0 : Math.min(4, 1 + Math.floor((v / max) * 3.99));
      rr(gx + c * (cell + cg), gy + r * (cell + cg), cell, cell, 4);
      ctx.fillStyle = t.cells[lvl]; ctx.fill();
    }
    const sx = gx + cols * (cell + cg) + 34;
    const facts = [
      [compact(a.total), 'public actions'],
      [String(a.activeDays), 'active days'],
      [String(d.recent), 'repos updated this month'],
    ];
    facts.forEach(([v, k], i) => {
      const y = gy + 30 + i * 46;
      text(v, sx, y, 30, 800, t.text);
      ctx.font = `800 30px ${FONT}`;
      const w = ctx.measureText(v).width;
      text(k, sx + w + 12, y, 19, 600, t.muted);
    });

    // footer
    text(`On GitHub since ${d.since.getUTCFullYear()}`, W - 56, H - 44, 18, 600, t.muted, 'right');
    text('devcard', W - 56, H - 20, 14, 700, hexA(t.muted, 0.7), 'right');

    $('share').href = 'https://x.com/intent/post?text=' + encodeURIComponent(`My GitHub in one card: ${compact(d.stars)} stars, ${d.publicRepos} repos, mostly ${d.langs[0]?.name || 'code'}. Made with DevCard https://lockdomain.github.io/devcard/`);
  }

  // ---------- events ----------
  $('form').onsubmit = (e) => { e.preventDefault(); load($('user').value); };
  document.querySelectorAll('.examples a').forEach((a) => (a.onclick = (e) => { e.preventDefault(); $('user').value = a.dataset.u; load(a.dataset.u); }));
  $('download').onclick = () => {
    const a = document.createElement('a');
    a.download = `devcard-${data?.login || 'github'}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };
  $('copy').onclick = () => canvas.toBlob(async (blob) => {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); $('copy').textContent = 'Copied'; }
    catch { $('copy').textContent = 'Not supported'; }
    setTimeout(() => ($('copy').textContent = 'Copy image'), 1500);
  });
  const fromHash = decodeURIComponent(location.hash.slice(1));
  if (fromHash) { $('user').value = fromHash; load(fromHash); }
  // also react when someone changes the #name part on an already open page
  window.addEventListener('hashchange', () => {
    const u = decodeURIComponent(location.hash.slice(1));
    if (u && u !== data?.login) { $('user').value = u; load(u); }
  });
})();
