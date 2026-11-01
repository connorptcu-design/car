// Cloudflare Pages Function: per-user saved tool data.
//
//   GET    /api/state              -> { email, items: [{ tool, updated_at }] }
//   GET    /api/state?tool=<id>    -> { email, tool, data, updated_at }   (data null if nothing saved)
//   PUT    /api/state?tool=<id>    body: { data: <any JSON> }  -> { ok, updated_at }
//   DELETE /api/state?tool=<id>    -> { ok }
//
// Who the user is comes ONLY from the Cloudflare Access JWT (Cf-Access-Jwt-Assertion),
// verified here against the team's public keys, issuer and the application's AUD tag.
// /api/* must be a destination of the "Client portal" Access application.
//
// Bindings (Pages project -> Settings):
//   DB           D1 database binding (run schema.sql once)
//   TEAM_DOMAIN  e.g. rough-shape-172b.cloudflareaccess.com   (plain-text variable)
//   POLICY_AUD   the Client portal application's Audience (AUD) tag (plain-text variable)

const MAX_BYTES = 200 * 1024;
const TOOL_RE = /^[a-z0-9-]{1,40}$/;

let certCache = { at: 0, keys: null };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function b64urlBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlJSON(s) {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
}

async function accessKeys(team, force) {
  if (!force && certCache.keys && Date.now() - certCache.at < 60 * 60 * 1000) return certCache.keys;
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error('Could not fetch Access certs');
  const { keys } = await r.json();
  certCache = { at: Date.now(), keys };
  return keys;
}

// Returns the verified, lower-cased email, or null.
async function verifiedEmail(request, env) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !env.TEAM_DOMAIN || !env.POLICY_AUD) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;

  let header, payload;
  try { header = b64urlJSON(h); payload = b64urlJSON(p); } catch { return null; }
  if (header.alg !== 'RS256') return null;

  let keys = await accessKeys(env.TEAM_DOMAIN, false);
  let jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) { keys = await accessKeys(env.TEAM_DOMAIN, true); jwk = keys.find(k => k.kid === header.kid); }
  if (!jwk) return null;

  const key = await crypto.subtle.importKey(
    'jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, b64urlBytes(s), new TextEncoder().encode(`${h}.${p}`)
  );
  if (!ok) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) return null;
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return null;
  if (payload.iss !== `https://${env.TEAM_DOMAIN}`) return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.POLICY_AUD)) return null;

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  return email || null;
}

export async function onRequest({ request, env }) {
  let email;
  try { email = await verifiedEmail(request, env); }
  catch { return json({ error: 'auth_unavailable' }, 503); }
  if (!email) return json({ error: 'not_signed_in' }, 401);
  if (!env.DB) return json({ error: 'storage_not_configured' }, 503);

  const url = new URL(request.url);
  const tool = url.searchParams.get('tool');
  if (tool !== null && !TOOL_RE.test(tool)) return json({ error: 'bad_tool' }, 400);

  const method = request.method.toUpperCase();

  if (method === 'GET' && tool === null) {
    const { results } = await env.DB
      .prepare('SELECT tool, updated_at FROM tool_state WHERE email = ? ORDER BY updated_at DESC')
      .bind(email).all();
    return json({ email, items: results || [] });
  }

  if (tool === null) return json({ error: 'tool_required' }, 400);

  if (method === 'GET') {
    const row = await env.DB
      .prepare('SELECT data, updated_at FROM tool_state WHERE email = ? AND tool = ?')
      .bind(email, tool).first();
    return json({ email, tool, data: row ? JSON.parse(row.data) : null, updated_at: row ? row.updated_at : null });
  }

  if (method === 'PUT') {
    // Same-origin JSON only: blocks simple cross-site form posts.
    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return json({ error: 'json_required' }, 415);
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: 'bad_origin' }, 403);

    const text = await request.text();
    if (text.length > MAX_BYTES) return json({ error: 'too_large' }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: 'bad_json' }, 400); }
    if (!body || typeof body !== 'object' || !('data' in body)) return json({ error: 'data_required' }, 400);

    const updated = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO tool_state (email, tool, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (email, tool) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    ).bind(email, tool, JSON.stringify(body.data), updated).run();
    return json({ ok: true, updated_at: updated });
  }

  if (method === 'DELETE') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: 'bad_origin' }, 403);
    await env.DB.prepare('DELETE FROM tool_state WHERE email = ? AND tool = ?').bind(email, tool).run();
    return json({ ok: true });
  }

  return json({ error: 'method_not_allowed' }, 405);
}
