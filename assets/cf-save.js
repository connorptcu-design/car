/* Carry Forward: per-user saved tool values.
 *
 * Saves to /api/state (Cloudflare D1, keyed to the signed-in Access email).
 * If the API is unreachable (local preview, storage not set up yet), falls back to
 * this browser only, and says so in the status pill.
 *
 * Two ways to use it:
 *   CFSave.connect({ tool: 'capacity', get: () => state, set: s => {...} })
 *       for tools written with explicit state (tools/capacity.html).
 *   CFSave.autoDOM('readiness', document.getElementById('root'))
 *       for the existing compiled React tools: it remembers every slider, select,
 *       checkbox and text field by its label and restores them when they render.
 */
(function () {
  'use strict';
  var API = '/api/state';
  var DEBOUNCE = 1200;

  function lsKey(tool) { return 'cf_tool_' + tool; }
  function lsGet(tool) { try { var v = localStorage.getItem(lsKey(tool)); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(tool, data) { try { localStorage.setItem(lsKey(tool), JSON.stringify(data)); } catch (e) {} }
  function lsDel(tool) { try { localStorage.removeItem(lsKey(tool)); } catch (e) {} }

  function fmtTime(iso) {
    try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
  }

  // ---------- status pill ----------
  var pill, pillText, resetBtn;
  function ensurePill(onReset) {
    if (pill) return;
    pill = document.createElement('div');
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    pill.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:60;background:#16292E;color:#EAEFEA;' +
      'font:12.5px ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;padding:8px 12px;border-radius:3px;' +
      'display:flex;gap:12px;align-items:center;box-shadow:0 2px 10px rgba(0,0,0,.15);max-width:calc(100vw - 28px)';
    pillText = document.createElement('span');
    pillText.textContent = 'Loading your saved values…';
    resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.textContent = 'Reset';
    resetBtn.title = 'Clear your saved values for this tool';
    resetBtn.style.cssText = 'background:transparent;color:#EAEFEA;border:1px solid rgba(234,239,234,.4);border-radius:2px;' +
      'font:inherit;padding:3px 9px;cursor:pointer';
    resetBtn.addEventListener('click', function () {
      if (window.confirm('Clear your saved values for this tool and start from the defaults?')) onReset();
    });
    pill.appendChild(pillText);
    pill.appendChild(resetBtn);
    (document.body || document.documentElement).appendChild(pill);
  }
  function status(t) { if (pillText) pillText.textContent = t; }

  // ---------- transport ----------
  var mode = 'account'; // or 'device'
  var email = null;

  function apiLoad(tool) {
    return fetch(API + '?tool=' + encodeURIComponent(tool), { credentials: 'same-origin', headers: { accept: 'application/json' } })
      .then(function (r) {
        var ct = r.headers.get('content-type') || '';
        if (!r.ok || ct.indexOf('application/json') === -1) throw new Error('api ' + r.status);
        return r.json();
      });
  }
  function apiSave(tool, data) {
    return fetch(API + '?tool=' + encodeURIComponent(tool), {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ data: data })
    }).then(function (r) { if (!r.ok) throw new Error('api ' + r.status); return r.json(); });
  }
  function apiDelete(tool) {
    return fetch(API + '?tool=' + encodeURIComponent(tool), { method: 'DELETE', credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('api ' + r.status); });
  }

  function load(tool) {
    return apiLoad(tool).then(function (res) {
      mode = 'account'; email = res.email || null;
      return { data: res.data, updated_at: res.updated_at };
    }).catch(function () {
      mode = 'device';
      return { data: lsGet(tool), updated_at: null };
    });
  }

  function makeSaver(tool) {
    var timer = null, pending = null;
    function flush() {
      if (pending === null) return;
      var data = pending; pending = null;
      if (mode === 'device') { lsSet(tool, data); status('Saved on this device only'); return; }
      status('Saving…');
      apiSave(tool, data).then(function (res) {
        status('Saved to ' + (email || 'your account') + ' · ' + fmtTime(res.updated_at));
      }).catch(function () {
        lsSet(tool, data);
        status('Could not reach your account. Kept on this device; will retry on your next change.');
      });
    }
    window.addEventListener('pagehide', flush);
    return function (data) {
      pending = data;
      status('Unsaved changes…');
      clearTimeout(timer);
      timer = setTimeout(flush, DEBOUNCE);
    };
  }

  function reset(tool) {
    lsDel(tool);
    var done = function () { location.reload(); };
    if (mode === 'account') apiDelete(tool).then(done, done); else done();
  }

  function loadedMessage(res) {
    if (mode === 'device') return res.data ? 'Restored from this device (not signed in to storage)' : 'Saving on this device only';
    return res.data ? 'Restored your values · last saved ' + fmtTime(res.updated_at) : 'Your changes save to ' + (email || 'your account');
  }

  // ---------- explicit state ----------
  function connect(opts) {
    var tool = opts.tool;
    ensurePill(function () { reset(tool); });
    var save = makeSaver(tool);
    return load(tool).then(function (res) {
      if (res.data && typeof opts.set === 'function') opts.set(res.data);
      status(loadedMessage(res));
      return { changed: function () { save(opts.get()); } };
    });
  }

  // ---------- automatic, for the compiled React tools ----------
  function keyFor(el, root) {
    var base = el.getAttribute('aria-label') || el.getAttribute('name') || el.id;
    if (!base) {
      var lab = el.closest('label');
      if (lab) base = lab.textContent.trim().slice(0, 60);
    }
    if (!base) base = (el.type || el.tagName).toLowerCase();
    var same = root.querySelectorAll('input,select,textarea');
    var n = 0;
    for (var i = 0; i < same.length; i++) {
      if (same[i] === el) break;
      var b = same[i].getAttribute('aria-label') || same[i].getAttribute('name') || same[i].id ||
        ((same[i].closest('label') || {}).textContent || '').trim().slice(0, 60) || (same[i].type || same[i].tagName).toLowerCase();
      if (b === base) n++;
    }
    return base + '#' + n;
  }
  function readEl(el) {
    if (el.type === 'checkbox') return !!el.checked;
    if (el.type === 'radio') return el.checked ? el.value : undefined;
    return el.value;
  }
  function writeEl(el, v) {
    if (el.type === 'checkbox') { if (!!el.checked !== !!v) el.click(); return; }
    if (el.type === 'radio') { if (v === el.value && !el.checked) el.click(); return; }
    if (el.value === String(v)) return;
    var proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype :
      el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function skip(el) {
    var t = (el.type || '').toLowerCase();
    return t === 'file' || t === 'password' || t === 'hidden' || t === 'submit' || t === 'button' || el.hasAttribute('data-nosave');
  }

  function autoDOM(tool, root) {
    root = root || document.body;
    var state = {};
    var applying = false;
    var seen = new WeakSet();
    ensurePill(function () { reset(tool); });
    var save = makeSaver(tool);

    function applyTo(nodes) {
      applying = true;
      try {
        for (var i = 0; i < nodes.length; i++) {
          var el = nodes[i];
          if (seen.has(el) || skip(el)) continue;
          seen.add(el);
          var k = keyFor(el, root);
          if (Object.prototype.hasOwnProperty.call(state, k)) writeEl(el, state[k]);
        }
      } finally { applying = false; }
    }

    function onChange(e) {
      var el = e.target;
      if (applying || !el || !root.contains(el) || skip(el)) return;
      if (!/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
      var v = readEl(el);
      if (v === undefined) return;
      state[keyFor(el, root)] = v;
      save({ v: 1, fields: state });
    }

    return load(tool).then(function (res) {
      if (res.data && res.data.fields) state = res.data.fields;
      status(loadedMessage(res));
      root.addEventListener('input', onChange, true);
      root.addEventListener('change', onChange, true);
      var scan = function () { applyTo(root.querySelectorAll('input,select,textarea')); };
      scan();
      // Tabs and panels render later: restore their fields as they appear.
      var mo = new MutationObserver(function () { scan(); });
      mo.observe(root, { childList: true, subtree: true });
    });
  }

  window.CFSave = { connect: connect, autoDOM: autoDOM };
})();
