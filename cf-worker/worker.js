// Carry Forward — access gate backend.
// Deploy on Cloudflare Workers (free tier) with a KV namespace bound as `GATE`.
// Holds one value, GATE["current_hash"], the SHA-256 hash of the current access code.
//
// POST /verify  { password }         -> { ok: true|false }
// POST /request { email }            -> generates a new random code, stores its hash,
//                                        emails the plaintext code to the site owner, { ok: true }

var FORM_TARGET = 'https://formsubmit.co/ajax/connorptcu@outlook.com';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders()),
  });
}

async function sha256Hex(str) {
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

function randomCode(len) {
  len = len || 10;
  var bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(len / 2)));
  return Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('').slice(0, len);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    var url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/verify') {
      var verifyBody = await request.json().catch(function () { return {}; });
      if (typeof verifyBody.password !== 'string' || !verifyBody.password) return json({ ok: false }, 400);
      var hash = await sha256Hex(verifyBody.password);
      var current = await env.GATE.get('current_hash');
      return json({ ok: hash === current });
    }

    if (request.method === 'POST' && url.pathname === '/request') {
      var reqBody = await request.json().catch(function () { return {}; });
      if (typeof reqBody.email !== 'string' || reqBody.email.indexOf('@') === -1) return json({ ok: false }, 400);

      var code = randomCode(10);
      var newHash = await sha256Hex(code);
      await env.GATE.put('current_hash', newHash);

      await fetch(FORM_TARGET, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          _subject: 'Site access request',
          'Requester email': reqBody.email,
          'New access code': code,
        }),
      }).catch(function () {});

      return json({ ok: true });
    }

    return json({ ok: false, error: 'not found' }, 404);
  },
};
