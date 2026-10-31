(function () {
  'use strict';

  /* ---------- helpers ---------- */
  // Owner-adjusted EBITDA multiple by the dollar size of earnings. Shared with the
  // practice-value and readiness models so the three tools cannot drift apart.
  function ebitdaBase(e) {
    if (e < 250000) return 4.75;
    if (e < 400000) return 5.25;
    if (e < 750000) return 6.00;
    if (e < 1500000) return 7.00;
    if (e < 3000000) return 7.75;
    if (e < 6000000) return 8.50;
    if (e < 12000000) return 9.50;
    return 10.50;
  }
  function qualityFactor(points) { return clamp(1 + points * 0.11, 0.76, 1.24); }

  // sign goes before the dollar sign, and values just under a million roll up to $1.00M
  function money(v) {
    var a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 999500) { var m = a / 1e6; return s + '$' + m.toFixed(m >= 9.995 ? 1 : 2) + 'M'; }
    if (a >= 1e3) return s + '$' + Math.round(a / 1e3) + 'k';
    var r = Math.round(a);
    return (r === 0 ? '' : s) + '$' + r;
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

  /* log-scaled slider helpers: a wide range (e.g. $150k to $50M) on a linear
     track buries the range most practices live in, so position is mapped
     geometrically and the landed value rounded to two significant figures */
  function niceStep(v) {
    if (!isFinite(v) || v <= 0) return v;
    var mag = Math.pow(10, Math.floor(Math.log(v) / Math.LN10) - 1);
    var stepSize = mag < 1 ? 1 : mag;
    return Math.round(v / stepSize) * stepSize;
  }
  function logVal(pos, lo, hi) { return niceStep(lo * Math.pow(hi / lo, pos / 1000)); }
  function logPos(val, lo, hi) {
    return 1000 * Math.log(clamp(val, lo, hi) / lo) / Math.log(hi / lo);
  }

  /* a value typed between slider steps is kept exactly (opts.exactRange) until
     the slider itself moves, so a log-scaled slider does not snap it to two
     significant figures and shift it across a pricing tier */
  function sliderVal(slider, fallback) {
    return slider._exact != null && slider._exactPos === +slider.value ? slider._exact : fallback;
  }

  /* pairs a slider with a typed-number box: box mirrors slider on drag,
     and commits back to the slider (clamped) on Enter or blur */
  function bindNumberBox(slider, box, opts) {
    if (!slider || !box) return;
    var scale = (opts && opts.scale) || 1;
    var decimals = (opts && opts.decimals) || 0;
    var toVal = (opts && opts.toVal) || function (p) { return p; };
    var toPos = (opts && opts.toPos) || function (v) { return v; };
    var exactRange = opts && opts.exactRange;

    function display(raw) {
      return decimals > 0 ? raw.toFixed(decimals) : commas(raw);
    }
    function sync() {
      box.value = display(sliderVal(slider, toVal(+slider.value)) * scale);
    }
    function commit() {
      var parsed = parseMessyNumber(box.value);
      if (isNaN(parsed)) { sync(); return; }
      slider.value = clamp(toPos(parsed / scale), +slider.min, +slider.max);
      if (exactRange) {
        slider._exact = clamp(parsed / scale, exactRange[0], exactRange[1]);
        slider._exactPos = +slider.value;
      }
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
    var REV_LO = 150, REV_HI = 50000; // $ thousands, log-scaled track
    var ids = ['rev', 'margin', 'fee', 'age', 'grow', 'team', 'struct'];
    var el = {}, ok = true;
    ids.forEach(function (i) { el[i] = $(i); if (!el[i]) ok = false; });
    if (!ok) return;

    function calc() {
      var rev = sliderVal(el.rev, logVal(+el.rev.value, REV_LO, REV_HI)) * 1000;
      var margin = +el.margin.value / 100;
      var fee = +el.fee.value, age = +el.age.value, grow = +el.grow.value;
      var team = +el.team.value, struct = +el.struct.value;

      // Priced on owner-adjusted profit, the way buyers actually price practices.
      // The revenue multiple is reported as an output, never used as an input.
      var ebitda = rev * margin;

      // with no owner-adjusted profit there is nothing to price, so show that instead of a $0 range
      if (ebitda <= 0) {
        ['range', 'multOut', 'ebitdaOut', 'keyPerson', 'prepared', 'delta'].forEach(function (id) { set(id, '—'); });
        set('ebitdaVal', money(0));
        var bf0 = $('bigFirmNote'); if (bf0) bf0.style.display = 'none';
        var vb0 = $('verdict'), vt0 = $('verdictText');
        if (vb0 && vt0) {
          vb0.textContent = 'No owner-adjusted profit to price';
          vt0.textContent = 'This estimate prices owner-adjusted profit, so there is no value to show at a 0% margin. Raise the margin to see a range.';
        }
        return;
      }
      var base = ebitdaBase(ebitda);

      var mixAdj = clamp((fee - 65) * 0.014, -0.55, 0.55);
      var ageAdj = clamp((61 - age) * 0.035, -0.50, 0.50);
      var grwAdj = clamp((grow - 5) * 0.055, -0.45, 0.45);
      var pts = mixAdj + ageAdj + grwAdj + team;

      var mult = clamp(base * struct * qualityFactor(pts), 3.0, 14.0);
      var val = ebitda * mult;
      var revMult = rev > 0 ? val / rev : 0;

      // the same earnings inside a firm that has done the work: ensemble structure, a real G2
      var prepMult = clamp(base * Math.max(struct, 1.0) * qualityFactor(mixAdj + ageAdj + grwAdj + 0.35), 3.0, 14.0);
      var prepared = ebitda * prepMult;
      var lonely = team < 0 ? 0.72 : team === 0 ? 0.55 : 0.30;

      set('revOut', money(rev));
      set('feeOut', fee + '%');
      set('ageOut', age);
      set('growOut', grow + '%');
      set('range', money(val * 0.89) + ' to ' + money(val * 1.11));
      var mo = $('multOut'); if (mo) mo.innerHTML = revMult.toFixed(2) + '&times;';
      var eo = $('ebitdaOut'); if (eo) eo.innerHTML = mult.toFixed(1) + '&times;';
      set('ebitdaVal', money(ebitda));
      set('keyPerson', money(rev * lonely));
      set('prepared', money(prepared));
      var d = prepared - val;
      set('delta', (d >= 0 ? '+' : '') + money(d));

      var bfn = $('bigFirmNote');
      if (bfn) bfn.style.display = rev >= 5000000 ? 'block' : 'none';

      var vb = $('verdict'), vt = $('verdictText');
      if (!vb || !vt) return;
      if (team < 0) {
        vb.textContent = 'Much of the value rests on one advisor';
        vt.textContent = 'Team structure is one of the larger inputs in this estimate. A buyer prices a practice on what survives the founder, and with one advisor the answer may be limited. Moving relationships can take an estimated 18 to 36 months, so a useful next step is to identify which client relationships a second advisor could begin to lead.';
      } else if (fee < 55) {
        vb.textContent = 'A smaller share of revenue recurs each year';
        vt.textContent = 'Buyers typically place the most value on recurring revenue and treat the rest as dependent on your continued effort. This is often one of the faster levers to improve, so a useful next step is to review which revenue could move to a recurring fee.';
      } else if (age > 70) {
        vb.textContent = 'The client base is older';
        vt.textContent = 'A buyer typically models the assets still there in 10 years, not only those on today\u2019s statement. Households that are drawing down are generally worth less than households still accumulating, whatever the quality of service. A useful next step is to check how many households are drawing down and whether younger family members are clients.';
      } else if (grow < 2) {
        vb.textContent = 'Slow growth lowers the multiple';
        vt.textContent = 'Buyers tend to price growing practices as businesses and flat ones as run-off, and that difference can account for much of the multiple. Growth that cannot be traced to a repeatable source typically earns little credit, so a useful next step is to identify where new clients come from.';
      } else {
        vb.textContent = 'No single input stands out as a weakness';
        vt.textContent = 'On these inputs, the open questions are more likely timing and structure than repair: which path you take, what it nets after tax, and whether an internal buyer could finance it. Those are the questions to work through next.';
      }
    }

    ids.forEach(function (i) {
      el[i].addEventListener('input', calc);
      el[i].addEventListener('change', calc);
    });

    bindNumberBox(el.rev, $('revBox'), { scale: 1000, decimals: 0, exactRange: [REV_LO, REV_HI],
      toVal: function (p) { return logVal(p, REV_LO, REV_HI); },
      toPos: function (v) { return logPos(v, REV_LO, REV_HI); } });
    bindNumberBox(el.margin, $('marginBox'), { scale: 1, decimals: 0 });
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
      set('bDebt', debt > 0 ? '\u2212' + money(debt) : money(0));
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
          warnText.textContent = 'In this scenario the firm would allocate you ' + money(k1) + ' of profit but distribute only ' +
            money(dist) + ' of it in cash. You would still owe roughly ' + money(owed) +
            ' in tax on the full allocation, leaving you ' + money(gap) +
            ' short before any loan payment. A mandatory tax distribution written into the operating agreement is a common way to address this, and it is easier to negotiate before you accept the offer than after.';
        } else {
          warn.hidden = true;
        }
      }

      // compensation and the tax rate give the estimated take-home pay, so the yearly effect can be read against it
      var takeHome = comp * (1 - tax / 100);
      var share = takeHome > 0 ? Math.round(Math.abs(swing) / takeHome * 100) : 0;

      var note = $('bNote');
      if (note) {
        if (swing < 0) {
          note.textContent = 'On these terms the stake would not cover its own payments. You would fund about ' +
            money(Math.abs(swing)) + ' a year out of your own income, roughly ' + share + '% of your estimated take-home pay of ' +
            money(takeHome) + '. That does not mean the deal cannot work, but the structure may need to change. Options to examine are a smaller first tranche, a longer term, seller financing below bank rates or a profits interest that requires no cash up front.';
        } else {
          note.textContent = 'On these terms the distributions, after tax on the allocation, cover the debt service with about ' +
            money(swing) + ' a year left over, which would add roughly ' + share + '% to your estimated take-home pay of ' +
            money(takeHome) + '. Before relying on that, confirm that the payout ratio is a firm policy rather than the result of one strong year.';
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
            s.textContent = 'Your message did not send. Please email connorptcu@outlook.com directly.';
            s.style.display = 'block';
          }
        })
        .finally(function () {
          if (btn) { btn.disabled = false; btn.textContent = 'Send an Inquiry'; }
        });
    });
  }
})();
