// Sidebar-only wiring: actions, collapsible groups, options. Runs after bot.js (window.tami).
(function () {
  const post = window.tami.post;
  const hero = document.querySelector('.hero');
  const tick = () => {
    if (hero.dataset.fixed === '1') return;
    const h = new Date().getHours();
    hero.dataset.time = h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 18 ? 'afternoon' : 'night';
  };
  tick(); setInterval(() => { tick(); if (typeof updateSay === 'function') updateSay(); }, 60000);
  document.querySelectorAll('[data-run]').forEach((b) =>
    b.addEventListener('click', () => post({ type: 'run', index: Number(b.dataset.run) })));
  document.querySelectorAll('details[data-id]').forEach((d) =>
    d.addEventListener('toggle', () => post({ type: 'toggle', id: d.dataset.id, open: d.open })));
  document.getElementById('mascot').addEventListener('change', (e) => post({ type: 'setOption', key: 'mascot', value: e.target.value }));
  document.addEventListener('click', (e) => {
    const mv = e.target.closest('[data-move]');
    if (mv) { e.preventDefault(); e.stopPropagation(); if (!mv.disabled) post({ type: 'move', ...JSON.parse(mv.dataset.move) }); return; }
    const call = e.target.closest('[data-call]');
    if (call) {
      // Answer closes the call right away. A Claude question stays closed until the next question; an attendance call is recorded by the extension.
      if (attCall) { post({ type: 'callAnswer', kind: attCall.kind }); attCall = null; } else { post({ type: 'answer' }); dismissed = true; }
      applyAttn(); return;
    }
    const head = e.target.closest('[data-sectoggle]');
    if (head && !e.target.closest('.mvs')) {
      const sec = head.closest('section'), folded = sec.classList.toggle('folded');
      head.setAttribute('aria-expanded', String(!folded)); post({ type: 'secToggle', key: sec.dataset.sec, folded }); return;
    }
    if (e.target.closest('#adminBtn')) { post({ type: 'admin' }); return; }
    if (e.target.closest('[data-quick]')) { post({ type: 'editQuick' }); return; }
    const pin = e.target.closest('[data-pin]');
    if (pin) { if (!pin.disabled) post({ type: 'pin', key: pin.dataset.pin }); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) post({ type: ed.dataset.edit });
  });
  const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
  on('mascotAuto', 'change', (e) => post({ type: 'setOption', key: 'mascotAuto', value: e.target.checked }));
  on('aiUsage', 'change', (e) => post({ type: 'setOption', key: 'ai.showUsage', value: e.target.checked }));
  on('aiUsageCard', 'change', (e) => post({ type: 'setOption', key: 'ai.usageOnCard', value: e.target.checked }));
  on('checkoutCard', 'change', (e) => post({ type: 'setOption', key: 'attendance.countdown', value: e.target.checked }));
  on('timeTheme', 'change', (e) => post({ type: 'setOption', key: 'timeTheme', value: e.target.checked }));
  on('workingCode', 'change', (e) => post({ type: 'setOption', key: 'workingCode', value: e.target.checked }));
  on('showSpeech', 'change', (e) => post({ type: 'setOption', key: 'showSpeech', value: e.target.checked }));
  on('aiProvider', 'change', (e) => post({ type: 'setOption', key: 'ai.provider', value: e.target.value }));
  on('aiProgress', 'change', (e) => post({ type: 'setOption', key: 'ai.showProgress', value: e.target.checked }));

  // Run progress: one circle per agent (spinner while running, green check when done), entering with a pop.
  // Click any circle to expand the detail list. Everything is keyed by id and updated in place so spinners never
  // restart; a new question brings new ids, so the previous run's circles and rows are dropped.
  let attCall = null, waiting = false, asker = '', dismissed = false; // attCall: a check-in / check-out call from the extension; waiting: Claude is asking something. Either rings until answered.
  function applyAttn() {
    hero.classList.toggle('attn', !!attCall || (waiting && !dismissed));
    const info = hero.querySelector('.callinfo'); if (!info) return;
    info.querySelector('b').textContent = attCall ? attCall.name : 'Claude';
    info.querySelector('.ct').textContent = attCall ? attCall.text : (asker && asker !== 'Claude' ? asker + ' needs your answer' : 'needs your answer');
  }
  window.addEventListener('message', (e) => { if (e.data.type === 'call') { attCall = e.data.call; applyAttn(); } });
 // "Not now" hides the call until the next question
  const root = document.getElementById('agents');
  if (root) root.querySelector('.rings').addEventListener('click', (e) => { if (e.target.closest('.ring:not(.idle)')) root.classList.toggle('open'); });
  // Flying code: symbols rush out of the robot toward the viewer in real CSS 3D. Built once; CSS shows them only while working.
  // "back" symbols pass behind the robot, "front" ones pass in front at the edges (bigger, softer), which sells the depth.
  (function buildCode3d() {
    const stage = document.getElementById('stage'), art = document.getElementById('work'); if (!stage || !art) return;
    const GLYPHS = ['</>', '{ }', '( )', ';', '=>', '[ ]', '0x1F', '&&', '#', '//', 'fn', '<T>', '!=', '$'];
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const layer = (cls, n, more, front) => {
      const el = document.createElement('div'); el.className = 'code3d ' + cls; el.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < n + more; i++) {
        const g = document.createElement('i'), th = (i / (n + more)) * Math.PI * 2 + rnd() * 0.5, far = front ? 0.95 + rnd() * 0.25 : 0.7 + rnd() * 0.5;
        g.textContent = GLYPHS[Math.floor(rnd() * GLYPHS.length)];
        g.style.setProperty('--dx', Math.round(Math.cos(th) * 150 * far) + 'px'); g.style.setProperty('--dy', Math.round(Math.sin(th) * 88 * far) + 'px');
        g.style.setProperty('--t', (front ? 2.6 + rnd() * 1.2 : 3.2 + rnd() * 1.6).toFixed(2) + 's'); g.style.setProperty('--d', (-rnd() * 4).toFixed(2) + 's');
        g.style.setProperty('--s', (front ? 15 + rnd() * 5 : 10 + rnd() * 5).toFixed(0) + 'px'); g.style.setProperty('--c', ['#38bdf8', '#7dd3fc', '#93e2ff', '#bae6fd'][Math.floor(rnd() * 4)]);
        if (i >= n) g.className = 'more';
        el.appendChild(g);
      }
      return el;
    };
    stage.insertBefore(layer('back', 10, 4, false), art); stage.insertBefore(layer('front', 4, 2, true), art.nextSibling);
  })();

  // Tami talks: one chat bubble under the mascot. The line comes from what is really happening, and a change arrives as a typed message.
  const say = hero.querySelector('.say'), msgEl = say && say.querySelector('.msg');
  const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let crewCount = 0, finished = false, hint = '', hintTimer = 0, shown = '', sayToken = 0;
  function greeting() {
    const h = new Date().getHours();
    return h < 5 ? "Still up? I'm here." : h < 12 ? "Morning! What's first?" : h < 18 ? "Afternoon! What's next?" : h < 22 ? "Evening! What's next?" : "Late one. I'm here.";
  }
  function line() {
    if (hint) return hint;
    if (mood === 'team') return crewCount + (crewCount === 1 ? ' agent is' : ' agents are') + ' on it.';
    if (mood === 'working') return 'On it.';
    if (mood === 'done') return 'Done. Have a look.';
    return finished ? 'Ready for the next one.' : greeting();
  }
  function updateSay(instant) {
    if (!msgEl) return;
    const t = line(); if (t === shown) return; shown = t; say.title = t; const token = ++sayToken;
    if (instant || calm) { msgEl.textContent = t; say.classList.remove('typing'); return; }
    say.classList.add('typing'); msgEl.textContent = '';                        // three dots, then the words
    setTimeout(() => {
      if (token !== sayToken) return;
      let i = 0; const iv = setInterval(() => {
        if (token !== sayToken) return clearInterval(iv);
        msgEl.textContent = t.slice(0, ++i);
        if (i >= t.length) { clearInterval(iv); say.classList.remove('typing'); }
      }, 24);
    }, 380);
  }
  const mascotEl = document.getElementById('bot');
  // Five quick taps on the mascot open the admin PIN box. Taps more than 1.5 s apart start over. Does nothing once signed in.
  let taps = 0, lastTap = 0;
  if (mascotEl) mascotEl.addEventListener('click', () => {
    const now = Date.now(); taps = now - lastTap < 1500 ? taps + 1 : 1; lastTap = now;
    if (taps >= 5) { taps = 0; if (hero.dataset.admin !== '1') post({ type: 'adminSignIn' }); }
  });
  if (mascotEl) mascotEl.addEventListener('click', () => { hint = "Hi, I'm Tami."; updateSay(); clearTimeout(hintTimer); hintTimer = setTimeout(() => { hint = ''; updateSay(); }, 4000); });

  // Mascot mood, from the run: idle | working (main thread busy) | team (agents running) | done (just finished) | waiting.
  // While working or running agents, the card swaps the mascot for the working art and rings it in blue.
  let mood = 'idle', doneTimer = 0;
  function setMood(m) {
    if (m === mood) return;
    mood = m; hero.dataset.mood = m; clearTimeout(doneTimer);
    if (m === 'done') { finished = true; doneTimer = setTimeout(() => setMood('idle'), 3500); }
    updateSay();
  }
  updateSay(true);
  function draw(list, noWorkspace) {
    if (!root) return;
    {
      const busy = list.some((a) => a.status === 'running'), crew = list.some((a) => a.type !== 'main' && a.status === 'running');
      crewCount = list.filter((a) => a.type !== 'main' && a.status === 'running').length;
      const asking = list.some((a) => a.status === 'waiting');
      setMood(asking ? 'waiting' : crew ? 'team' : busy ? 'working' : (mood === 'working' || mood === 'team') && list.length ? 'done' : mood === 'done' ? 'done' : 'idle');
      updateSay();
    }
    const w = list.find((a) => a.status === 'waiting'); waiting = !!w; asker = w ? w.name : ''; if (!waiting) dismissed = false;
    applyAttn();
    const rings = root.querySelector('.rings'), box = root.querySelector('.alist');
    const keepR = new Set(list.map((a) => 'r-' + a.id));
    rings.querySelectorAll('.ring').forEach((n) => { if (!keepR.has(n.id)) n.remove(); });
    if (!list.length) {
      root.classList.remove('open');
      if (!document.getElementById('r-idle')) {
        const r = document.createElement('button'); r.id = 'r-idle'; r.type = 'button'; r.className = 'ring idle';
        r.innerHTML = '<i class="codicon codicon-check"></i>'; rings.appendChild(r);
      }
      document.getElementById('r-idle').title = noWorkspace ? 'Open a folder to follow Claude Code' : 'Waiting for Claude Code activity';
      box.querySelectorAll('.agent').forEach((n) => n.remove());
      return;
    }
    const idle = document.getElementById('r-idle'); if (idle) idle.remove();
    let fresh = 0;
    list.forEach((a, i) => {
      let r = document.getElementById('r-' + a.id);
      if (!r) {
        r = document.createElement('button'); r.id = 'r-' + a.id; r.type = 'button';
        r.innerHTML = '<i class="codicon codicon-check"></i>';
        r.style.animationDelay = (fresh++ * 70) + 'ms';
        r.addEventListener('animationend', (e) => { if (e.target === r) r.style.animationDelay = ''; });
      }
      r.className = 'ring ' + a.status;
      r.firstChild.className = 'codicon codicon-' + (a.status === 'waiting' ? 'question' : 'check');
      r.title = a.name + ' - ' + (a.status === 'done' ? 'Done' : a.activity);
      if (rings.children[i] !== r) rings.insertBefore(r, rings.children[i] || null);
    });
    const keep = new Set(list.map((a) => 'a-' + a.id));
    box.querySelectorAll('.agent').forEach((n) => { if (!keep.has(n.id)) n.remove(); });
    list.forEach((a, i) => {
      let el = document.getElementById('a-' + a.id);
      if (!el) {
        el = document.createElement('div'); el.id = 'a-' + a.id;
        el.innerHTML = '<div class="ahead"><span class="st"><i class="codicon"></i></span><span class="aname"></span><span class="ameta"></span></div><div class="abar"><span></span></div><div class="asub"><span></span><span></span></div>';
      }
      el.className = 'agent ' + a.status;
      el.querySelector('.st .codicon').className = 'codicon ' + (a.status === 'running' ? 'codicon-loading codicon-modifier-spin' : a.status === 'waiting' ? 'codicon-question' : 'codicon-check');
      el.querySelector('.aname').textContent = a.name;
      el.querySelector('.ameta').textContent = a.status === 'done' ? 'Done' : a.activity;
      const sub = el.querySelectorAll('.asub span'); sub[0].textContent = a.type; sub[1].textContent = a.steps >= 0 ? a.steps + (a.steps === 1 ? ' step' : ' steps') : '';
      if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null);
    });
  }
  // Plan usage: the extension sends the latest numbers every 2 s; the countdowns tick locally every second.
  const WINDOWS = [['five_hour', '5h', 5 * 3600e3], ['seven_day', '7d', 7 * 86400e3]];
  let usage = null, note = '', built = '';
  const sev = (p) => (p >= 85 ? 'bad' : p >= 60 ? 'warn' : 'ok');
  const two = (n) => String(n).padStart(2, '0');
  function left(ms) {
    if (ms <= 0) return 'now';
    const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return d ? d + 'd ' + h + 'h' : h ? h + 'h ' + two(m) + 'm' : m + 'm ' + two(s % 60) + 's';
  }
  // Compact form for the small circle: 6d2h, 2h32m, 47:12
  function short(ms) {
    if (ms <= 0) return 'due';
    const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return d ? d + 'd' + h + 'h' : h ? h + 'h' + two(m) + 'm' : two(m) + ':' + two(s % 60);
  }
  function at(t) {
    const d = new Date(t), hm = two(d.getHours()) + ':' + two(d.getMinutes());
    return d.toDateString() === new Date().toDateString() ? hm : d.toLocaleDateString([], { weekday: 'short' }) + ' ' + hm;
  }
  function paintUsage() {
    const box = document.getElementById('usage'), badge = document.getElementById('ubadge'), now = Date.now();
    const wins = usage ? WINDOWS.filter(([k]) => usage[k]) : [];
    if (badge) {
      if (!wins.length) badge.hidden = true;
      else {
        const [k, label, span] = wins[0], w = usage[k], over = now >= w.resetsAt;
        badge.hidden = false; badge.className = 'ubadge ' + sev(w.pct) + (over ? ' stale' : '');
        badge.style.setProperty('--p', Math.min(100, w.pct));
        badge.innerHTML = '<b>' + Math.round(w.pct) + '%</b><span>' + short(w.resetsAt - now) + '</span>';
        badge.title = wins.map(([kk, l]) => l + ': ' + Math.round(usage[kk].pct) + '% used, resets ' + at(usage[kk].resetsAt)).join('\n');
      }
    }
    if (!box) return;
    if (!wins.length) {
      built = '';
      box.textContent = ''; const em = document.createElement('div'); em.className = 'uempty'; em.textContent = note || 'Reading usage…'; box.appendChild(em);
      return;
    }
    const sig = wins.map((w) => w[0]).join();
    if (built !== sig) {
      built = sig;
      box.innerHTML = wins.map(([k, label]) => '<div class="uw" data-k="' + k + '"><div class="uh"><b>' + label + '</b><span class="up"></span></div>' +
        '<div class="ubar used"><span></span></div><div class="ubar time"><span></span></div><div class="ur"><span></span><span></span></div></div>').join('');
    }
    wins.forEach(([k, , span]) => {
      const w = usage[k], el = box.querySelector('[data-k="' + k + '"]'), over = now >= w.resetsAt;
      const elapsed = Math.max(0, Math.min(100, ((now - (w.resetsAt - span)) / span) * 100));
      el.className = 'uw ' + sev(w.pct) + (over ? ' stale' : '');
      el.querySelector('.up').textContent = Math.round(w.pct) + '% used';
      el.querySelector('.used span').style.width = Math.min(100, w.pct) + '%';
      el.querySelector('.time span').style.width = (over ? 100 : elapsed) + '%';
      const ur = el.querySelectorAll('.ur span');
      ur[0].textContent = over ? 'Reset, waiting for new numbers' : 'Resets in ' + left(w.resetsAt - now); ur[1].textContent = over ? '' : at(w.resetsAt);
      el.querySelector('.ubar.time').title = Math.round(elapsed) + '% of this window has passed';
    });
  }
  // Check-out badge: 10 s of countdown, then 10 s showing when you checked in, and so on. Once check-out time arrives it stays on "Now".
  // The phase is counted in one-second ticks since the badge appeared, so it always starts on the countdown.
  let outAt = null, outClock = '', inClock = '', badgeTicks = 0, shownPhase = -1;
  const PHASE_S = 10;
  function paintCheckout() {
    const el = document.getElementById('cbadge'); if (!el) return;
    if (!outAt) { el.hidden = true; shownPhase = -1; return; }
    const ms = outAt - Date.now(), m = Math.ceil(ms / 60000), due = ms <= 0;
    const phase = !due && inClock && Math.floor(badgeTicks / PHASE_S) % 2 === 1 ? 1 : 0;
    el.hidden = false; el.classList.toggle('due', due);
    el.querySelector('b').textContent = phase ? inClock : due ? 'Now' : m >= 60 ? Math.floor(m / 60) + 'h ' + two(m % 60) + 'm' : m + ' min';
    el.querySelector('span').textContent = phase ? 'checked in' : due ? 'time to check out' : 'to check out';
    el.title = (inClock ? 'Checked in at ' + inClock + '. ' : '') + 'Check out at ' + outClock;
    if (phase !== shownPhase) { if (shownPhase !== -1) { el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); } shownPhase = phase; }
  }
  window.addEventListener('message', (e) => {
    if (e.data.type !== 'checkout') return;
    if (!outAt && e.data.at) badgeTicks = 0;                         // just checked in: start on the countdown
    outAt = e.data.at; outClock = e.data.clock || ''; inClock = e.data.inClock || ''; paintCheckout();
  });
  setInterval(() => { if (outAt) badgeTicks++; paintCheckout(); }, 1000);
  setInterval(paintUsage, 1000);
  window.addEventListener('message', (e) => { if (e.data.type === 'usage') { usage = e.data.usage; note = e.data.note || ''; paintUsage(); } });
  window.addEventListener('message', (e) => { if (e.data.type === 'agents') draw(e.data.agents, e.data.noWorkspace); });
  post({ type: 'ready' });
})();

document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-sectoggle]')) { e.preventDefault(); e.target.click(); } });
