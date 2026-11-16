// Debug mode of the Tami sidebar: toolbar, call stack, locals + watch paths, breakpoints. Runs after bot.js (window.tami).
// Messages to the extension are prefixed "dbg." so they never clash with the normal sidebar's.
(function () {
  const send = (m) => window.tami.post({ ...m, type: 'dbg.' + m.type }), $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const refs = new Map(); // variablesReference -> <ul> waiting for its children
  let state = { session: null, paused: false, configs: [], paths: [] }, threadId;

  // ---- variable tree (lazy)
  const node = (v) => !v.ref
    ? `<li><span class="n">${esc(v.name)}</span> <span class="v">${esc(v.value)}</span></li>`
    : `<li><details data-ref="${v.ref}"><summary><span class="n">${esc(v.name)}</span> <span class="v">${esc(v.value)}</span></summary><ul class="tree"></ul></details></li>`;
  const load = (d) => {
    if (!d.dataset.ref || d.dataset.loaded) return;
    d.dataset.loaded = '1';
    const ul = d.querySelector(':scope > ul');
    ul.innerHTML = '<li class="muted">…</li>';
    refs.set(Number(d.dataset.ref), ul);
    send({ type: 'expand', ref: Number(d.dataset.ref) });
  };
  document.addEventListener('toggle', (e) => { if (e.target.open) load(e.target); }, true);

  // ---- toolbar, launch, exit
  $('exit').addEventListener('click', () => send({ type: 'exit' }));
  document.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => send({ type: 'cmd', id: b.dataset.cmd })));
  $('start').addEventListener('click', () => { const o = $('cfg').selectedOptions[0]; if (o) send({ type: 'start', folder: o.dataset.folder, name: o.value }); });

  // ---- call stack
  $('threads').addEventListener('change', (e) => send({ type: 'thread', id: Number(e.target.value) }));
  $('frames').addEventListener('click', (e) => { const li = e.target.closest('li[data-id]'); if (li) send({ type: 'frame', id: Number(li.dataset.id), threadId }); });

  // ---- breakpoints
  $('bps').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]'); if (!li) return;
    const i = Number(li.dataset.i), a = e.target.closest('[data-act]');
    send({ type: a ? (a.dataset.act === 'rm' ? 'bpRemove' : 'bpToggle') : 'bpGo', i });
  });

  // ---- watch paths
  const row = (p) => {
    const d = document.createElement('details');
    d.className = 'path'; d.dataset.path = p;
    d.innerHTML = `<summary><code class="n">${esc(p)}</code><span class="v"></span><span class="t"></span>` +
      `<span class="act"><button data-act="eval" title="Re-evaluate"><i class="codicon codicon-refresh"></i></button>` +
      `<button data-act="json" title="Copy as JSON"><i class="codicon codicon-json"></i></button>` +
      `<button data-act="rm" title="Remove"><i class="codicon codicon-close"></i></button></span></summary><ul class="tree"></ul>`;
    return d;
  };
  const syncRows = () => {
    const box = $('paths'), have = new Set(state.paths);
    box.querySelectorAll('details.path').forEach((d) => { if (!have.has(d.dataset.path)) d.remove(); });
    const seen = new Set([...box.querySelectorAll('details.path')].map((d) => d.dataset.path));
    state.paths.slice().reverse().forEach((p) => { if (!seen.has(p)) box.prepend(row(p)); });
  };
  $('paths').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const path = b.closest('details.path').dataset.path;
    send({ type: b.dataset.act === 'rm' ? 'removePath' : b.dataset.act, path });
  });
  let timer;
  $('path').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => send({ type: 'complete', text: e.target.value }), 200); });
  $('path').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const p = e.target.value.trim();
    if (p) { send({ type: 'addPath', path: p }); e.target.value = ''; $('ac').innerHTML = ''; }
  });

  const paint = () => {
    const sel = $('cfg'), cur = sel.value;
    sel.innerHTML = state.configs.map((c) => `<option value="${esc(c.name)}" data-folder="${esc(c.folder)}">${esc(c.name)}</option>`).join('');
    if (cur) sel.value = cur;
    $('start').disabled = !state.configs.length;
    document.querySelectorAll('[data-cmd]').forEach((b) => { b.disabled = !state.session; });
    const s = $('sess');
    s.textContent = state.session ? `${state.session.name} · ${state.paused ? 'paused' : 'running'}` : 'No debug session';
    s.classList.toggle('paused', !!state.paused);
    syncRows();
  };

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type === 'state') { state = m; paint(); }
    else if (m.type === 'stack') {
      threadId = m.threadId;
      $('threads').innerHTML = m.threads.map((t) => `<option value="${t.id}"${t.id === m.threadId ? ' selected' : ''}>${esc(t.name || 'thread ' + t.id)}</option>`).join('');
      $('threads').hidden = m.threads.length < 2;
      $('frames').innerHTML = m.frames.map((f) => `<li data-id="${f.id}" class="${f.id === m.frameId ? 'sel' : ''}"><span class="n">${esc(f.name)}</span> <span class="t">${esc(f.file)}${f.line ? ':' + f.line : ''}</span></li>`).join('')
        || '<li class="muted">Not paused</li>';
    }
    else if (m.type === 'locals') {
      $('locals').innerHTML = m.scopes.map((s, i) => `<details class="scope" data-ref="${s.ref}"${i === 0 ? ' open' : ''}><summary><b>${esc(s.name)}</b></summary><ul class="tree"></ul></details>`).join('');
      const first = $('locals').querySelector('details[open]'); if (first) load(first);
    }
    else if (m.type === 'bps') {
      $('bps').innerHTML = m.items.map((b) => `<li data-i="${b.i}" class="${b.enabled ? '' : 'off'}"><span class="n">${esc(b.label)}${b.line ? ':' + b.line : ''}</span>${b.cond ? ` <span class="t">if ${esc(b.cond)}</span>` : ''}` +
        `<span class="act"><button data-act="tg" title="${b.enabled ? 'Disable' : 'Enable'}"><i class="codicon codicon-${b.enabled ? 'circle-filled' : 'circle-outline'}"></i></button><button data-act="rm" title="Remove"><i class="codicon codicon-close"></i></button></span></li>`).join('')
        || '<li class="muted">No breakpoints</li>';
    }
    else if (m.type === 'completions') { $('ac').innerHTML = m.items.map((i) => `<option value="${esc(i)}">`).join(''); }
    else if (m.type === 'children') { const ul = refs.get(m.ref); if (ul) { refs.delete(m.ref); ul.innerHTML = m.vars.map(node).join('') || '<li class="muted">(empty)</li>'; } }
    else if (m.type === 'value') {
      const d = document.querySelector(`details.path[data-path="${CSS.escape(m.path)}"]`);
      if (!d) return;
      const v = d.querySelector(':scope > summary > .v'), t = d.querySelector(':scope > summary > .t');
      v.textContent = m.error || m.result; v.classList.toggle('err', !!m.error); t.textContent = m.kind || '';
      d.dataset.ref = m.ref || ''; delete d.dataset.loaded; d.classList.toggle('leaf', !m.ref);
      d.querySelector(':scope > ul').innerHTML = '';
      if (d.open) load(d);
    }
  });
  send({ type: 'ready' });
})();
