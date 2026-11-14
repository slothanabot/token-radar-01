// Token Radar dashboard: renders window.RADAR (written by main.ts) with no network.
// Board: sortable, filterable, paginated. Detail: model breakdown, comparables, farm plan.
// Live: the live-token protocols the multiples are priced from. Model: the formula and the
// per-category comparable multiples. URL params set the state (for screenshots):
// ?tab=board|live|model &view=detail&slug=<slug> &filter=category:<name> &category=<name> &q=<text>
(function () {
  'use strict';
  var R = window.RADAR;
  if (!R || !Array.isArray(R.rows)) {
    document.getElementById('board').innerHTML = '<p>Token Radar: no data. Run main.ts to write data.js.</p>';
    return;
  }

  var PAGE = 25;
  var state = { tab: 'board', q: '', category: '', chain: '', minTvl: 0, scope: 'all', sort: 'implied', dir: -1, page: 1, detail: null };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fmtMoney(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) { if (n === null || n === undefined) return '—'; return (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function fmtAge(d) { if (d === null || d === undefined) return '—'; if (d >= 365) return (d / 365).toFixed(1) + 'y'; return d + 'd'; }
  function fmtMult(n) { return n.toFixed(2) + '×'; }

  // ---- farm plan: the same rules as lib/model.ts, so the page and board.json agree ----
  function capitalFor(p) { if (p.tvl_usd >= 5e9) return 250; if (p.tvl_usd >= 1e9) return 150; if (p.tvl_usd >= 1e8) return 100; return 50; }
  function holdDaysFor(age) { if (age === null || age === undefined) return 30; if (age < 180) return 60; if (age < 365) return 45; return 30; }
  function chainOf(p) { return p.chains && p.chains.length ? p.chains[0] : 'its main chain'; }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase(); var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of the ' + name + ' index on ' + chain + ' and hold the shares.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function farmSteps(p) {
    var chain = chainOf(p); var capital = capitalFor(p); var hold = holdDaysFor(p.age_days); var gas = capital >= 150 ? 8 : 4;
    var steps = [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and keep the position above $' + Math.max(25, Math.floor(capital / 2)) + '.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ];
    return steps.map(function (s) { return s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.'; });
  }

  // ---- filtering / sorting ----
  var watchSet = {};
  (R.watchlist || []).forEach(function (s) { watchSet[s] = true; });
  function isWatch(r) { return !!watchSet[r.slug]; }
  function filtered() {
    var q = state.q.trim().toLowerCase();
    var rows = R.rows.filter(function (r) {
      if (state.scope === 'watchlist' && !isWatch(r)) return false;
      if (state.scope === 'early' && isWatch(r)) return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort; var dir = state.dir;
    rows.sort(function (a, b) {
      var va, vb;
      if (key === 'implied') { va = a.implied_value_usd; vb = b.implied_value_usd; }
      else if (key === 'tvl') { va = a.tvl_usd; vb = b.tvl_usd; }
      else if (key === 'growth') { va = a.change_7d === null ? -Infinity : a.change_7d; vb = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { va = a.age_days === null ? -1 : a.age_days; vb = b.age_days === null ? -1 : b.age_days; }
      else if (key === 'name') { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
      else { va = a.rank; vb = b.rank; }
      if (va < vb) return -dir; if (va > vb) return dir;
      return a.slug < b.slug ? -1 : 1;
    });
    return rows;
  }

  // ---- rendering ----
  function renderStats() {
    var top = R.rows.length ? R.rows[0].implied_value_usd : 0;
    $('stats').innerHTML =
      stat(R.watchlist_size, 'Watchlist') + stat(R.board_size, 'Board rows') + stat(R.early_size, 'Early finds') +
      stat(R.live_size, 'Live tokens') + stat(fmtMoney(top), 'Top implied value');
    function stat(v, label) { return '<div class="stat"><b>' + esc(v) + '</b><span>' + esc(label) + '</span></div>'; }
  }
  function renderBoard() {
    var rows = filtered();
    var pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * PAGE;
    var page = rows.slice(start, start + PAGE);
    $('count').textContent = 'Showing ' + (rows.length ? start + 1 : 0) + '–' + Math.min(start + PAGE, rows.length) + ' of ' + rows.length + ' rows · ' + R.watchlist_size + ' watchlist · ' + R.early_size + ' early';
    $('rows').innerHTML = page.map(function (r) {
      var g = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg');
      return '<tr data-slug="' + esc(r.slug) + '"><td>' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span><span class="slug">' + esc(r.slug) + (isWatch(r) ? ' · watchlist' : ' · early') + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + (r.chains || []).slice(0, 3).map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') + '</td>' +
        '<td class="num">' + fmtMoney(r.tvl_usd) + '</td>' +
        '<td class="num ' + g + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num imp">' + fmtMoney(r.implied_value_usd) + '</td>' +
        '<td class="num">' + fmtMult(r.comparable_multiple) + '</td>' +
        '<td>›</td></tr>';
    }).join('') || '<tr><td colspan="10">No protocols match this filter.</td></tr>';
    $('pageinfo').textContent = 'Page ' + state.page + ' of ' + pages;
    $('prev').disabled = state.page <= 1; $('next').disabled = state.page >= pages;
  }
  function renderLive() {
    $('live-rows').innerHTML = R.live.map(function (p, i) {
      var g = p.change_7d === null ? '' : (p.change_7d >= 0 ? 'pos' : 'neg');
      return '<tr><td>' + (i + 1) + '</td><td><span class="name">' + esc(p.name) + '</span><span class="slug">' + esc(p.slug) + '</span></td>' +
        '<td>' + esc(p.category || '—') + '</td>' +
        '<td>' + (p.chains || []).slice(0, 3).map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') + '</td>' +
        '<td class="num">' + fmtMoney(p.tvl_usd) + '</td><td class="num">' + fmtMoney(p.mcap_usd) + '</td>' +
        '<td class="num">' + (p.mcap_tvl === null ? '—' : fmtMult(p.mcap_tvl)) + '</td>' +
        '<td class="num ' + g + '">' + fmtPct(p.change_7d) + '</td></tr>';
    }).join('');
  }
  function renderModel() {
    $('comp-rows').innerHTML = R.comparables.map(function (c) {
      return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.comparables + '</td>' +
        '<td class="num">' + (c.category_median === null ? '—' : fmtMult(c.category_median)) + '</td>' +
        '<td class="num imp">' + fmtMult(c.multiple) + '</td></tr>';
    }).join('');
  }
  function compFor(category) {
    if (!category) return null;
    for (var i = 0; i < R.comparables.length; i++) if (R.comparables[i].category === category) return R.comparables[i];
    return null;
  }
  function renderDetail() {
    var d = $('detail');
    if (!state.detail) { d.hidden = true; d.innerHTML = ''; return; }
    var r = null;
    for (var i = 0; i < R.rows.length; i++) if (R.rows[i].slug === state.detail) { r = R.rows[i]; break; }
    if (!r) { state.detail = null; d.hidden = true; return; }
    var comp = compFor(r.category);
    var base = Math.round(r.tvl_usd * r.comparable_multiple);
    var comps = R.live.filter(function (p) { return p.category === r.category; }).slice(0, 5);
    var steps = farmSteps(r);
    d.innerHTML =
      '<button type="button" class="btn close" id="d-close">✕ Close</button>' +
      '<h2>' + esc(r.name) + '</h2><p class="sub">Rank #' + r.rank + ' · ' + esc(r.slug) + ' · ' + esc(r.category || 'uncategorised') + (isWatch(r) ? ' · watchlist' : ' · early find') + '</p>' +
      '<dl>' +
      '<dt>Implied value</dt><dd><b class="imp">' + fmtMoney(r.implied_value_usd) + '</b></dd>' +
      '<dt>TVL</dt><dd>' + fmtMoney(r.tvl_usd) + '</dd>' +
      '<dt>7d change</dt><dd>' + fmtPct(r.change_7d) + '</dd>' +
      '<dt>Age</dt><dd>' + fmtAge(r.age_days) + (r.listed_at ? ' · since ' + esc(r.listed_at) : '') + '</dd>' +
      '<dt>Chains</dt><dd>' + esc((r.chains || []).join(', ') || '—') + '</dd>' +
      '<dt>Token</dt><dd>records no token</dd>' +
      '</dl>' +
      '<h3>Model breakdown · radar-2</h3><dl>' +
      '<dt>Base (TVL × multiple)</dt><dd>' + fmtMoney(base) + '</dd>' +
      '<dt>Comparable multiple</dt><dd>' + fmtMult(r.comparable_multiple) + '</dd>' +
      '<dt>Category median</dt><dd>' + (comp && comp.category_median !== null ? fmtMult(comp.category_median) : '—') + '</dd>' +
      '<dt>Live comparables</dt><dd>' + (comp ? comp.comparables : 0) + ' in ' + esc(r.category || '—') + '</dd>' +
      '<dt>Growth multiplier</dt><dd>' + r.growth_multiplier.toFixed(2) + '×</dd>' +
      '<dt>Maturity multiplier</dt><dd>' + r.maturity_multiplier.toFixed(2) + '×</dd>' +
      '<dt>Breadth multiplier</dt><dd>' + r.breadth_multiplier.toFixed(2) + '×</dd>' +
      '</dl>' +
      (comps.length ? '<h3>Live comparables in ' + esc(r.category || '—') + '</h3><dl>' + comps.map(function (p) {
        return '<dt>' + esc(p.name) + '</dt><dd>' + fmtMoney(p.mcap_usd) + ' · ' + (p.mcap_tvl === null ? '—' : fmtMult(p.mcap_tvl)) + '</dd>';
      }).join('') + '</dl>' : '') +
      '<h3>Farm plan</h3><ol class="farm">' + steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="hint">Implied value is the entry’s own claim from the snapshot’s figures. It does not predict whether or when a token is issued.</p>';
    d.hidden = false;
    $('d-close').addEventListener('click', function () { state.detail = null; renderDetail(); });
  }
  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
    $('view-board').hidden = tab !== 'board';
    $('view-live').hidden = tab !== 'live';
    $('view-model').hidden = tab !== 'model';
    if (tab === 'live') renderLive();
    if (tab === 'model') renderModel();
  }
  function renderAll() { renderStats(); renderBoard(); renderDetail(); }

  // ---- wire up ----
  var cats = [], chains = [];
  R.rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(); chains.sort();
  $('f-category').innerHTML += cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
  $('f-chain').innerHTML += chains.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
  $('asof').textContent = 'Snapshot ' + R.as_of + ' · ' + R.model_version;
  $('foot-source').textContent = 'Source: ' + R.source + ' · Floor $' + (R.floor_usd / 1e6) + 'M · Global median mcap/TVL ' + fmtMult(R.global_median);

  $('q').addEventListener('input', function (e) { state.q = e.target.value; state.page = 1; renderBoard(); });
  $('f-category').addEventListener('change', function (e) { state.category = e.target.value; state.page = 1; renderBoard(); });
  $('f-chain').addEventListener('change', function (e) { state.chain = e.target.value; state.page = 1; renderBoard(); });
  $('f-tvl').addEventListener('change', function (e) { state.minTvl = Number(e.target.value); state.page = 1; renderBoard(); });
  $('f-scope').addEventListener('change', function (e) { state.scope = e.target.value; state.page = 1; renderBoard(); });
  $('f-sort').addEventListener('change', function (e) { state.sort = e.target.value; state.dir = state.sort === 'name' ? 1 : -1; state.page = 1; renderBoard(); });
  $('f-reset').addEventListener('click', function () {
    state.q = ''; state.category = ''; state.chain = ''; state.minTvl = 0; state.scope = 'all'; state.sort = 'implied'; state.dir = -1; state.page = 1;
    $('q').value = ''; $('f-category').value = ''; $('f-chain').value = ''; $('f-tvl').value = '0'; $('f-scope').value = 'all'; $('f-sort').value = 'implied';
    renderBoard();
  });
  $('prev').addEventListener('click', function () { if (state.page > 1) { state.page--; renderBoard(); } });
  $('next').addEventListener('click', function () { state.page++; renderBoard(); });
  $('rows').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-slug]'); if (tr) { state.detail = tr.dataset.slug; renderDetail(); } });
  document.querySelectorAll('th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.dataset.sort === 'rank' ? 'implied' : th.dataset.sort;
      if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
      $('f-sort').value = key; state.page = 1; renderBoard();
    });
  });
  document.querySelectorAll('.tab').forEach(function (b) { b.addEventListener('click', function () { setTab(b.dataset.tab); }); });

  // ---- URL params (deep links + screenshots) ----
  var params = new URLSearchParams(window.location.search);
  var tab = params.get('tab'); if (tab === 'live' || tab === 'model' || tab === 'board') state.tab = tab;
  var cat = params.get('category') || '';
  var filt = params.get('filter') || '';
  if (!cat && filt.indexOf('category:') === 0) cat = filt.slice('category:'.length);
  if (cat) { state.category = cat; $('f-category').value = cat; }
  var q = params.get('q'); if (q) { state.q = q; $('q').value = q; }
  var scope = params.get('scope'); if (scope === 'watchlist' || scope === 'early' || scope === 'all') { state.scope = scope; $('f-scope').value = scope; }
  var slug = params.get('slug'); if (params.get('view') === 'detail' && slug) state.detail = slug;

  setTab(state.tab);
  renderAll();
})();
