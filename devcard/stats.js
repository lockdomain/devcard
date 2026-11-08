// DevCard core: turns public GitHub API responses into card stats. Pure, testable in Node.
(function (root) {
  const LANG_COLORS = {
    JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Go: '#00ADD8', Rust: '#dea584',
    Java: '#b07219', 'C++': '#f34b7d', C: '#555555', 'C#': '#178600', Ruby: '#701516', PHP: '#4F5D95',
    Swift: '#F05138', Kotlin: '#A97BFF', Dart: '#00B4AB', HTML: '#e34c26', CSS: '#563d7c', Shell: '#89e051',
    Vue: '#41b883', Svelte: '#ff3e00', Lua: '#000080', Luau: '#00A2FF', Elixir: '#6e4a7e', Scala: '#c22d40',
    Haskell: '#5e5086', Zig: '#ec915c', 'Jupyter Notebook': '#DA5B0B', R: '#198CE7', Nix: '#7e7eff', SCSS: '#c6538c',
  };
  const DAY = 86400000;

  function topLanguages(repos, n = 5) {
    const w = {};
    repos.filter((r) => !r.fork && r.language).forEach((r) => {
      // weight by size so one big project counts more than ten empty ones, plus stars as a tie breaker
      w[r.language] = (w[r.language] || 0) + Math.sqrt(Math.max(r.size || 1, 1)) + (r.stargazers_count || 0) * 0.5;
    });
    const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, n)
      .map(([name, v]) => ({ name, pct: (v / total) * 100, color: LANG_COLORS[name] || '#8b949e' }));
  }

  // 12 weeks x 7 days of activity from public events (the API returns up to ~90 days)
  function activity(events, now = Date.now()) {
    const weeks = 12;
    const end = new Date(now); end.setUTCHours(0, 0, 0, 0);
    const startMs = end.getTime() - (weeks * 7 - 1) * DAY - end.getUTCDay() * 0; // keep simple: last 84 days
    const grid = new Array(weeks * 7).fill(0);
    let total = 0;
    const days = new Set();
    for (const e of events || []) {
      const t = Date.parse(e.created_at);
      if (isNaN(t) || t < startMs) continue;
      const idx = Math.floor((t - startMs) / DAY);
      if (idx < 0 || idx >= grid.length) continue;
      const n = e.type === 'PushEvent' ? Math.max(1, e.payload?.size ?? e.payload?.distinct_size ?? 1) : 1;
      grid[idx] += n; total += n; days.add(idx);
    }
    // current streak counted back from today
    let streak = 0;
    for (let i = grid.length - 1; i >= 0 && grid[i] > 0; i--) streak++;
    return { grid, total, activeDays: days.size, streak, startMs };
  }

  function summarize(user, repos, events, now = Date.now()) {
    const own = repos.filter((r) => !r.fork);
    const stars = own.reduce((a, r) => a + (r.stargazers_count || 0), 0);
    const forks = own.reduce((a, r) => a + (r.forks_count || 0), 0);
    const top = [...own].sort((a, b) => (b.stargazers_count - a.stargazers_count) || (Date.parse(b.pushed_at) - Date.parse(a.pushed_at))).slice(0, 3)
      .map((r) => ({ name: r.name, stars: r.stargazers_count || 0, desc: r.description || '', language: r.language }));
    const since = new Date(user.created_at);
    const years = Math.max(0, (now - since.getTime()) / (365.25 * DAY));
    const recent = own.filter((r) => now - Date.parse(r.pushed_at) < 30 * DAY).length;
    return {
      login: user.login,
      name: user.name || user.login,
      bio: user.bio || '',
      avatar: user.avatar_url,
      followers: user.followers || 0,
      publicRepos: user.public_repos ?? own.length,
      stars, forks, top, recent,
      langs: topLanguages(own),
      act: activity(events, now),
      since, years,
    };
  }

  const compact = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));

  const api = { summarize, topLanguages, activity, compact, LANG_COLORS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DevCardStats = api;
})(this);
