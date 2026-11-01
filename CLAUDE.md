# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Static marketing site plus client-facing financial calculators for "Carry Forward", an advisory practice that helps wealth-management firm owners plan succession and sale. There is no build step, package manager, test suite, or linter. Files are hand-edited and served as-is. The repo has no hosting config. As of 2026-10-31, GitHub Pages publishes `main` at `https://connorptcu-design.github.io/car/` with no sign-in (the repo's Deployments list only `github-pages`), and the GitHub repo is public, so anything committed here can be read by anyone. Cloudflare Access is set up in the Cloudflare dashboard and only protects a hostname that Cloudflare fronts; nothing in the repo says which one.

To preview locally, serve the repo root with any static server (e.g. `python -m http.server`) and open `index.html`. Opening files via `file://` also works except for the contact form and the unpkg React CDN, which need network.

## Architecture

**Marketing pages** (`index.html`, `about.html`, `founders.html`, `how-we-work.html`, `successors.html`, `tools.html`) share `assets/site.css` and `assets/site.js`. Header/footer/nav markup is copy-pasted into each page; a nav change must be made in every file. `site.js` is a single IIFE that feature-detects by element ID, so it is safe to load on every page. It drives the nav burger, current-page highlight, the two inline calculators (the "practice estimate" on `index.html` and the "buy-in calculator" on `successors.html`), and the AJAX contact form (posts JSON to `FORM_ENDPOINT`, the Formspree form URL; if it ever holds `REPLACE_ME` again the form refuses to send).

**Tools** (`tools/readiness.html`, `tools/practice-value.html`, `tools/buy-in.html`) are separate, large single-file React 18 apps loaded from unpkg UMD. There is no JSX source and no build: the `<script>` blocks are already compiled output (`React.createElement(...)` with `/*#__PURE__*/` markers). Edit the `createElement` code directly; there is nothing to recompile. Each mounts into `#root` at the bottom of the file. They do not use `site.js` and carry their own inline styles. Each has Save scenario and Load scenario buttons (a JSON file on the user's own computer, validated against the tool's own control ranges): the shared helpers and a `SCENARIO_FIELDS` list sit at the top of each tool's script, so a new or renamed input must be added to that list.

**Private access**
- Intended access model: the marketing pages, `signin.html` and `request.html` are public. Cloudflare Access should cover only `/portal*`, `/tools/*` and `/c/*` (not `/tools`, which is the public marketing page). The Access rules live in the Cloudflare dashboard, not in this repo.
- `signin.html`: public front door linked from the "Portal" nav item on every marketing page (never link the nav straight to `portal.html`). Two cards: "Sign in" (filled button to `portal.html`, where Access asks for the emailed code) and "Get access" (outline button to `request.html`). Keep the two buttons' labels and styles different. The "← Portal" link inside the tool pages is a back link for signed-in users and still goes to `portal.html`.
- `portal.html`: advisor portal, links to the three tools. Protected by Cloudflare Access (emailed one-time code); its sign-out link is `/cdn-cgi/access/logout`. The earlier browser-side password gates were removed (see git log), so do not reintroduce client-side gating.
- `request.html`: public, self-contained page (inline CSS and script, nothing loaded from the rest of the site; it links only to `signin.html` and `index.html`) for requesting portal access. It must not look like a login: no password field and no "Sign in" button. It posts to the same `FORM_ENDPOINT` value with `source=portal-request`; keep that value in step with `assets/site.js`. On success the confirmation replaces the form. It must stay outside the paths Cloudflare Access protects.
- `c/_template.html` + `new-client.sh`: per-client private workspaces. `./new-client.sh "Client Name"` creates `c/<24 hex chars>/index.html` from the template (replacing `CLIENT_NAME`); the unguessable folder name is the only protection, so do not commit a directory listing or link to `c/` from public pages. Because the GitHub repo is public, never commit the generated `c/<24 hex chars>/` folders either: they would publish the folder name and the client's name. `c/` currently holds only `_template.html`. The script prints a `YOURDOMAIN.com` placeholder URL. `sed` is used for substitution, so names containing `/` or `&` will break it.
- `robots.txt` disallows everything and pages carry `noindex`.
- `cf-worker/worker.js`: Cloudflare Worker (KV namespace `GATE`) for the old emailed-access-code gate. Nothing in the site calls it anymore; treat it as legacy and deployed separately from this repo.

## Per-user saved values

- `functions/api/state.js` is a Cloudflare Pages Function (`/api/state`). It reads the signed-in email only from a verified Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`, checked against the team's certs, issuer and the Client portal app's AUD tag) and stores one JSON row per email per tool in D1 (`db/schema.sql`). Needs the Pages bindings `DB` (D1), `TEAM_DOMAIN` and `POLICY_AUD`, and `/api/*` must be a destination of the Client portal Access app. It does not run on the GitHub Pages copy.
- `assets/cf-save.js` is loaded by every tool page. `CFSave.connect()` (used by `tools/capacity.html`) saves explicit state; `CFSave.autoDOM()` (used by the three compiled React tools) remembers inputs by aria-label and restores them as they render. If `/api/state` is unreachable it falls back to localStorage and says so in its status pill.
- `tools/capacity.html` is plain JS (no React), styled with `assets/site.css`.

## Valuation logic is duplicated, not shared

The same valuation model (owner-adjusted EBITDA → size-tiered base multiple → quality adjustments → clamped to 3.0x–14.0x) is reimplemented in three places and the copies are not wired together:

- `assets/site.js`: `ebitdaBase()` / `qualityFactor()` for the homepage estimate
- `tools/practice-value.html`: `ebitdaBase` arrow function near the top of the script
- `tools/readiness.html`: the `base` if/else ladder and `qualityFactor` inside the `econ` `useMemo` (its quality factor is derived from the readiness score, not the same formula as `site.js`)

The tier thresholds (4.75 at under $250k up to 10.5 above $12M) must be changed in all three. `readiness.html` works in $ thousands while the others use dollars. The comment in `site.js` claiming the models "cannot drift apart" is aspirational; check all copies when touching valuation numbers. Helpers like `clamp`, `commas`, and money formatting are likewise redefined per file.

## Conventions

- Plain ES5-style JS in `site.js` (`var`, function expressions, no modules). The compiled tool pages use ES6 inside the script but no imports.
- Design tokens (navy/gold palette, serif/sans stacks) live in `:root` in `assets/site.css`; use the CSS variables rather than literal colors.
- Copy is deliberately framed as "estimates and planning frameworks, not appraisals, and not tax, legal or investment advice"; keep that disclaimer in the footer of any new page.
- The business email is `connor@carryforwardpartners.com` (Microsoft 365). It appears in every page footer, under the homepage contact form, and in the contact form's fallback error text in `assets/site.js`. Never put the owner's personal address on a public page. Both forms carry a hidden `company` honeypot and a hidden `source` field.
- The Formspree URL appears in four places that must stay identical: `FORM_ENDPOINT` in `assets/site.js`, `FORM_ENDPOINT` in `request.html`, and the `action` attribute of the `<form>` in `index.html` and in `request.html`. The script handles the submit itself, so `action` only matters when scripts do not run (without it the form would post to the page itself and go nowhere).
- Use relative links (`request.html`), not root-relative ones (`/request.html`): the GitHub Pages copy lives under `/car/`, so root-relative links break there.
