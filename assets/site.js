(function () {
  'use strict';

  /* ---------- access gate ---------- */
  (function () {
    var HASH = 'e8587be3e9a332cb0bb6821907eed6f0e151c8deb7ce1864a04949f227a81c61';
    var KEY = 'cf_auth';
    try {
      if (sessionStorage.getItem(KEY) === '1') {
        document.documentElement.classList.remove('gate-locked');
        return;
      }
    } catch (e) {}
    if (!document.documentElement.classList.contains('gate-locked')) return;

    function sha256Hex(str) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return b.toString(16).padStart(2, '0');
        }).join('');
      });
    }

    var overlay = document.createElement('div');
    overlay.className = 'gate-overlay';
    overlay.innerHTML =
      '<div class="gate-box">' +
        '<h1>Private preview</h1>' +
        '<p>This site is not public yet. Enter the password to continue.</p>' +
        '<form id="gateForm">' +
          '<input type="password" id="gatePw" autocomplete="off" autofocus />' +
          '<button class="btn" type="submit">Enter</button>' +
          '<div class="err" id="gateErr">Wrong password.</div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(overlay);

    var form = overlay.querySelector('#gateForm');
    var pw = overlay.querySelector('#gatePw');
    var err = overlay.querySelector('#gateErr');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      sha256Hex(pw.value).then(function (hex) {
        if (hex === HASH) {
          try { sessionStorage.setItem(KEY, '1'); } catch (e2) {}
          document.documentElement.classList.remove('gate-locked');
          overlay.remove();
        } else {
          err.style.display = 'block';
          pw.value = '';
          pw.focus();
        }
      });
    });
  })();

  /* ---------- helpers ---------- */
  function money(v) {
    if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(Math.abs(v) >= 1e7 ? 1 : 2) + 'M';
    if (Math.abs(v) >= 1e3) return '$' + Math.round(v / 1e3) + 'k';
    return '$' + Math.round(v);
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function $(id) { return document.getElementById(id); }
  function set(id, text) { var e = $(id); if (e) e.textContent = text; }

  function commas(n) {
    n = Math.round(n);
    var neg = n < 0;
    n = Math.abs(n);
    var s = String(n), out = '';
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) out += ',';
      out += s[i];
    }
    return (neg ? '-' : '') + out;
  }

  function parseMessyNumber(str) {
    if (str == null) return NaN;
    var s = String(str).trim();
    if (!s) return NaN;
    s = s.replace(/[$,%\s]/g, '');
    var m = s.match(/^(-?\d*\.?\d+)([kKmMbB])?$/);
    if (!m) return NaN;
    var n = parseFloat(m[1]);
    if (isNaN(n)) return NaN;
    var suf = m[2] ? m[2].toLowerCase() : '';
    if (suf === 'k') n *= 1e3;
    else if (suf === 'm') n *= 1e6;
    else if (suf === 'b') n *= 1e9;
    return n;
  }

  /* pairs a slider with a typed-number box: box mirrors slider on drag,
     and commits back to the slider (clamped) on Enter or blur */
  function bindNumberBox(slider, box, opts) {
    if (!slider || !box) return;
    var scale = (opts && opts.scale) || 1;
    var decimals = (opts && opts.decimals) || 0;

    function display(raw) {
      return decimals > 0 ? raw.toFixed(decimals) : commas(raw);
    }
    function sync() {
      box.value = display((+slider.value) * scale);
    }
    function commit() {
      var parsed = parseMessyNumber(box.value);
      if (isNaN(parsed)) { sync(); return; }
      var sliderVal = clamp(parsed / scale, +slider.min, +slider.max);
      slider.value = sliderVal;
      sync();
      slider.dispatchEvent(new Event('input'));
      slider.dispatchEvent(new Event('change'));
    }

    slider.addEventListener('input', sync);
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); commit(); box.blur(); }
    });
    box.addEventListener('blur', commit);

    sync();
  }

  /* ---------- year ---------- */
  var yr = $('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  /* ---------- mobile nav ---------- */
  var burger = $('burger'), links = $('links');
  if (burger && links) {
    burger.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    links.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        links.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- mark current page ---------- */
  var here = location.pathname.split('/').pop() || 'index.html';
  Array.prototype.forEach.call(document.querySelectorAll('.links a'), function (a) {
    if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
  });

  /* ---------- practice estimate ---------- */
  (function () {
    var ids = ['rev', 'fee', 'age', 'grow', 'team', 'struct'];
    var el = {}, ok = true;
    ids.forEach(function (i) { el[i] = $(i); if (!el[i]) ok = false; });
    if (!ok) return;

    function calc() {
      var rev = +el.rev.value * 1000;
      var fee = +el.fee.value, age = +el.age.value, grow = +el.grow.value;
      var team = +el.team.value, struct = +el.struct.value;

      var base;
      if (rev < 300000) base = 2.0;
      else if (rev < 750000) base = 2.3;
      else if (rev < 1500000) base = 2.6;
      else if (rev < 3000000) base = 2.9;
      else if (rev < 8000000) base = 3.2;
      else if (rev < 15000000) base = 3.4;
      else base = 3.6;

      var mixAdj = clamp((fee - 65) * 0.014, -0.55, 0.55);
      var ageAdj = clamp((61 - age) * 0.035, -0.50, 0.50);
      var grwAdj = clamp((grow - 5) * 0.055, -0.45, 0.45);

      var mult = clamp((base + mixAdj + ageAdj + grwAdj + team) * (struct / 0.86), 1.2, 5.0);
      var val = rev * mult;
      var prepMult = clamp((base + mixAdj + ageAdj + grwAdj + 0.35) * (1.0 / 0.86), 1.2, 5.6);
      var prepared = rev * prepMult;
      var lonely = team < 0 ? 0.72 : team === 0 ? 0.55 : 0.30;

      set('revOut', money(rev));
      set('feeOut', fee + '%');
      set('ageOut', age);
      set('growOut', grow + '%');
      set('range', money(val * 0.89) + ' to ' + money(val * 1.11));
      var mo = $('multOut'); if (mo) mo.innerHTML = mult.toFixed(2) + '&times;';
      set('keyPerson', money(rev * lonely));
      set('prepared', money(prepared));
      var d = prepared - val;
      set('delta', (d >= 0 ? '+' : '') + money(d));

      var bfn = $('bigFirmNote');
      if (bfn) bfn.style.display = rev >= 5000000 ? 'block' : 'none';

      var vb = $('verdict'), vt = $('verdictText');
      if (!vb || !vt) return;
      if (team < 0) {
        vb.textContent = 'One person holds this firm together';
        vt.textContent = 'Every input above matters less than this one. A buyer prices a practice on what survives the founder, and right now the honest answer is not much. Moving relationships takes eighteen to thirty-six months, which is why it is the first thing to work on and the last thing anyone starts.';
      } else if (fee < 55) {
        vb.textContent = 'Too much of this revenue has to be re-earned';
        vt.textContent = 'Recurring revenue is what a buyer underwrites. Everything else is treated as a bet on your continued effort and priced accordingly. This is usually the second-fastest lever available.';
      } else if (age > 70) {
        vb.textContent = 'The book is ageing faster than the firm';
        vt.textContent = 'A buyer models the assets still there in ten years, not the ones on today\u2019s statement. Households drawing down are worth a fraction of households still accumulating, and no amount of service quality changes that arithmetic.';
      } else if (grow < 2) {
        vb.textContent = 'Flat books get bought as run-off';
        vt.textContent = 'Growing books get bought as businesses, and the gap between those two descriptions is most of the multiple. Growth that cannot be attributed to a repeatable source earns no credit at all.';
      } else {
        vb.textContent = 'This prices well for its size';
        vt.textContent = 'The question here is probably timing and structure rather than repair. Which path you take, what it nets after tax, and whether an internal buyer could finance it are the live questions.';
      }
    }

    ids.forEach(function (i) {
      el[i].addEventListener('input', calc);
      el[i].addEventListener('change', calc);
    });

    bindNumberBox(el.rev, $('revBox'), { scale: 1000, decimals: 0 });
    bindNumberBox(el.fee, $('feeBox'), { scale: 1, decimals: 0 });
    bindNumberBox(el.age, $('ageBox'), { scale: 1, decimals: 0 });
    bindNumberBox(el.grow, $('growBox'), { scale: 1, decimals: 0 });

    calc();
  })();

  /* ---------- buy-in calculator ---------- */
  (function () {
    var ids = ['bProfit', 'bMult', 'bStake', 'bDisc', 'bPayout', 'bComp', 'bDown', 'bYears', 'bRate', 'bTax'];
    var el = {}, ok = true;
    ids.forEach(function (i) { el[i] = $(i); if (!el[i]) ok = false; });
    if (!ok) return;

    function calc() {
      var profit = +el.bProfit.value * 1000;
      var mult = +el.bMult.value;
      var stake = +el.bStake.value;
      var disc = +el.bDisc.value;
      var payout = +el.bPayout.value;
      var comp = +el.bComp.value * 1000;
      var down = +el.bDown.value * 1000;
      var years = +el.bYears.value;
      var rate = +el.bRate.value;
      var tax = +el.bTax.value;

      var ev = profit * mult;
      var price = ev * (stake / 100) * (1 - disc / 100);
      var financed = Math.max(0, price - down);
      var r = rate / 100 / 12, n = years * 12;
      var debt = financed > 0 ? ((financed * r) / (1 - Math.pow(1 + r, -n))) * 12 : 0;

      var k1 = profit * (stake / 100);
      var dist = k1 * (payout / 100);
      var owed = k1 * (tax / 100);
      var net = dist - owed;
      var gap = owed - dist;
      var swing = net - debt;

      set('bProfitOut', money(profit));
      set('bMultOut', mult.toFixed(1) + '\u00D7');
      set('bStakeOut', stake + '%');
      set('bDiscOut', disc + '%');
      set('bPayoutOut', payout + '%');
      set('bCompOut', money(comp));
      set('bDownOut', money(down));
      set('bYearsOut', years + ' yrs');
      set('bRateOut', rate.toFixed(2) + '%');
      set('bTaxOut', tax + '%');

      set('bEv', money(ev));
      set('bPrice', money(price));
      set('bDebt', '\u2212' + money(debt));
      set('bK1', money(k1));
      set('bDist', money(dist));
      set('bOwed', '\u2212' + money(owed));
      set('bNet', money(net));
      var sw = $('bSwing');
      if (sw) {
        sw.textContent = (swing >= 0 ? '+' : '\u2212') + money(Math.abs(swing));
        sw.style.color = swing >= 0 ? 'var(--gain)' : 'var(--drag)';
      }

      var warn = $('bWarn'), warnText = $('bWarnText');
      if (warn && warnText) {
        if (gap > 0) {
          warn.hidden = false;
          warnText.textContent = 'The firm would allocate you ' + money(k1) + ' of profit but distribute only ' +
            money(dist) + ' of it in cash. You would still owe roughly ' + money(owed) +
            ' in tax on the full allocation, leaving you ' + money(gap) +
            ' short before a single loan payment. The fix is a mandatory tax distribution written into the operating agreement. Ask for it now, while they want you to say yes.';
        } else {
          warn.hidden = true;
        }
      }

      var note = $('bNote');
      if (note) {
        if (swing < 0) {
          note.textContent = 'On these terms the stake does not pay for itself. You would fund about ' +
            money(Math.abs(swing)) + ' a year out of your own income. That is not a reason to walk away, but it is a reason to change the shape of the deal: a smaller first tranche, a longer term, seller financing below bank rates, or a profits interest that costs nothing today.';
        } else {
          note.textContent = 'On these terms the distributions cover the debt service with about ' +
            money(swing) + ' a year left over. Rare, and worth confirming the payout ratio is a policy rather than a good year.';
        }
      }
    }

    ids.forEach(function (i) {
      el[i].addEventListener('input', calc);
      el[i].addEventListener('change', calc);
    });

    bindNumberBox(el.bProfit, $('bProfitBox'), { scale: 1000, decimals: 0 });
    bindNumberBox(el.bMult, $('bMultBox'), { scale: 1, decimals: 1 });
    bindNumberBox(el.bStake, $('bStakeBox'), { scale: 1, decimals: 0 });
    bindNumberBox(el.bDisc, $('bDiscBox'), { scale: 1, decimals: 0 });
    bindNumberBox(el.bPayout, $('bPayoutBox'), { scale: 1, decimals: 0 });
    bindNumberBox(el.bComp, $('bCompBox'), { scale: 1000, decimals: 0 });
    bindNumberBox(el.bDown, $('bDownBox'), { scale: 1000, decimals: 0 });
    bindNumberBox(el.bYears, $('bYearsBox'), { scale: 1, decimals: 0 });
    bindNumberBox(el.bRate, $('bRateBox'), { scale: 1, decimals: 2 });
    bindNumberBox(el.bTax, $('bTaxBox'), { scale: 1, decimals: 0 });

    calc();
  })();

  /* ---------- contact form ---------- */
  var form = document.querySelector('form.book');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var s = $('sent');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

      fetch(form.action, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form)
      })
        .then(function (res) {
          if (!res.ok) throw new Error('send failed');
          if (s) s.style.display = 'block';
          form.reset();
        })
        .catch(function () {
          if (s) {
            s.textContent = 'Something went wrong sending that. Please email connorptcu@outlook.com directly.';
            s.style.display = 'block';
          }
        })
        .finally(function () {
          if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
        });
    });
  }
})();
